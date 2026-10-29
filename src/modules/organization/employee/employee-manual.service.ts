import { Injectable } from '@nestjs/common';
import { BusinessDate, businessDateAt } from '../../../core/business-date';
import { normalizeDisplayName } from '../../../core/display-name';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import type { HrBasis } from '../../../core/hr-basis';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { EmployeeCodeTakenError, EmployeeEmailTakenError } from '../public/organization.errors';
import { EmployeeRowInvalidError } from './employee.errors';
import { assertMayEnterEmployees } from './employee.policy';
import { validateEmployeeRow } from './employee-row.policy';
import { organizationAuditEvent } from '../mappers/audit-event.mapper';
import { OrganizationApi } from '../public/organization.api';
import { EmploymentType } from '../public/organization.types';

/** What the form sends. The department is named by its code, like the import file column (`FR-9.7`); the job title is optional free text. */
export interface ManualEmployeeInput {
  employeeCode: string;
  fullName: string;
  workEmail?: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  departmentCode?: string | null;
  /** Free text (`QĐ-87e`): its display form is stored on the person. */
  jobTitle?: string | null;
  /** The HR document the record is entered on (`US-02-02` AC-16). */
  hrBasis: HrBasis;
}

export interface ManualEmployeeView {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  status: 'ACTIVE';
  /** A person just entered works. */
  workState: 'WORKING';
  /** The day the person became a member of the department: the day they were recorded, not the hire date. */
  memberSince: BusinessDate;
  department: { id: string; code: string; name: string };
  jobTitle: string | null;
}

/**
 * Entering one person by hand (`US-02-02` AC-14, `QĐ-67d`, `QĐ-82i`): the Employee and its single placement, in one
 * transaction, on the HR document the caller cites, and nothing else but the in-app notices a new record owes (AC-17, `F17`): the head of
 * the department and the IT Admin in charge are told, in the same transaction. It creates no account, role, invitation or mail; giving the
 * person a login is a separate step. Whoever enters is never the person entered (AC-18). The Super Admin alone enters people:
 * `employee.policy.ts` says so before anything is read.
 */
@Injectable()
export class EmployeeManualService {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly notifications: NotificationsApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws EmployeeForbiddenError, EmployeeRowInvalidError carrying every reason (T-16), or TransientDatabaseError. `now` is the moment of
   * the entry; it is a parameter so a test can fix the clock, and it defaults to the database clock of the transaction.
   */
  async create(actor: AuthenticatedPrincipal, input: ManualEmployeeInput, now?: Date): Promise<ManualEmployeeView> {
    assertMayEnterEmployees(actor.roles);
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('An employee was entered before installation');
    try {
      return await this.runner.run(async (tx) => {
        // The day the person is recorded, in the organization's own calendar (T-14), whatever hire date was typed.
        // Taken inside the transaction from the database clock, the same instant `created_at` will carry, unless a
        // test fixed the clock.
        const memberSince = businessDateAt(
          now ?? (await this.organization.employeeRecordingInstant(tx)),
          organization.timeZone,
        );
        // Lock order (T-11): the department, then the employee rows that get written.
        const departmentCode = input.departmentCode?.trim() ?? '';
        const department = departmentCode
          ? await this.organization.lockDepartmentForEntry(tx, organization.id, departmentCode)
          : null;
        const jobTitle = normalizeDisplayName(input.jobTitle ?? '') || null;
        const workEmail = input.workEmail?.trim() || null;
        const normalizedEmail = workEmail === null ? null : this.normalize(workEmail);
        // Nobody enters their own record (`US-02-02` AC-18): the one place the Super Admin's record is read.
        const own = await this.organization.getEmployee(actor.employeeId, tx);
        const ownCode = own !== null && own.employeeCode === input.employeeCode;
        const ownEmail =
          own?.workEmail != null && normalizedEmail !== null && this.normalize(own.workEmail) === normalizedEmail;

        const reasons = validateEmployeeRow(
          { departmentCode, jobTitle },
          {
            department,
            employeeCodeTaken: await this.organization.isEmployeeCodeTaken(tx, organization.id, input.employeeCode),
            workEmailTaken:
              normalizedEmail !== null &&
              (await this.organization.isWorkEmailTaken(tx, organization.id, normalizedEmail)),
            ownCode,
            ownEmail,
          },
        );
        if (reasons.length > 0 || !department) throw new EmployeeRowInvalidError(reasons);

        const { id } = await this.organization.createEmployeeWithPlacement(tx, {
          organizationId: organization.id,
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          workEmail,
          employmentType: input.employmentType,
          hireDate: input.hireDate,
          memberSince,
          departmentId: department.id,
          jobTitle,
        });
        await this.audit.record(
          tx,
          organizationAuditEvent(actor, organization.id, 'EMPLOYEE.CREATED', 'Employee', id, null, {
            employeeCode: input.employeeCode,
            fullName: input.fullName,
            workEmail,
            employmentType: input.employmentType,
            hireDate: input.hireDate,
            department: department.code,
            jobTitle,
            memberSince,
            hrBasis: { ...input.hrBasis },
          }),
        );
        const notices = await this.organization.getProfileNotices(tx, {
          kind: 'CREATED',
          organizationId: organization.id,
          employeeId: id,
          onDate: memberSince,
        });
        for (const notice of notices) await this.notifications.notifyInApp(tx, notice);

        return {
          id,
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          workEmail,
          employmentType: input.employmentType,
          hireDate: input.hireDate,
          status: 'ACTIVE' as const,
          workState: 'WORKING' as const,
          memberSince,
          department: { id: department.id, code: department.code, name: department.name },
          jobTitle,
        };
      });
    } catch (error) {
      // A concurrent entry won the unique key after the checks above: the same answer the checks give.
      if (error instanceof EmployeeCodeTakenError) {
        throw new EmployeeRowInvalidError([{ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' }]);
      }
      if (error instanceof EmployeeEmailTakenError) {
        throw new EmployeeRowInvalidError([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
      }
      throw error;
    }
  }

  /** The form already checked the shape; an address that still cannot be normalized cannot be taken by anyone. */
  private normalize(workEmail: string): string | null {
    try {
      return normalizeEmail(workEmail);
    } catch (error) {
      if (error instanceof InvalidEmailError) return null;
      throw error;
    }
  }
}
