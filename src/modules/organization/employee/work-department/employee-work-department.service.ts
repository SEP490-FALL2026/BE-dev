import { Injectable } from '@nestjs/common';
import { type BusinessDate } from '../../../../core/business-date';
import { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { EmployeeWorkDepartmentRepo } from './employee-work-department.repo';

/** Batch work-department lookups for employees on a business day (entry of the work-department group). */
@Injectable()
export class EmployeeWorkDepartmentService {
  constructor(private readonly repo: EmployeeWorkDepartmentRepo) {}

  workDepartmentsOf(employeeIds: readonly string[], today: BusinessDate, tx?: DbTx): Promise<Map<string, string>> {
    return this.repo.workDepartmentsOf(employeeIds, today, tx);
  }

  employeeIdsOfWorkDepartments(departmentIds: readonly string[], today: BusinessDate, tx?: DbTx): Promise<string[]> {
    return this.repo.employeeIdsOfWorkDepartments(departmentIds, today, tx);
  }

  notStartedAmong(employeeIds: readonly string[], today: BusinessDate, tx?: DbTx): Promise<Set<string>> {
    return this.repo.notStartedAmong(employeeIds, today, tx);
  }
}
