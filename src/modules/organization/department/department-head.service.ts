import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { organizationAuditEvent } from '../mappers/audit-event.mapper';
import { OrganizationService } from '../organization.service';
import type { NewOrganizationChange } from '../organization.types';
import { DepartmentInactiveError, DepartmentNotFoundError, HeadAssignmentError } from './department.errors';
import { lockAndReadEmployee, requireOrganization } from './department-lookups';
import { DepartmentRepo } from './department.repo';
import { DEPARTMENT_HEAD_HISTORY_LIMIT, HeadPeriodChanges, HeadPeriodRecord } from './department.types';

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
 * Who heads a department (`US-03-06` AC-5 → AC-9, AC-18; `US-01-02`): naming the head from a day, or leaving the
 * department without one from a day. Both are operations of their own, so a later flow (transfer, leaving) can reuse
 * them; the head is the department's MANAGER for exactly the days of the period.
 */
@Injectable()
export class DepartmentHeadService {
  constructor(
    private readonly repo: DepartmentRepo,
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Names the head of the department from `effectiveFrom` (today or later): the head before ends the day before,
   * so the two never overlap and on each day there is one head (AC-5). The person must be a member of this
   * department on that day (AC-18), must not hold the Super Admin role (AC-7), and must not have left (AC-8).
   * Naming the person who already heads it from that day changes nothing. A change for today takes effect in this
   * transaction, so the listeners of the organization are told of it here and not on a later pass (`US-05-12` AC-2).
   */
  async assign(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    input: { employeeId: string; effectiveFrom: BusinessDate },
  ): Promise<void> {
    const organization = await requireOrganization(this.organization);
    const today = await this.organization.businessToday();
    if (input.effectiveFrom < today) throw new HeadAssignmentError('DATE_IN_PAST');

    await this.runner.run(async (tx) => {
      // Lock order (T-11, protocol): the department, then the employee, then the account.
      const department = await this.repo.lock(tx, departmentId, 'UPDATE');
      if (!department) throw new DepartmentNotFoundError();
      if (department.status !== 'ACTIVE') throw new DepartmentInactiveError();

      const employee = await lockAndReadEmployee(this.organization, tx, input.employeeId);
      if (!employee) throw new HeadAssignmentError('EMPLOYEE_NOT_FOUND');
      if (employee.status !== 'ACTIVE') throw new HeadAssignmentError('EMPLOYEE_NOT_ACTIVE');
      const account = await this.identity.inspectEmployeeAccount(tx, input.employeeId);
      if (account.roles.includes('SUPER_ADMIN')) throw new HeadAssignmentError('SUPER_ADMIN_CANNOT_HEAD');
      const placement = await this.repo.placementOn(tx, input.employeeId, input.effectiveFrom);
      if (!placement || placement.departmentId !== departmentId || placement.validTo !== null) {
        throw new HeadAssignmentError('NOT_A_MEMBER_ON_DATE');
      }

      const periods = await this.organization.getDepartmentHeadHistory(departmentId, DEPARTMENT_HEAD_HISTORY_LIMIT, tx);
      const inForce = inForceOn(periods, input.effectiveFrom);
      const alreadyHead = inForce?.employeeId === input.employeeId && inForce.validTo === null;
      const laterPeriods = periods.some((period) => period.validFrom > input.effectiveFrom);
      if (alreadyHead && !laterPeriods) return;

      const room = await this.organization.endDepartmentHeadPeriodsFrom(tx, departmentId, input.effectiveFrom);
      const started = await this.organization.startDepartmentHeadPeriod(tx, {
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
      for (const change of stopped) await this.organization.emitChange(tx, change);
      await this.organization.emitChange(tx, {
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
    const organization = await requireOrganization(this.organization);
    const today = await this.organization.businessToday();
    if (input.effectiveFrom < today) throw new HeadAssignmentError('DATE_IN_PAST');

    await this.runner.run(async (tx) => {
      const department = await this.repo.lock(tx, departmentId, 'UPDATE');
      if (!department) throw new DepartmentNotFoundError();

      const periods = await this.organization.getDepartmentHeadHistory(departmentId, DEPARTMENT_HEAD_HISTORY_LIMIT, tx);
      const inForce = inForceOn(periods, input.effectiveFrom);
      const room = await this.organization.endDepartmentHeadPeriodsFrom(tx, departmentId, input.effectiveFrom);
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
      for (const change of endedAsChanges(room, departmentId, today)) await this.organization.emitChange(tx, change);
    });
  }
}
