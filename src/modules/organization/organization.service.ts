import { Injectable } from '@nestjs/common';
import { BusinessDate, businessDateAt } from '../../core/business-date';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { DepartmentRepo } from './department.repo';
import { CostCenterRepo } from './cost-center.repo';
import { ImportLookupRepo } from './import-lookup.repo';
import { OrganizationRepo } from './organization.repo';
import {
  CreateCostCenterInput,
  CreateDepartmentInput,
  CreateEmployeeWithPlacementInput,
  CreateOrganizationInput,
  EmployeeCandidate,
  EmployeeImportLookupData,
  EmployeeProfile,
  EmployeeRecord,
  OnboardingFacts,
  OrganizationRecord,
} from './organization.types';

/**
 * Public facade of the organization module. Other modules call these methods with their own
 * transaction; none of them may touch the organization tables directly.
 */
@Injectable()
export class OrganizationService {
  /** The organization's time zone never changes after installation (I-8), so it is read once. */
  private timeZone: string | null = null;

  constructor(
    private readonly repo: OrganizationRepo,
    private readonly departments: DepartmentRepo,
    private readonly importLookup: ImportLookupRepo,
    private readonly costCenters: CostCenterRepo,
  ) {}

  /** Today in the organization's own calendar (`now` is a parameter for tests). */
  async businessToday(now: Date = new Date()): Promise<BusinessDate> {
    if (this.timeZone === null) {
      const organization = await this.repo.findOrganization();
      if (!organization) return businessDateAt(now, 'UTC');
      this.timeZone = organization.timeZone;
    }

    return businessDateAt(now, this.timeZone);
  }

  /**
   * True when the employee heads a department today or has a head period that has not ended (including one
   * that begins later): such a person can never hold the Super Admin role (FR-8.7, US-01-09 AC-3).
   */
  async isDepartmentHead(employeeId: string, tx?: DbTx): Promise<boolean> {
    return this.departments.hasHeadPeriodFrom(tx, employeeId, await this.businessToday());
  }

  /**
   * The department this employee heads on `onDate` (default today), or null. An unlocked read: the per-request role
   * check must not take locks. The head is a member of the department for the whole period (QĐ-66a).
   */
  async getHeadedDepartment(employeeId: string, onDate?: BusinessDate): Promise<{ departmentId: string } | null> {
    return this.departments.headedDepartment(employeeId, onDate ?? (await this.businessToday()));
  }

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

  /** The employee with this code, or null; for the operator procedures that name people by code. */
  getEmployeeByCode(employeeCode: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    return this.repo.findEmployeeByCode(employeeCode, tx);
  }

  /** Several employees in one read, for list views. Unknown ids are simply absent. */
  getEmployees(employeeIds: string[]): Promise<EmployeeRecord[]> {
    return this.repo.findEmployees(employeeIds);
  }

  /**
   * Employees who have not left, matched literally on code, name or work email, in employee-code
   * order, leaving out `excludeEmployeeIds` (the caller's own filter, for example employees that
   * already have an account). One query: the exclusion is applied before the limit.
   */
  searchActiveEmployees(
    search: string | undefined,
    onDate: Date,
    limit: number,
    excludeEmployeeIds: readonly string[] = [],
  ): Promise<EmployeeCandidate[]> {
    return this.repo.searchActiveEmployees(search, onDate, limit, excludeEmployeeIds);
  }

  getEmployeeProfile(employeeId: string, onDate: Date): Promise<EmployeeProfile | null> {
    return this.repo.findProfile(employeeId, onDate);
  }

  /**
   * What a people file names, as the database knows it: the departments (by code), the job titles (by normalized
   * name), the people (by code) and who owns each work email. Pass `tx` to read inside the confirming transaction.
   */
  lookupForEmployeeImport(
    names: {
      departmentCodes: string[];
      normalizedJobTitleNames: string[];
      employeeCodes: string[];
      normalizedEmails: string[];
    },
    tx?: DbTx,
  ): Promise<EmployeeImportLookupData> {
    return this.importLookup.lookup(tx, names);
  }

  /** The row locks a write of imported people needs, in protocol order: departments, then job titles (T-11). */
  lockForEmployeeImport(tx: DbTx, departmentIds: string[], jobTitleIds: string[]): Promise<void> {
    return this.importLookup.lockForImport(tx, departmentIds, jobTitleIds);
  }

  /** Among these active departments, those nobody heads today: what the people import reports at its end (AC-1). */
  async departmentsWithoutHead(departmentIds: string[]): Promise<{ id: string; code: string; name: string }[]> {
    const wanted = new Set(departmentIds);
    const without = await this.departments.activeDepartmentsWithoutHead(await this.businessToday());

    return without.filter((department) => wanted.has(department.id));
  }

  /** The numbers and the gaps the onboarding checklist shows for the organization and its people (US-02-04 AC-1, AC-6). */
  async getOnboardingFacts(): Promise<OnboardingFacts> {
    const today = await this.businessToday();
    const [activeDepartments, activeEmployees, freeCostCenters, withoutHead, withItAdmin] = await Promise.all([
      this.departments.countActiveDepartments(),
      this.departments.countEmployees(),
      this.costCenters.countFreeUnits(),
      this.departments.activeDepartmentsWithoutHead(today),
      this.departments.activeDepartmentsWithItAdmin(),
    ]);

    return {
      activeDepartments,
      activeEmployees,
      freeCostCenters,
      departmentsWithoutHead: withoutHead.map((department) => ({ code: department.code, name: department.name })),
      departmentsByItAdmin: withItAdmin.map((department) => ({
        code: department.code,
        name: department.name,
        itAdminEmployeeId: department.itAdminEmployeeId,
        itAdminStatus: department.itAdminStatus,
      })),
    };
  }
}
