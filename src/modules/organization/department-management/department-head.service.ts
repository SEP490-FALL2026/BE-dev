import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { organizationAuditEvent } from '../organization-audit-event.mapper';
import { OrganizationContextService } from '../organization-context.service';
import { DepartmentRecordService } from '../department/department-record.service';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { OrganizationChangeService } from '../change-announcement/organization-change.service';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import type { EmployeeRecord, NewOrganizationChange } from '../public/organization.types';
import {
  DepartmentInactiveError,
  DepartmentNotFoundError,
  DepartmentNotYetEffectiveError,
  HeadAssignmentError,
} from '../department/department.errors';
import { lockAndReadEmployee, requireOrganization } from './department-facts.service';
import { assertMayChangeOrganization, successorProblem } from '../department/department.policy';
import { DepartmentRepo } from '../department/department.repo';
import {
  DEPARTMENT_HEAD_HISTORY_LIMIT,
  type DepartmentRecord,
  HeadPeriodChanges,
} from '../department/department.types';
import { HeadPeriodRecord } from '../organization-structure.types';

/** The period in force on `day`, if any: periods are `[validFrom, validTo)`. */
const inForceOn = (periods: HeadPeriodRecord[], day: BusinessDate): HeadPeriodRecord | undefined =>
  periods.find((period) => period.validFrom <= day && (period.validTo === null || period.validTo > day));

/**
 * The periods that stopped being in force on `day`, as changes the modules that act on the organization are told of
 * (`FR-3.16`): those that ended that day, and those cancelled that began that same day or before, which were in force.
 */
const endedAsChanges = (
  room: Pick<HeadPeriodChanges, 'ended' | 'endedPeriodIds' | 'cancelled' | 'cancelledPeriodIds'>,
  departmentId: string,
  day: BusinessDate,
): (NewOrganizationChange & { kind: 'HEAD_PERIOD_END' })[] =>
  [
    ...room.ended.map((period, index) => ({ period, periodId: room.endedPeriodIds[index] })),
    ...room.cancelled.flatMap((period, index) =>
      period.validFrom <= day ? [{ period, periodId: room.cancelledPeriodIds[index] }] : [],
    ),
  ].map(({ period, periodId }) => ({
    kind: 'HEAD_PERIOD_END' as const,
    periodId,
    departmentId,
    headEmployeeId: period.employeeId,
    effectiveOn: day,
  }));

/**
 * Who heads a department (`US-03-06` AC-5 → AC-9, AC-18; `US-01-02`): the Super Admin names the head from a day, leaves the
 * department without one from a day, or names who is to follow the head and takes that back (`QĐ-87`), with no HR basis to
 * give (`QĐ-93f`): the Audit Trail records who, when, before and after. Each is an operation of its own, so a later flow (transfer, leaving) can reuse them; the head is the department's
 * MANAGER for exactly the days of the period. Who may do it is `department.policy.ts`, run first.
 */
@Injectable()
export class DepartmentHeadService {
  constructor(
    private readonly repo: DepartmentRepo,
    private readonly context: OrganizationContextService,
    private readonly departments: DepartmentRecordService,
    private readonly employees: EmployeeRecordService,
    private readonly changes: OrganizationChangeService,
    private readonly employeeAccounts: EmployeeAccountsHook,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Names the head of the department from `effectiveFrom` (today or later): the head before ends the day before,
   * so the two never overlap and on each day there is one head (AC-5). The person must be a member of this
   * department on that day (AC-18), must not hold the Super Admin role (AC-7), and must not have left (AC-8).
   * Naming the person who already heads it from that day changes nothing. A change for today takes effect in this
   * transaction, so the listeners of the organization are told of it here and not on a later pass (`US-05-12` AC-2). The notices
   * kept for the department while nobody headed it are handed over by the listener of `HEAD_PERIOD_START` when the period STARTS
   * (`held-notice-handover.listener.ts`): in this transaction for today, at the announcement of the day for a later day.
   */
  async assign(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    input: { employeeId: string; effectiveFrom: BusinessDate },
  ): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    const organization = await requireOrganization(this.context);
    const today = await this.context.businessToday();
    if (input.effectiveFrom < today) throw new HeadAssignmentError('DATE_IN_PAST');

    await this.runner.run(async (tx) => {
      // Lock order (protocol): the department, then the employee, then the account.
      const department = await this.lockActiveDepartment(tx, departmentId);
      // A head of a department made for next year starts on the day it takes effect, not before (`QĐ-104e(3)`).
      if (input.effectiveFrom < department.effectiveFrom) {
        throw new DepartmentNotYetEffectiveError(department.effectiveFrom);
      }
      const employee = await this.requireCandidate(tx, departmentId, input.employeeId, input.effectiveFrom);

      const periods = await this.departments.headHistory(tx, departmentId, DEPARTMENT_HEAD_HISTORY_LIMIT);
      const inForce = inForceOn(periods, input.effectiveFrom);
      const alreadyHead = inForce?.employeeId === input.employeeId && inForce.validTo === null;
      const laterPeriods = periods.some((period) => period.validFrom > input.effectiveFrom);
      if (alreadyHead && !laterPeriods) return;

      const room = await this.departments.endHeadPeriodsFrom(tx, departmentId, input.effectiveFrom);
      const started = await this.departments.startHeadPeriod(tx, {
        organizationId: organization.id,
        departmentId,
        employeeId: input.employeeId,
        validFrom: input.effectiveFrom,
      });
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'DEPARTMENT.HEAD_ASSIGNED',
          'Department',
          departmentId,
          { head: inForce?.employeeCode ?? null },
          {
            head: employee.employeeCode,
            effectiveFrom: input.effectiveFrom,
            endedPeriods: room.ended.length,
            cancelledPeriods: room.cancelled.map((period) => `${period.employeeCode}@${period.validFrom}`),
          },
        ),
      );
      if (input.effectiveFrom !== today) return;
      const stopped = endedAsChanges(room, departmentId, today);
      for (const change of stopped) await this.changes.emit(tx, change);
      await this.changes.emit(tx, {
        kind: 'HEAD_PERIOD_START',
        periodId: started.periodId,
        departmentId,
        headEmployeeId: input.employeeId,
        previousHeadEmployeeId: stopped[0]?.headEmployeeId ?? null,
        effectiveOn: today,
      });
    });
  }

  /** Records that nobody heads the department from `effectiveFrom` (AC-9). Nothing to end ⟹ nothing changes. */
  async vacate(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    input: { effectiveFrom: BusinessDate },
  ): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    const organization = await requireOrganization(this.context);
    const today = await this.context.businessToday();
    if (input.effectiveFrom < today) throw new HeadAssignmentError('DATE_IN_PAST');

    await this.runner.run(async (tx) => {
      const department = await this.repo.lock(tx, departmentId, 'UPDATE');
      if (!department) throw new DepartmentNotFoundError();

      const periods = await this.departments.headHistory(tx, departmentId, DEPARTMENT_HEAD_HISTORY_LIMIT);
      const inForce = inForceOn(periods, input.effectiveFrom);
      const room = await this.departments.endHeadPeriodsFrom(tx, departmentId, input.effectiveFrom);
      if (room.ended.length === 0 && room.cancelled.length === 0) return;

      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'DEPARTMENT.HEAD_VACATED',
          'Department',
          departmentId,
          { head: inForce?.employeeCode ?? null },
          {
            head: null,
            effectiveFrom: input.effectiveFrom,
            cancelledPeriods: room.cancelled.map((period) => `${period.employeeCode}@${period.validFrom}`),
          },
        ),
      );
      if (input.effectiveFrom !== today) return;
      for (const change of endedAsChanges(room, departmentId, today)) await this.changes.emit(tx, change);
    });
  }

  /**
   * Names who is to follow the head of the department, from a day after today (`QĐ-87` `D-5`): the head in force now ends the day
   * before and the person heads from that day, written ahead like a head named for a later day, so the successor is the one a
   * hand-over of data may be confirmed by before they take office (`QĐ-83c`). Somebody has to head the department today and the
   * person is not them; a successor already named is taken back first. The person must be a member that day, not hold the Super Admin
   * role and not have left, like any head. Throws DepartmentForbiddenError, DepartmentNotFoundError, DepartmentInactiveError or
   * HeadAssignmentError.
   */
  async designateSuccessor(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    input: { employeeId: string; effectiveFrom: BusinessDate },
  ): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    const organization = await requireOrganization(this.context);
    const today = await this.context.businessToday();

    await this.runner.run(async (tx) => {
      await this.lockActiveDepartment(tx, departmentId);
      const periods = await this.departments.headHistory(tx, departmentId, DEPARTMENT_HEAD_HISTORY_LIMIT);
      const head = inForceOn(periods, today);
      const problem = successorProblem({
        today,
        effectiveFrom: input.effectiveFrom,
        currentHeadEmployeeId: head?.employeeId ?? null,
        candidateEmployeeId: input.employeeId,
      });
      if (problem) throw new HeadAssignmentError(problem);
      if (periods.some((period) => period.validFrom > today)) throw new HeadAssignmentError('SUCCESSOR_ALREADY_NAMED');
      const employee = await this.requireCandidate(tx, departmentId, input.employeeId, input.effectiveFrom);

      await this.departments.endHeadPeriodsFrom(tx, departmentId, input.effectiveFrom);
      await this.departments.startHeadPeriod(tx, {
        organizationId: organization.id,
        departmentId,
        employeeId: input.employeeId,
        validFrom: input.effectiveFrom,
      });
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'DEPARTMENT.SUCCESSOR_DESIGNATED',
          'Department',
          departmentId,
          { head: head?.employeeCode ?? null, successor: null },
          {
            head: head?.employeeCode ?? null,
            successor: employee.employeeCode,
            effectiveFrom: input.effectiveFrom,
          },
        ),
      );
    });
  }

  /**
   * Takes back the successor named for the head: the head's period is open again and nobody follows them. Nobody named ⟹ nothing
   * changes. Throws DepartmentForbiddenError or DepartmentNotFoundError.
   */
  async clearSuccessor(actor: AuthenticatedPrincipal, departmentId: string): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    const organization = await requireOrganization(this.context);
    const today = await this.context.businessToday();

    await this.runner.run(async (tx) => {
      const department = await this.repo.lock(tx, departmentId, 'UPDATE');
      if (!department) throw new DepartmentNotFoundError();

      const cleared = await this.departments.clearHeadSuccessor(tx, departmentId, today);
      if (!cleared) return;

      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'DEPARTMENT.SUCCESSOR_CLEARED',
          'Department',
          departmentId,
          { successor: cleared.successor.employeeCode, effectiveFrom: cleared.successor.validFrom },
          {
            successor: null,
            head: cleared.restoredHead?.employeeCode ?? null,
          },
        ),
      );
    });
  }

  /** The department row `FOR UPDATE`, the first lock of every head change (T-11); it must exist and be in use. */
  private async lockActiveDepartment(tx: DbTx, departmentId: string): Promise<DepartmentRecord> {
    const department = await this.repo.lock(tx, departmentId, 'UPDATE');
    if (!department) throw new DepartmentNotFoundError();
    if (department.status !== 'ACTIVE') throw new DepartmentInactiveError();

    return department;
  }

  /** The person who is to head the department from `day`: the employee, then the account (the lock order), then the placement. */
  private async requireCandidate(
    tx: DbTx,
    departmentId: string,
    employeeId: string,
    day: BusinessDate,
  ): Promise<EmployeeRecord> {
    const employee = await lockAndReadEmployee(this.employees, tx, employeeId);
    if (!employee) throw new HeadAssignmentError('EMPLOYEE_NOT_FOUND');
    if (employee.status !== 'ACTIVE') throw new HeadAssignmentError('EMPLOYEE_NOT_ACTIVE');
    const account = await this.employeeAccounts.get().inspectEmployeeAccount(tx, employeeId);
    if (account.roles.includes('SUPER_ADMIN')) throw new HeadAssignmentError('SUPER_ADMIN_CANNOT_HEAD');
    // The spending approver first: they never hold MANAGER (QĐ-93b), so judged second they would only ever hear that MANAGER is missing.
    if (account.roles.includes('SPENDING_APPROVER')) throw new HeadAssignmentError('SPENDING_APPROVER_CANNOT_HEAD');
    if (!account.hasAccount || !account.roles.includes('MANAGER'))
      throw new HeadAssignmentError('MANAGER_ROLE_REQUIRED');
    const placement = await this.repo.placementOn(tx, employeeId, day);
    if (!placement || placement.departmentId !== departmentId || placement.validTo !== null) {
      throw new HeadAssignmentError('NOT_A_MEMBER_ON_DATE');
    }

    return employee;
  }
}
