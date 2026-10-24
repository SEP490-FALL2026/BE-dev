import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import type { HrBasis } from '../../../core/hr-basis';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { organizationAuditEvent } from '../mappers/audit-event.mapper';
import { EmployeeEmailTakenError, EmployeeNotFoundError, EmployeeOpenSeatNeedsEndError } from '../organization.errors';
import { OrganizationService } from '../organization.service';
import { EmploymentType } from '../organization.types';
import {
  EmployeeAnotherItAdminNeededError,
  EmployeeRowInvalidError,
  EmployeeUpdateEmptyError,
} from './employee.errors';

/** The official fields of a record that an IT Admin may correct on an HR basis (`QĐ-82m`); nothing else is here. */
export interface OfficialFieldsInput {
  fullName?: string;
  workEmail?: string | null;
  employmentType?: EmploymentType;
  hireDate?: BusinessDate;
  hrBasis: HrBasis;
}

export interface MaintainedEmployeeView {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  status: 'ACTIVE' | 'TERMINATED';
}

const OFFICIAL = ['fullName', 'workEmail', 'employmentType', 'hireDate'] as const;
type Official = (typeof OFFICIAL)[number];

/**
 * Correcting the official fields of a record that exists (`US-02-02` AC-19, `QĐ-82m` `INF-20`): name, work email, kind
 * of staff and a hire date that has not come yet, always on an HR basis. The department, the title and the status are
 * events with a day they take effect (`US-03-01`) and are never changed here; neither are the account, its roles or the
 * login email (`FR-8.6`). Any IT Admin may do it; the audit says whether they are the one in charge of the person's
 * department. A record that is the IT Admin's own goes to another IT Admin when one can act (`SoD-5`, `QĐ-77m`).
 */
@Injectable()
export class EmployeeMaintenanceService {
  constructor(
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws EmployeeNotFoundError, EmployeeUpdateEmptyError, EmployeeAnotherItAdminNeededError or EmployeeRowInvalidError. */
  async update(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    input: OfficialFieldsInput,
  ): Promise<MaintainedEmployeeView> {
    if (OFFICIAL.every((field) => input[field] === undefined)) throw new EmployeeUpdateEmptyError();
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('An employee was changed before installation');
    const today = await this.organization.businessToday();
    const self = actor.employeeId === employeeId;
    if (self && (await this.identity.countUsableItAdminsExcept(actor.employeeId)) > 0) {
      throw new EmployeeAnotherItAdminNeededError();
    }
    const inCharge = await this.organization.getItAdminInCharge(employeeId, today);

    try {
      return await this.runner.run(async (tx) => {
        await this.organization.lockEmployeeForUpdate(tx, employeeId);
        const current = await this.organization.getEmployee(employeeId, tx);
        if (!current) throw new EmployeeNotFoundError(employeeId);

        const workEmail = input.workEmail === undefined ? undefined : input.workEmail?.trim() || null;
        const reasons: { field: string; code: string }[] = [];
        const changes: Partial<Record<Official, unknown>> = {};
        const before: Partial<Record<Official, unknown>> = {};
        const note = (field: Official, was: unknown, now: unknown) => {
          before[field] = was;
          changes[field] = now;
        };

        if (input.fullName !== undefined && input.fullName !== current.fullName)
          note('fullName', current.fullName, input.fullName);
        if (input.employmentType !== undefined && input.employmentType !== current.employmentType) {
          note('employmentType', current.employmentType, input.employmentType);
        }
        if (workEmail !== undefined && this.differs(workEmail, current.workEmail)) {
          // The normalized email differs from the person's own, so whoever has it is somebody else.
          const normalized = workEmail === null ? null : this.normalize(workEmail);
          if (normalized !== null && (await this.organization.isWorkEmailTaken(tx, organization.id, normalized))) {
            reasons.push({ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' });
          }
          note('workEmail', current.workEmail, workEmail);
        }
        if (input.hireDate !== undefined && input.hireDate !== current.hireDate) {
          if (current.hireDate <= today) reasons.push({ field: 'hireDate', code: 'HIRE_DATE_LOCKED' });
          else if (input.hireDate < today) reasons.push({ field: 'hireDate', code: 'HIRE_DATE_IN_PAST' });
          else note('hireDate', current.hireDate, input.hireDate);
        }
        if (reasons.length > 0) throw new EmployeeRowInvalidError(reasons);

        if (Object.keys(changes).length > 0) {
          await this.organization.updateEmployeeOfficialFields(tx, employeeId, {
            ...(changes.fullName !== undefined ? { fullName: changes.fullName as string } : {}),
            ...('workEmail' in changes ? { workEmail: changes.workEmail as string | null } : {}),
            ...(changes.employmentType !== undefined
              ? { employmentType: changes.employmentType as EmploymentType }
              : {}),
            ...(changes.hireDate !== undefined ? { hireDate: changes.hireDate as BusinessDate } : {}),
          });
          await this.audit.record(
            tx,
            organizationAuditEvent(
              actor,
              organization.id,
              'EMPLOYEE.OFFICIAL_FIELDS_CHANGED',
              'Employee',
              employeeId,
              { employeeCode: current.employeeCode, ...(before as Record<string, string | null>) },
              {
                ...(changes as Record<string, string | null>),
                hrBasis: { ...input.hrBasis },
                // Whether the person who did it is the IT Admin in charge of the department, or stood in for them.
                byItAdminInCharge: inCharge?.itAdminEmployeeId === actor.employeeId,
                selfExecuted: self,
              },
            ),
          );
        }

        return {
          id: employeeId,
          employeeCode: current.employeeCode,
          fullName: input.fullName ?? current.fullName,
          workEmail: workEmail === undefined ? current.workEmail : workEmail,
          employmentType: input.employmentType ?? current.employmentType,
          hireDate: 'hireDate' in changes ? (changes.hireDate as BusinessDate) : current.hireDate,
          status: current.status,
        };
      });
    } catch (error) {
      // A concurrent change won the unique email after the check: the same answer the check gives.
      if (error instanceof EmployeeEmailTakenError) {
        throw new EmployeeRowInvalidError([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
      }
      // A contractor, freelancer or intern holds every open seat with an expected end (INV-07, P28-04): PostgreSQL
      // refuses the change of kind, the transaction rolls back and no audit is written.
      if (error instanceof EmployeeOpenSeatNeedsEndError) {
        throw new EmployeeRowInvalidError([{ field: 'employmentType', code: 'OPEN_ASSIGNMENT_NEEDS_EXPECTED_END' }]);
      }
      throw error;
    }
  }

  /** Two emails are the same record when they normalize alike; the typed text is kept as it was written. */
  private differs(next: string | null, current: string | null): boolean {
    if (next === null || current === null) return next !== current;

    return next !== current && this.normalize(next) !== this.normalize(current);
  }

  private normalize(workEmail: string): string | null {
    try {
      return normalizeEmail(workEmail);
    } catch (error) {
      if (error instanceof InvalidEmailError) return null;
      throw error;
    }
  }
}
