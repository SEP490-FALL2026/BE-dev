import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx, readSqlState } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../../infrastructure/database/unique-violation';
import { FinanceSetupIncompleteError } from '../organization.errors';
import {
  ClearedHeadSuccessor,
  CostedOwningUnit,
  CreateDepartmentInput,
  EmployeeStatus,
  OwningUnit,
  UsableItAdmins,
} from '../organization.types';
import { HeadAssignmentError } from './department.errors';
import { itAdminScope } from './department.policy';
import { DepartmentHeadRepo } from './department-head.repo';
import { DepartmentRepo } from './department.repo';
import { DepartmentHeadRecord, DepartmentRecord, HeadPeriodChanges, HeadPeriodRecord } from './department.types';

/**
 * The departments and their heads as `OrganizationModule` holds them: the owner of `DepartmentHeadRepo`, which no other
 * provider injects. The organization facade reaches departments through it, for other modules (installation, accounts,
 * the per-request role check, import, onboarding), for the manual entry and for the department use cases' head periods.
 * Every call runs in the caller's transaction, in the order the caller makes it; the rules stay with the use cases. The
 * department use cases keep using `DepartmentRepo` directly (Owner decision E4).
 */
@Injectable()
export class DepartmentDirectoryService {
  constructor(
    private readonly departments: DepartmentRepo,
    private readonly heads: DepartmentHeadRepo,
  ) {}

  // --- departments --------------------------------------------------------------------

  createForInstallation(tx: DbTx, input: CreateDepartmentInput): Promise<{ id: string }> {
    return this.departments.createForInstallation(tx, input);
  }

  lockForEntry(
    tx: DbTx,
    organizationId: string,
    code: string,
  ): Promise<{ id: string; code: string; name: string; active: boolean } | null> {
    return this.departments.lockByCode(tx, organizationId, code);
  }

  findByCode(tx: DbTx, organizationId: string, code: string): Promise<DepartmentRecord | null> {
    return this.departments.findByCode(tx, organizationId, code);
  }

  countActive(tx?: DbTx): Promise<number> {
    return this.departments.countActiveDepartments(tx);
  }

  activeWithoutHead(onDate: BusinessDate, tx?: DbTx): Promise<{ id: string; code: string; name: string }[]> {
    return this.departments.activeDepartmentsWithoutHead(onDate, tx);
  }

  activeWithItAdmin(
    tx?: DbTx,
  ): Promise<
    { id: string; code: string; name: string; itAdminEmployeeId: string | null; itAdminStatus: EmployeeStatus | null }[]
  > {
    return this.departments.activeDepartmentsWithItAdmin(tx);
  }

  /** `FOR UPDATE` on a department the caller is about to change the head of (the lock protocol: departments in id order first). */
  lockForUpdate(tx: DbTx, id: string): Promise<DepartmentRecord | null> {
    return this.departments.lock(tx, id, 'UPDATE');
  }

  // --- heads --------------------------------------------------------------------------

  endHeadPeriodOf(
    tx: DbTx,
    departmentId: string,
    employeeId: string,
    from: BusinessDate,
  ): Promise<{ periodId: string; endedBefore: BusinessDate | null } | null> {
    return this.heads.endPeriodOf(tx, departmentId, employeeId, from);
  }

  restoreHeadPeriodEnd(tx: DbTx, periodId: string, validTo: BusinessDate | null): Promise<void> {
    return this.heads.restorePeriodEnd(tx, periodId, validTo);
  }

  deleteHeadPeriod(tx: DbTx, periodId: string): Promise<void> {
    return this.heads.deletePeriod(tx, periodId);
  }

  headsOn(departmentIds: string[], onDate: BusinessDate, tx?: DbTx): Promise<Map<string, DepartmentHeadRecord>> {
    return this.heads.currentHeads(departmentIds, onDate, tx);
  }

  headHistory(client: DbTx | undefined, departmentId: string, limit: number): Promise<HeadPeriodRecord[]> {
    return this.heads.headPeriods(client, departmentId, limit);
  }

  /** The department of each employee on `onDate` and the Unit of that department, in two reads; an employee with none is absent. */
  async owningUnitsOn(
    employeeIds: readonly string[],
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, OwningUnit>> {
    const placements = await this.departments.placementsOn(employeeIds, onDate, tx);
    const units = new Map(
      (await this.departments.findByIds([...new Set(placements.map((placement) => placement.departmentId))], tx)).map(
        (department) => [department.id, department.costCenter],
      ),
    );

    return new Map(
      placements.flatMap((placement) =>
        units.has(placement.departmentId)
          ? [
              [
                placement.employeeId,
                { departmentId: placement.departmentId, costCenter: units.get(placement.departmentId) ?? null },
              ] as const,
            ]
          : [],
      ),
    );
  }

  /** The unit with its Cost Center; throws FinanceSetupIncompleteError when the department has none yet (`QĐ-87d(1)`). */
  requireUnitCostCenter(unit: OwningUnit): CostedOwningUnit {
    if (!unit.costCenter) throw new FinanceSetupIncompleteError(unit.departmentId);

    return { ...unit, costCenter: unit.costCenter };
  }

  find(id: string, tx?: DbTx): Promise<DepartmentRecord | null> {
    return this.departments.findById(id, tx);
  }

  findMany(ids: readonly string[], tx?: DbTx): Promise<DepartmentRecord[]> {
    return this.departments.findByIds(ids, tx);
  }

  /** The IT Admin in charge of the department while still working; null when there is none or they have left. */
  async itAdminInChargeOf(id: string, tx?: DbTx): Promise<string | null> {
    const itAdmin = (await this.departments.findById(id, tx))?.itAdmin;

    return itAdmin?.employeeStatus === 'ACTIVE' ? itAdmin.employeeId : null;
  }

  /** The departments that name this employee IT Admin in charge, while they still work; empty otherwise. */
  idsInChargeOf(employeeId: string, tx?: DbTx): Promise<string[]> {
    return this.departments.idsInChargeOf(employeeId, tx);
  }

  /**
   * The departments an IT Admin reads and handles (`US-01-11`, F12): those that name them in charge (retired ones too) and the active
   * ones nobody usable is in charge of, whose technical work falls to every IT Admin (`itAdminScope`). An unlocked read; `usableAmong`
   * tells which of the IT Admins named can act.
   */
  async itAdminScopeOf(employeeId: string, usableAmong: UsableItAdmins, tx?: DbTx): Promise<string[]> {
    const active = await this.departments.activeDepartmentsWithItAdmin(tx);
    const usable = await usableAmong(
      active.flatMap((department) => (department.itAdminEmployeeId ? [department.itAdminEmployeeId] : [])),
    );
    const standingIn = itAdminScope(
      employeeId,
      active.map((department) => ({
        id: department.id,
        active: true,
        itAdminEmployeeId: department.itAdminEmployeeId,
        itAdminUsable:
          department.itAdminEmployeeId !== null &&
          department.itAdminStatus === 'ACTIVE' &&
          usable.has(department.itAdminEmployeeId),
      })),
    );

    return [...new Set([...standingIn, ...(await this.idsInChargeOf(employeeId, tx))])];
  }

  /** The active departments each of these employees is named IT Admin in charge of (one read, in code order). */
  inChargeOfMany(employeeIds: readonly string[], tx?: DbTx) {
    return this.departments.inChargeOfMany(employeeIds, tx);
  }

  lockShared(tx: DbTx, id: string): Promise<DepartmentRecord | null> {
    return this.departments.lockShared(tx, id);
  }

  memberIdsOn(departmentId: string, onDate: BusinessDate, tx?: DbTx): Promise<string[] | null> {
    return this.departments.memberIdsOn(departmentId, onDate, tx);
  }

  headedDepartment(employeeId: string, onDate: BusinessDate): Promise<{ departmentId: string } | null> {
    return this.heads.headedDepartment(employeeId, onDate);
  }

  headsOnDates(
    queries: readonly { departmentId: string; onDate: BusinessDate }[],
    tx?: DbTx,
  ): Promise<Map<string, string>> {
    return this.heads.headsOnDates(queries, tx);
  }

  headPeriodsOf(
    employeeId: string,
    from: BusinessDate,
    tx?: DbTx,
  ): Promise<{ departmentId: string; validFrom: BusinessDate; validTo: BusinessDate | null }[]> {
    return this.heads.periodsOf(employeeId, from, tx);
  }

  hasHeadPeriodFrom(client: DbTx | undefined, employeeId: string, onDate: BusinessDate): Promise<boolean> {
    return this.heads.hasHeadPeriodFrom(client, employeeId, onDate);
  }

  /** Takes back the successor named for the department (a head period that begins after `today`) and reopens the head's period. */
  clearHeadSuccessor(tx: DbTx, departmentId: string, today: BusinessDate): Promise<ClearedHeadSuccessor | null> {
    return this.heads.clearSuccessor(tx, departmentId, today);
  }

  /** Cancels the head periods that begin on or after `from` and ends the one in force then, the day before. */
  endHeadPeriodsFrom(tx: DbTx, departmentId: string, from: BusinessDate): Promise<HeadPeriodChanges> {
    return this.heads.makeRoomForHead(tx, departmentId, from);
  }

  /**
   * Opens a head period from `validFrom`. The database is the last word on the two rules a lock cannot hold for it:
   * the person already heads another department over some of these days (INV-19), or is not a member for all of them.
   */
  async startHeadPeriod(
    tx: DbTx,
    input: {
      organizationId: string;
      departmentId: string;
      employeeId: string;
      validFrom: BusinessDate;
      validTo?: BusinessDate | null;
    },
  ): Promise<{ periodId: string }> {
    try {
      return await this.heads.insertHeadPeriod(tx, input);
    } catch (error) {
      if (readSqlState(error) === '23P01') throw new HeadAssignmentError('HEADS_ANOTHER_DEPARTMENT');
      if (isCheckViolation(error)) throw new HeadAssignmentError('NOT_A_MEMBER_ON_DATE');
      throw error;
    }
  }
}
