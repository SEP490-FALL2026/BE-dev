import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx, readSqlState } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../../infrastructure/database/unique-violation';
import { CreateDepartmentInput, EmployeeStatus } from '../organization.types';
import { HeadAssignmentError } from './department.errors';
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
  ): Promise<{ id: string; code: string; name: string; active: boolean; costCenterActive: boolean } | null> {
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

  // --- heads --------------------------------------------------------------------------

  headsOn(departmentIds: string[], onDate: BusinessDate): Promise<Map<string, DepartmentHeadRecord>> {
    return this.heads.currentHeads(departmentIds, onDate);
  }

  headHistory(client: DbTx | undefined, departmentId: string, limit: number): Promise<HeadPeriodRecord[]> {
    return this.heads.headPeriods(client, departmentId, limit);
  }

  headedDepartment(employeeId: string, onDate: BusinessDate): Promise<{ departmentId: string } | null> {
    return this.heads.headedDepartment(employeeId, onDate);
  }

  hasHeadPeriodFrom(client: DbTx | undefined, employeeId: string, onDate: BusinessDate): Promise<boolean> {
    return this.heads.hasHeadPeriodFrom(client, employeeId, onDate);
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
    input: { organizationId: string; departmentId: string; employeeId: string; validFrom: BusinessDate },
  ): Promise<void> {
    try {
      await this.heads.insertHeadPeriod(tx, input);
    } catch (error) {
      if (readSqlState(error) === '23P01') throw new HeadAssignmentError('HEADS_ANOTHER_DEPARTMENT');
      if (isCheckViolation(error)) throw new HeadAssignmentError('NOT_A_MEMBER_ON_DATE');
      throw error;
    }
  }
}
