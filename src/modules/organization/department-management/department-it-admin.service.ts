import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DepartmentItAdminInvalidError } from '../department/department.errors';
import { assertItAdminHasRoom } from '../department/department.policy';
import { DepartmentRepo } from '../department/department.repo';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import { lockAndReadEmployee } from './department-facts.service';

/** Whether the person named to answer for the technical work of a department can (`US-01-11`, `QĐ-110l`). */
@Injectable()
export class DepartmentItAdminService {
  constructor(
    private readonly employees: EmployeeRecordService,
    private readonly employeeAccounts: EmployeeAccountsHook,
    private readonly departments: DepartmentRepo,
  ) {}

  /**
   * An employee who works, with a usable IT_ADMIN account, who answers for fewer than four active departments (`QĐ-110l`). The employee row
   * is locked `FOR UPDATE` first (the order of the lock protocol), so two assignments of the same IT Admin wait for each other and the second
   * counts the first; then the account is read, then the departments are counted. Throws DepartmentItAdminInvalidError and
   * DepartmentItAdminLimitReachedError.
   */
  async assertUsable(tx: DbTx, employeeId: string): Promise<void> {
    const employee = await lockAndReadEmployee(this.employees, tx, employeeId, 'UPDATE');
    if (!employee || employee.status !== 'ACTIVE') throw new DepartmentItAdminInvalidError();
    const account = await this.employeeAccounts.get().inspectEmployeeAccount(tx, employeeId);
    if (!account.usable || !account.roles.includes('IT_ADMIN')) throw new DepartmentItAdminInvalidError();
    assertItAdminHasRoom(await this.departments.countActiveInChargeOf(tx, employeeId));
  }
}
