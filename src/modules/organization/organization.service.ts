import { Injectable } from '@nestjs/common';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { OrganizationRepo } from './organization.repo';
import {
  CreateCostCenterInput,
  CreateDepartmentInput,
  CreateEmployeeWithPlacementInput,
  CreateOrganizationInput,
  EmployeeCandidate,
  EmployeeProfile,
  EmployeeRecord,
  OrganizationRecord,
} from './organization.types';

/**
 * Public facade of the organization module. Other modules call these methods with their own
 * transaction; none of them may touch the organization tables directly.
 */
@Injectable()
export class OrganizationService {
  constructor(private readonly repo: OrganizationRepo) {}

  /** The installation's organization, or null before bootstrap. */
  getOrganization(tx?: DbTx): Promise<OrganizationRecord | null> {
    return this.repo.findOrganization(tx);
  }

  createOrganization(tx: DbTx, input: CreateOrganizationInput): Promise<OrganizationRecord> {
    return this.repo.createOrganization(tx, input);
  }

  createUnitCostCenter(tx: DbTx, input: CreateCostCenterInput): Promise<{ id: string }> {
    return this.repo.createCostCenter(tx, input);
  }

  createDepartment(tx: DbTx, input: CreateDepartmentInput): Promise<{ id: string }> {
    return this.repo.createDepartment(tx, input);
  }

  createJobTitle(tx: DbTx, organizationId: string, name: string): Promise<{ id: string }> {
    return this.repo.createJobTitle(tx, organizationId, name);
  }

  /** The only way to create an employee: Employee and its first placement, in the caller's transaction. */
  createEmployeeWithPlacement(tx: DbTx, input: CreateEmployeeWithPlacementInput): Promise<{ id: string }> {
    return this.repo.createEmployeeWithPlacement(tx, input);
  }

  /** `FOR SHARE` when the caller needs the status to stay stable; `FOR UPDATE` when it changes the employee. */
  lockEmployeeForShare(tx: DbTx, employeeId: string): Promise<void> {
    return this.repo.lockEmployee(tx, employeeId, 'SHARE');
  }

  lockEmployeeForUpdate(tx: DbTx, employeeId: string): Promise<void> {
    return this.repo.lockEmployee(tx, employeeId, 'UPDATE');
  }

  /** Unlocked read. Pass `tx` to read inside a transaction without taking a lock. */
  getEmployee(employeeId: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    return this.repo.findEmployee(employeeId, tx);
  }

  /** Several employees in one read, for list views. Unknown ids are simply absent. */
  getEmployees(employeeIds: string[]): Promise<EmployeeRecord[]> {
    return this.repo.findEmployees(employeeIds);
  }

  /** Employees who have not left, matched on code, name or work email; newest codes last. */
  searchActiveEmployees(search: string | undefined, onDate: Date, limit: number): Promise<EmployeeCandidate[]> {
    return this.repo.searchActiveEmployees(search, onDate, limit);
  }

  getEmployeeProfile(employeeId: string, onDate: Date): Promise<EmployeeProfile | null> {
    return this.repo.findProfile(employeeId, onDate);
  }
}
