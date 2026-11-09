import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DepartmentItAdminInvalidError } from '../department/department.errors';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import { lockAndReadEmployee } from './department-facts.service';

/** Whether the person named to answer for the technical work of a department can: an employee who works, with a usable IT_ADMIN account (`US-01-11`). */
@Injectable()
export class DepartmentItAdminService {
  constructor(
    private readonly employees: EmployeeRecordService,
    private readonly employeeAccounts: EmployeeAccountsHook,
  ) {}

  /** Locks the employee `FOR SHARE`, then reads the account (the order of the lock protocol). Throws DepartmentItAdminInvalidError. */
  async assertUsable(tx: DbTx, employeeId: string): Promise<void> {
    const employee = await lockAndReadEmployee(this.employees, tx, employeeId);
    if (!employee || employee.status !== 'ACTIVE') throw new DepartmentItAdminInvalidError();
    const account = await this.employeeAccounts.get().inspectEmployeeAccount(tx, employeeId);
    if (!account.usable || !account.roles.includes('IT_ADMIN')) throw new DepartmentItAdminInvalidError();
  }
}
