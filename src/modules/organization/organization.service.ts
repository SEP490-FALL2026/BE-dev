import { Injectable } from '@nestjs/common';
import { BusinessDate, businessDateAt } from '../../core/business-date';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { CostCenterCatalogueService } from './cost-center/cost-center-catalogue.service';
import { DepartmentDirectoryService } from './department/department-directory.service';
import { DepartmentHeadRecord, HeadPeriodChanges, HeadPeriodRecord } from './department/department.types';
import { EmployeeDirectoryService } from './employee/employee-directory.service';
import { JobTitleCatalogueService } from './job-title/job-title-catalogue.service';
import { JobTitleListFilter, JobTitleRecord, JobTitleStatus } from './job-title/job-title.types';
import { OrganizationRepo } from './organization.repo';
import {
  CostCenterBrief,
  CreateCostCenterInput,
  CreateDepartmentInput,
  CreateEmployeeWithPlacementInput,
  CreateOrganizationInput,
  DepartmentBrief,
  EmployeeCandidate,
  EmployeeImportLookupData,
  EmployeeProfile,
  EmployeeRecord,
  LocalSeedFixtureFacts,
  OnboardingFacts,
  OrganizationRecord,
} from './organization.types';

const toBrief = (record: { id: string; code: string; name: string; status: string } | null): DepartmentBrief | null =>
  record && { id: record.id, code: record.code, name: record.name, active: record.status === 'ACTIVE' };

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
    private readonly departments: DepartmentDirectoryService,
    private readonly employees: EmployeeDirectoryService,
    private readonly costCenters: CostCenterCatalogueService,
    private readonly jobTitles: JobTitleCatalogueService,
  ) {}

  /** Today in the organization's own calendar (`now` is a parameter for tests; `tx` reads the zone in the caller's transaction). */
  async businessToday(now: Date = new Date(), tx?: DbTx): Promise<BusinessDate> {
    if (this.timeZone === null) {
      const organization = await this.repo.findOrganization(tx);
      if (!organization) return businessDateAt(now, 'UTC');
      this.timeZone = organization.timeZone;
    }

    return businessDateAt(now, this.timeZone);
  }

  /** True when the employee heads a department or has a head period not yet ended: never a Super Admin (FR-8.7, AC-3). */
  async isDepartmentHead(employeeId: string, tx?: DbTx): Promise<boolean> {
    return this.departments.hasHeadPeriodFrom(tx, employeeId, await this.businessToday());
  }

  /** The department this employee heads on `onDate` (default today), or null; unlocked, for the per-request role check. */
  async getHeadedDepartment(employeeId: string, onDate?: BusinessDate): Promise<{ departmentId: string } | null> {
    return this.departments.headedDepartment(employeeId, onDate ?? (await this.businessToday()));
  }

  /** The department with this id: its code, name and whether it is still active; null when there is none. */
  async getDepartmentBrief(departmentId: string, tx?: DbTx): Promise<DepartmentBrief | null> {
    return toBrief(await this.departments.find(departmentId, tx));
  }

  /** The same, held `FOR SHARE` until the caller transaction ends, so it cannot be made inactive between check and commit. */
  async lockDepartmentShared(tx: DbTx, departmentId: string): Promise<DepartmentBrief | null> {
    return toBrief(await this.departments.lockShared(tx, departmentId));
  }

  /** The department and the job title of the employee on `onDate` (default today), by id; null when they have none. */
  async getEmployeePlacement(
    employeeId: string,
    onDate?: BusinessDate,
  ): Promise<{ departmentId: string; jobTitleId: string } | null> {
    return this.employees.placementOn(employeeId, onDate ?? (await this.businessToday()));
  }

  /** The department of the employee on `onDate` and its IT Admin, named only while still working (`US-01-11` AC-4, AC-8). */
  async getItAdminInCharge(
    employeeId: string,
    onDate?: BusinessDate,
  ): Promise<{ departmentId: string; itAdminEmployeeId: string | null } | null> {
    const placement = await this.getEmployeePlacement(employeeId, onDate);

    return (
      placement && {
        departmentId: placement.departmentId,
        itAdminEmployeeId: await this.departments.itAdminInChargeOf(placement.departmentId),
      }
    );
  }

  /** Everyone placed in the department on `onDate` (default today), by employee id; null when it does not exist. */
  async getDepartmentMemberIds(departmentId: string, onDate?: BusinessDate): Promise<string[] | null> {
    return this.departments.memberIdsOn(departmentId, onDate ?? (await this.businessToday()));
  }

  // --- the head periods of departments, for the department use cases (in their transaction) -------------

  /** Who heads each of these departments on `onDate`; a department nobody heads is absent. */
  getDepartmentHeads(departmentIds: string[], onDate: BusinessDate): Promise<Map<string, DepartmentHeadRecord>> {
    return this.departments.headsOn(departmentIds, onDate);
  }

  /** Who headed the department, newest period first, at most `limit` periods. Pass `tx` to read in a transaction. */
  getDepartmentHeadHistory(departmentId: string, limit: number, tx?: DbTx): Promise<HeadPeriodRecord[]> {
    return this.departments.headHistory(tx, departmentId, limit);
  }

  /** Cancels the head periods from `from` on and ends the one in force the day before; the caller holds the department lock. */
  endDepartmentHeadPeriodsFrom(tx: DbTx, departmentId: string, from: BusinessDate): Promise<HeadPeriodChanges> {
    return this.departments.endHeadPeriodsFrom(tx, departmentId, from);
  }

  /** Opens a head period; throws HeadAssignmentError when the database refuses the person on those days (INV-19). */
  startDepartmentHeadPeriod(
    tx: DbTx,
    input: { organizationId: string; departmentId: string; employeeId: string; validFrom: BusinessDate },
  ): Promise<void> {
    return this.departments.startHeadPeriod(tx, input);
  }

  /** The installation's organization, or null before bootstrap. */
  getOrganization(tx?: DbTx): Promise<OrganizationRecord | null> {
    return this.repo.findOrganization(tx);
  }

  /** Changes the reporting currency; the database locks it once a rate or a converted price exists (AC-9, `55000`). */
  setReportingCurrency(tx: DbTx, organizationId: string, currency: string): Promise<void> {
    return this.repo.setReportingCurrency(tx, organizationId, currency);
  }

  createOrganization(tx: DbTx, input: CreateOrganizationInput): Promise<OrganizationRecord> {
    return this.repo.createOrganization(tx, input);
  }

  createUnitCostCenter(tx: DbTx, input: CreateCostCenterInput): Promise<{ id: string }> {
    return this.costCenters.createUnitForInstallation(tx, input);
  }

  /** The Cost Centers with these codes as far as they exist, for the imports that name them by code. */
  getCostCentersByCodes(codes: readonly string[], tx?: DbTx): Promise<CostCenterBrief[]> {
    return this.costCenters.findBriefsByCodes(codes, tx);
  }

  /** The Cost Centers with these ids as far as they exist: code, name, kind and status (`ACTIVE` ones take new use). */
  costCentersByIds(ids: readonly string[], tx?: DbTx): Promise<CostCenterBrief[]> {
    return this.costCenters.findBriefs(ids, tx);
  }

  /** The same, each locked `FOR SHARE` until the caller's transaction ends, so none turns inactive before commit. */
  lockCostCentersShared(tx: DbTx, ids: readonly string[]): Promise<CostCenterBrief[]> {
    return this.costCenters.lockSharedBriefs(tx, ids);
  }

  createDepartment(tx: DbTx, input: CreateDepartmentInput): Promise<{ id: string }> {
    return this.departments.createForInstallation(tx, input);
  }

  createJobTitle(tx: DbTx, organizationId: string, name: string): Promise<{ id: string }> {
    return this.jobTitles.createForInstallation(tx, organizationId, name);
  }

  // --- the job title catalogue, for its HTTP use cases (in their transaction) ---------------------------

  /** One page of the catalogue and the total for the same filter, from one snapshot. */
  listJobTitles(filter: JobTitleListFilter): Promise<{ items: JobTitleRecord[]; total: number }> {
    return this.jobTitles.list(filter);
  }

  /** Adds an `ACTIVE` title under the T-12 name rule. A lost race on the name is the database error, unchanged. */
  insertJobTitle(tx: DbTx, organizationId: string, name: string): Promise<JobTitleRecord> {
    return this.jobTitles.insert(tx, organizationId, name);
  }

  /** `FOR UPDATE` before a change of the title, then its row; null when it does not exist. */
  lockJobTitleForUpdate(tx: DbTx, jobTitleId: string): Promise<JobTitleRecord | null> {
    return this.jobTitles.lock(tx, jobTitleId, 'UPDATE');
  }

  /** `FOR SHARE` when an entry relies on the title staying as it is until commit; null when it does not exist. */
  lockJobTitleForShare(tx: DbTx, jobTitleId: string): Promise<JobTitleRecord | null> {
    return this.jobTitles.lock(tx, jobTitleId, 'SHARE');
  }

  /** The job title with this id, or null. Pass `tx` to read in a transaction. */
  getJobTitle(jobTitleId: string, tx?: DbTx): Promise<JobTitleRecord | null> {
    return this.jobTitles.find(jobTitleId, tx);
  }

  /** Unlocked: the title that has this normalized name, whatever its status, to name it in a conflict. */
  findJobTitleByNormalizedName(organizationId: string, normalizedName: string): Promise<JobTitleRecord | null> {
    return this.jobTitles.findByNormalizedName(organizationId, normalizedName);
  }

  /** Renames a title the caller has locked and raises its version. */
  renameJobTitle(tx: DbTx, jobTitleId: string, name: string, now: Date): Promise<JobTitleRecord> {
    return this.jobTitles.rename(tx, jobTitleId, name, now);
  }

  /** Changes the status of a title the caller has locked and raises its version. */
  setJobTitleStatus(tx: DbTx, jobTitleId: string, status: JobTitleStatus, now: Date): Promise<JobTitleRecord> {
    return this.jobTitles.setStatus(tx, jobTitleId, status, now);
  }

  /** The only way to create an employee: Employee and its first placement, in the caller's transaction. */
  createEmployeeWithPlacement(tx: DbTx, input: CreateEmployeeWithPlacementInput): Promise<{ id: string }> {
    return this.employees.createWithPlacement(tx, input);
  }

  /** `FOR SHARE` when the caller needs the status to stay stable; `FOR UPDATE` when it changes the employee. */
  lockEmployeeForShare(tx: DbTx, employeeId: string): Promise<void> {
    return this.employees.lock(tx, employeeId, 'SHARE');
  }

  lockEmployeeForUpdate(tx: DbTx, employeeId: string): Promise<void> {
    return this.employees.lock(tx, employeeId, 'UPDATE');
  }

  /** Unlocked read. Pass `tx` to read inside a transaction without taking a lock. */
  getEmployee(employeeId: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    return this.employees.find(employeeId, tx);
  }

  /** The employee with this code, or null; for the operator procedures that name people by code. */
  getEmployeeByCode(employeeCode: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    return this.employees.findByCode(employeeCode, tx);
  }

  /** Employees by code in one read, for the imports that name people by code. Unknown codes are simply absent. */
  getEmployeesByCodes(employeeCodes: readonly string[], tx?: DbTx): Promise<EmployeeRecord[]> {
    return this.employees.findManyByCodes(employeeCodes, tx);
  }

  /** The domains of the work emails of its people: all the organization can tell of its domains (`OQ-A-22`). */
  getCompanyEmailDomains(tx?: DbTx): Promise<string[]> {
    return this.employees.workEmailDomains(tx);
  }

  /** Several employees in one read, for list views. Unknown ids are simply absent. */
  getEmployees(employeeIds: string[]): Promise<EmployeeRecord[]> {
    return this.employees.findMany(employeeIds);
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
    return this.employees.searchActive(search, onDate, limit, excludeEmployeeIds);
  }

  getEmployeeProfile(employeeId: string, onDate: Date): Promise<EmployeeProfile | null> {
    return this.employees.profile(employeeId, onDate);
  }

  /** What a people file names, as the database knows it: departments, job titles, people and work-email owners. */
  lookupForEmployeeImport(
    names: {
      departmentCodes: string[];
      normalizedJobTitleNames: string[];
      employeeCodes: string[];
      normalizedEmails: string[];
    },
    tx?: DbTx,
  ): Promise<EmployeeImportLookupData> {
    return this.employees.lookupForImport(tx, names);
  }

  /** The row locks a write of imported people needs, in protocol order: departments, then job titles (T-11). */
  lockForEmployeeImport(tx: DbTx, departmentIds: string[], jobTitleIds: string[]): Promise<void> {
    return this.employees.lockForImport(tx, departmentIds, jobTitleIds);
  }

  // --- manual entry of one person, in its transaction and lock order (T-11) ------------------------------

  /** The database clock at the start of the transaction: the instant the new employee's `created_at` gets. */
  employeeRecordingInstant(tx: DbTx): Promise<Date> {
    return this.employees.recordingInstant(tx);
  }

  /** `FOR SHARE` on the department a person is entered into (it must stay until commit), then its state; null if none. */
  lockDepartmentForEntry(
    tx: DbTx,
    organizationId: string,
    code: string,
  ): Promise<{ id: string; code: string; name: string; active: boolean; costCenterActive: boolean } | null> {
    return this.departments.lockForEntry(tx, organizationId, code);
  }

  isEmployeeCodeTaken(tx: DbTx, organizationId: string, employeeCode: string): Promise<boolean> {
    return this.employees.isCodeTaken(tx, organizationId, employeeCode);
  }

  isWorkEmailTaken(tx: DbTx, organizationId: string, normalizedWorkEmail: string): Promise<boolean> {
    return this.employees.isWorkEmailTaken(tx, organizationId, normalizedWorkEmail);
  }

  /** Among these active departments, those nobody heads today: what the people import reports at its end (AC-1). */
  async departmentsWithoutHead(departmentIds: string[]): Promise<{ id: string; code: string; name: string }[]> {
    const wanted = new Set(departmentIds);
    const without = await this.departments.activeWithoutHead(await this.businessToday());

    return without.filter((department) => wanted.has(department.id));
  }

  /**
   * The three local seed fixture items by their stable keys, in the caller's transaction (`pnpm dev:seed`, P23-RV-01):
   * the cost center with the department charged to it, the department with its cost center, and the job title with
   * this normalized name. Each is null when absent.
   */
  async readLocalSeedFixture(
    tx: DbTx,
    keys: { organizationId: string; costCenterCode: string; departmentCode: string; normalizedJobTitleName: string },
  ): Promise<LocalSeedFixtureFacts> {
    const costCenter = await this.costCenters.findByCode(tx, keys.organizationId, keys.costCenterCode);
    const department = await this.departments.findByCode(tx, keys.organizationId, keys.departmentCode);
    const jobTitle = await this.jobTitles.findByNormalizedName(keys.organizationId, keys.normalizedJobTitleName, tx);

    return {
      costCenter: costCenter && {
        id: costCenter.id,
        code: costCenter.code,
        name: costCenter.name,
        kind: costCenter.kind,
        status: costCenter.status,
        departmentCode: costCenter.department?.code ?? null,
      },
      department: department && {
        id: department.id,
        code: department.code,
        name: department.name,
        status: department.status,
        costCenterId: department.costCenter.id,
        costCenterCode: department.costCenter.code,
      },
      jobTitle: jobTitle && {
        id: jobTitle.id,
        name: jobTitle.name,
        // Found by this key, so it is the key itself.
        normalizedName: keys.normalizedJobTitleName,
        status: jobTitle.status,
      },
    };
  }

  /** The numbers and gaps of the onboarding checklist (US-02-04 AC-1, AC-6); with `tx`, in order in that transaction. */
  async getOnboardingFacts(tx?: DbTx): Promise<OnboardingFacts> {
    const today = await this.businessToday(new Date(), tx);
    const [activeDepartments, activeEmployees, freeCostCenters, withoutHead, withItAdmin] = tx
      ? [
          await this.departments.countActive(tx),
          await this.employees.countActive(tx),
          await this.costCenters.countFreeUnits(tx),
          await this.departments.activeWithoutHead(today, tx),
          await this.departments.activeWithItAdmin(tx),
        ]
      : await Promise.all([
          this.departments.countActive(),
          this.employees.countActive(),
          this.costCenters.countFreeUnits(),
          this.departments.activeWithoutHead(today),
          this.departments.activeWithItAdmin(),
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
