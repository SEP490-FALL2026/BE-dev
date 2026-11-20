import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { organizationAuditEvent } from '../organization-audit-event.mapper';
import {
  EmployeeEmailTakenError,
  EmployeeNotFoundError,
  EmployeeOpenSeatNeedsEndError,
} from '../public/organization.errors';
import { OrganizationContextService } from '../organization-context.service';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import type { EmployeeRecord } from '../public/organization.types';
import { EmployeeWorkState, EmploymentType } from '../public/organization.types';
import { EmployeeRowInvalidError, EmployeeUpdateEmptyError } from './employee.errors';
import { correctionOf, OFFICIAL_FIELDS, workEmailToCheck, type Correction } from './employee-correction.policy';
import { assertMayCorrectEmployee } from './employee.policy';

/** The official fields of a record that the Super Admin may correct, with no HR basis to give (`QĐ-82m`, `QĐ-87a`, `QĐ-93f`); nothing else is here. */
export interface OfficialFieldsInput {
  fullName?: string;
  workEmail?: string | null;
  employmentType?: EmploymentType;
  hireDate?: BusinessDate;
  /** The last day of the contract of a person with a term (R-38, `INV-07`); null clears it; staff has none. */
  contractEndDate?: BusinessDate | null;
  /** Free text (`QĐ-87e`); null or blank clears it. */
  jobTitle?: string | null;
}

export interface MaintainedEmployeeView {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  contractEndDate: BusinessDate | null;
  jobTitle: string | null;
  status: 'ACTIVE' | 'TERMINATED';
  workState: EmployeeWorkState;
}

/**
 * Correcting the official fields of a record that exists (`US-02-02` AC-19, `QĐ-82m` `INF-20`, `QĐ-87a`): name, work email, kind
 * of staff, free-text job title and a hire date that has not come yet, with no HR basis to give (`QĐ-93f`), by the Super Admin alone and never on
 * the Super Admin's own record (`QĐ-87c`: that goes through the controlled procedure, so this refuses with 403 and writes
 * nothing). The department and the status are events with a day they take effect (`US-03-01`) and are never changed here; neither
 * are the account or its roles; the login email is not asked for but follows a new work email (`followWorkEmail`). The person, and the head of their department, are told in the same
 * transaction (`QĐ-87b(3)`). Who may is `employee.policy.ts`, run first.
 */
@Injectable()
export class EmployeeMaintenanceService {
  constructor(
    private readonly context: OrganizationContextService,
    private readonly employees: EmployeeRecordService,
    private readonly audit: AuditApi,
    private readonly notifications: NotificationsApi,
    private readonly employeeAccounts: EmployeeAccountsHook,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws EmployeeForbiddenError, EmployeeSelfChangeForbiddenError, EmployeeNotFoundError, EmployeeUpdateEmptyError or
   * EmployeeRowInvalidError. `actor` is a plain principal: the controlled procedure of the Super Admin as subject calls the same
   * correction with an actor of its own, and the policy is the one place that says who may.
   */
  async update(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    input: OfficialFieldsInput,
  ): Promise<MaintainedEmployeeView> {
    assertMayCorrectEmployee(actor, employeeId);
    if (OFFICIAL_FIELDS.every((field) => input[field] === undefined)) throw new EmployeeUpdateEmptyError();
    const organization = await this.context.findOrganization();
    if (!organization) throw new Error('An employee was changed before installation');
    const today = await this.context.businessToday();

    try {
      return await this.runner.run((tx) =>
        this.correct(tx, { actor, organizationId: organization.id, employeeId, today }, input),
      );
    } catch (error) {
      // A concurrent change won the unique email after the check: the same answer the check gives.
      if (error instanceof EmployeeEmailTakenError) {
        throw new EmployeeRowInvalidError([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
      }
      // Another account logs in with the new address and the unique index won the race after the check.
      if (isUniqueViolation(error, 'normalized_login_email')) {
        throw new EmployeeRowInvalidError([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
      }
      // A contractor, freelancer or intern holds every open seat with an expected end (INV-07): PostgreSQL
      // refuses the change of kind, the transaction rolls back and no audit is written.
      if (error instanceof EmployeeOpenSeatNeedsEndError) {
        throw new EmployeeRowInvalidError([{ field: 'employmentType', code: 'OPEN_ASSIGNMENT_NEEDS_EXPECTED_END' }]);
      }
      throw error;
    }
  }

  private async correct(
    tx: DbTx,
    who: { actor: AuthenticatedPrincipal; organizationId: string; employeeId: string; today: BusinessDate },
    input: OfficialFieldsInput,
  ): Promise<MaintainedEmployeeView> {
    await this.employees.lock(tx, who.employeeId, 'UPDATE');
    const current = await this.employees.find(who.employeeId, tx);
    if (!current) throw new EmployeeNotFoundError(who.employeeId);

    // The normalized email differs from the person's own, so whoever has it is somebody else.
    const toCheck = workEmailToCheck(input.workEmail, current.workEmail);
    const workEmailTaken = toCheck !== null && (await this.employees.isWorkEmailTaken(tx, who.organizationId, toCheck));
    const correction = correctionOf(current, input, { today: who.today, workEmailTaken });
    if (correction.reasons.length > 0) throw new EmployeeRowInvalidError(correction.reasons);
    if (Object.keys(correction.changes).length > 0) await this.writeChanges(tx, who, current, correction);

    return viewOf(current, correction, input);
  }

  /** The columns, the audit entry and the notices of a correction that changes something, in one transaction. */
  private async writeChanges(
    tx: DbTx,
    who: { actor: AuthenticatedPrincipal; organizationId: string; employeeId: string; today: BusinessDate },
    current: EmployeeRecord,
    correction: Correction,
  ): Promise<void> {
    // The account of the person logs in with the work email (`POST /app-users`): a new work email moves it in the same transaction,
    // and clearing it is refused for a person who has an account (it cannot have no login email), before anything is written.
    const newWorkEmail = correction.changes.workEmail;
    if (newWorkEmail === null) {
      const followed = await this.employeeAccounts.get().followWorkEmail(tx, {
        actor: who.actor,
        organizationId: who.organizationId,
        employeeId: who.employeeId,
        workEmail: null,
      });
      if (followed === 'ACCOUNT_NEEDS_EMAIL') {
        throw new EmployeeRowInvalidError([{ field: 'workEmail', code: 'WORK_EMAIL_REQUIRED_FOR_ACCOUNT' }]);
      }
    }
    await this.employees.updateOfficialFields(tx, who.employeeId, correction.changes);
    if (newWorkEmail) {
      const followed = await this.employeeAccounts.get().followWorkEmail(tx, {
        actor: who.actor,
        organizationId: who.organizationId,
        employeeId: who.employeeId,
        workEmail: newWorkEmail,
      });
      if (followed === 'TAKEN') throw new EmployeeRowInvalidError([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
    }
    await this.audit.record(
      tx,
      organizationAuditEvent(
        who.actor,
        who.organizationId,
        'EMPLOYEE.OFFICIAL_FIELDS_CHANGED',
        'Employee',
        who.employeeId,
        { employeeCode: current.employeeCode, ...(correction.before as Record<string, string | null>) },
        { ...(correction.changes as Record<string, string | null>) },
      ),
    );
    const notices = await this.employees.profileNotices(tx, {
      kind: 'UPDATED',
      organizationId: who.organizationId,
      employeeId: who.employeeId,
      onDate: who.today,
    });
    for (const notice of notices) await this.notifications.notifyInApp(tx, notice);
  }
}

/** The record as the caller sees it after the correction: what changed, what was typed for the email, the rest as it was. */
function viewOf(current: EmployeeRecord, correction: Correction, input: OfficialFieldsInput): MaintainedEmployeeView {
  const { changes, typedWorkEmail } = correction;

  return {
    id: current.id,
    employeeCode: current.employeeCode,
    fullName: input.fullName ?? current.fullName,
    workEmail: typedWorkEmail === undefined ? current.workEmail : typedWorkEmail,
    employmentType: input.employmentType ?? current.employmentType,
    hireDate: changes.hireDate ?? current.hireDate,
    contractEndDate:
      'contractEndDate' in changes ? (changes.contractEndDate ?? null) : (current.contractEndDate ?? null),
    jobTitle: 'jobTitle' in changes ? (changes.jobTitle ?? null) : (current.jobTitle ?? null),
    status: current.status,
    workState: current.workState,
  };
}
