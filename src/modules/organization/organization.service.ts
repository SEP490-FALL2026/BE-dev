import { Injectable } from '@nestjs/common';
import { BusinessDate, businessDateAt } from '../../core/business-date';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { CostCenterCatalogueService } from './cost-center/cost-center-catalogue.service';
import { DepartmentDirectoryService } from './department/department-directory.service';
import { DepartmentServiceAccountRegistry } from './department/service-account-registry';
import { DepartmentUseRegistry } from './department/department-use-registry';
import { OrganizationChangeService } from './change-announcement/organization-change.service';
import { DepartmentHeadRecord, HeadPeriodChanges, HeadPeriodRecord } from './department/department.types';
import { EmployeeDirectoryService } from './employee/employee-directory.service';
import { toBrief, toLocalSeedFixtureFacts } from './mappers/local-seed-fixture.mapper';
import { OrganizationRepo } from './organization.repo';
import type { CostCenterUse, CostCenterUseReader, DepartmentUse, DepartmentUseReader } from './organization-use.types';
import {
  ClearedHeadSuccessor,
  CostCenterBrief,
  CostedOwningUnit,
  CreateCostCenterInput,
  CreateDepartmentInput,
  CreateEmployeeWithPlacementInput,
  CreateOrganizationInput,
  DepartmentBrief,
  DepartmentEntryLock,
  DepartmentServiceAccountReader,
  EmployeeCandidate,
  EmployeeImportNames,
  EmployeePlacementIds,
  EmployeeImportLookupData,
  EmployeeProfile,
  EmployeeRecord,
  LocalSeedFixtureFacts,
  ItAdminInCharge,
  NewOrganizationChange,
  OfficialFieldsPatch,
  OnboardingFacts,
  OrganizationChangeListener,
  OwningUnit,
  OrganizationRecord,
  ProfileNotice,
  ProfileNoticeRequest,
  UsableItAdmins,
} from './organization.types';

/** Public facade of the organization module: other modules call it in their own transaction, never the tables. */
@Injectable()
export class OrganizationService {
  /** The organization's time zone never changes after installation (I-8), so it is read once. */
  private timeZone: string | null = null;

  constructor(
    private readonly repo: OrganizationRepo,
    private readonly departments: DepartmentDirectoryService,
    private readonly employees: EmployeeDirectoryService,
    private readonly costCenters: CostCenterCatalogueService,
    private readonly serviceAccounts: DepartmentServiceAccountRegistry,
    private readonly use: DepartmentUseRegistry,
    private readonly changes: OrganizationChangeService,
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

  /** The departments with these ids in one read, by id (`LD-07`). */
  async getDepartmentBriefs(departmentIds: readonly string[], tx?: DbTx): Promise<DepartmentBrief[]> {
    return (await this.departments.findMany(departmentIds, tx)).flatMap((record) => toBrief(record) ?? []);
  }

  /** The same, held `FOR SHARE` until the caller transaction ends, so it cannot be made inactive between check and commit. */
  async lockDepartmentShared(tx: DbTx, departmentId: string): Promise<DepartmentBrief | null> {
    return toBrief(await this.departments.lockShared(tx, departmentId));
  }

  /** The department of the employee on `onDate` (default today), by id; null when they have none. */
  async getEmployeePlacement(
    employeeId: string,
    onDate?: BusinessDate,
    tx?: DbTx,
  ): Promise<EmployeePlacementIds | null> {
    return this.employees.placementOn(employeeId, onDate ?? (await this.businessToday(new Date(), tx)), tx);
  }

  /** The department of the employee on `onDate` and its IT Admin, named only while still working (`US-01-11` AC-4, AC-8). */
  async getItAdminInCharge(employeeId: string, onDate?: BusinessDate, tx?: DbTx): Promise<ItAdminInCharge | null> {
    const placement = await this.getEmployeePlacement(employeeId, onDate, tx);

    return (
      placement && {
        departmentId: placement.departmentId,
        itAdminEmployeeId: await this.departments.itAdminInChargeOf(placement.departmentId, tx),
      }
    );
  }

  /** The departments this employee is named IT Admin in charge of, while they still work (an unlocked read, `US-01-11`). */
  getDepartmentIdsInChargeOf(employeeId: string, tx?: DbTx): Promise<string[]> {
    return this.departments.idsInChargeOf(employeeId, tx);
  }

  /** What an IT Admin reads and handles: the departments that name them and, while nobody usable is named, every active one (F12). */
  getItAdminScope(employeeId: string, usableAmong: UsableItAdmins, tx?: DbTx): Promise<string[]> {
    return this.departments.itAdminScopeOf(employeeId, usableAmong, tx);
  }

  /** Everyone placed in the department on `onDate` (default today), by employee id; null when it does not exist. */
  async getDepartmentMemberIds(departmentId: string, onDate?: BusinessDate, tx?: DbTx): Promise<string[] | null> {
    return this.departments.memberIdsOn(departmentId, onDate ?? (await this.businessToday(new Date(), tx)), tx);
  }

  /** Who heads each of these departments on `onDate`; a department nobody heads is absent. */
  getDepartmentHeads(ids: string[], onDate: BusinessDate, tx?: DbTx): Promise<Map<string, DepartmentHeadRecord>> {
    return this.departments.headsOn(ids, onDate, tx);
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
  ): Promise<{ periodId: string }> {
    return this.departments.startHeadPeriod(tx, input);
  }

  /** A module that acts when the organization changes asks to be told in the transaction of the change (`FR-3.16`). */
  registerChangeListener(listener: OrganizationChangeListener): void {
    this.changes.register(listener);
  }

  /** F47 (`ops:inspect`, read only): how many changes of each kind had taken effect at `asOf` in their organization's calendar and were never marked as told. */
  countUnmarkedChangesAsOf(
    tx: DbTx,
    asOf: Date,
  ): Promise<Record<'PLACEMENT_START' | 'HEAD_PERIOD_START' | 'HEAD_PERIOD_END', number>> {
    return this.changes.countUnmarkedAsOf(tx, asOf);
  }

  /** Tells the registered listeners of a change that has taken effect, in the caller's transaction; one that throws rolls it back. */
  emitChange(tx: DbTx, change: NewOrganizationChange): Promise<void> {
    return this.changes.emit(tx, change);
  }

  /** The installation's organization, or null before bootstrap. */
  getOrganization(tx?: DbTx): Promise<OrganizationRecord | null> {
    return this.repo.findOrganization(tx);
  }

  /** The organization, its row held shared until `tx` ends: a caller freezing a value into the reporting currency (DB-01). */
  getOrganizationShared(tx: DbTx): Promise<OrganizationRecord | null> {
    return this.repo.findOrganizationShared(tx);
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

  /** Corrects the official fields of an employee whose row the caller holds `FOR UPDATE` (`US-02-02` AC-19). */
  updateEmployeeOfficialFields(tx: DbTx, employeeId: string, patch: OfficialFieldsPatch): Promise<void> {
    return this.employees.updateOfficialFields(tx, employeeId, patch);
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
  getEmployees(employeeIds: string[], tx?: DbTx): Promise<EmployeeRecord[]> {
    return this.employees.findMany(employeeIds, tx);
  }

  /** Employees who have not left, matched on code, name or work email, by code, minus `excludeEmployeeIds` (one query). */
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

  /** What a people file names, as the database knows it: departments, people and work-email owners. */
  async lookupForEmployeeImport(names: EmployeeImportNames, tx?: DbTx): Promise<EmployeeImportLookupData> {
    return this.employees.lookupForImport(tx, names, await this.businessToday(new Date(), tx));
  }

  /** The row locks a write of imported people needs: the departments (T-11). */
  lockForEmployeeImport(tx: DbTx, departmentIds: string[]): Promise<void> {
    return this.employees.lockForImport(tx, departmentIds);
  }

  /** The database clock at the start of the transaction: the instant the new employee's `created_at` gets. */
  employeeRecordingInstant(tx: DbTx): Promise<Date> {
    return this.employees.recordingInstant(tx);
  }

  /** `FOR SHARE` on the department a person is entered into (it must stay until commit), then its state; null if none. */
  lockDepartmentForEntry(tx: DbTx, organizationId: string, code: string): Promise<DepartmentEntryLock | null> {
    return this.departments.lockForEntry(tx, organizationId, code);
  }

  isEmployeeCodeTaken(tx: DbTx, organizationId: string, employeeCode: string): Promise<boolean> {
    return this.employees.isCodeTaken(tx, organizationId, employeeCode);
  }

  isWorkEmailTaken(tx: DbTx, organizationId: string, normalizedWorkEmail: string): Promise<boolean> {
    return this.employees.isWorkEmailTaken(tx, organizationId, normalizedWorkEmail);
  }

  /** Among these active departments, those nobody heads today: what the people import reports at its end (AC-1). */
  async departmentsWithoutHead(ids: string[]) {
    return (await this.departments.activeWithoutHead(await this.businessToday())).filter((d) => ids.includes(d.id));
  }

  /** The two local seed fixture items by their stable keys, in the caller's transaction (`pnpm dev:seed`); null when absent. */
  async readLocalSeedFixture(
    tx: DbTx,
    keys: { organizationId: string; costCenterCode: string; departmentCode: string },
  ): Promise<LocalSeedFixtureFacts> {
    const costCenter = await this.costCenters.findByCode(tx, keys.organizationId, keys.costCenterCode);
    const department = await this.departments.findByCode(tx, keys.organizationId, keys.departmentCode);
    const activated = await this.costCenters.isDirectionActivated(tx);

    return toLocalSeedFixtureFacts(costCenter, department, activated);
  }

  /** Records, for a new local database, that the Cost Center link is activated (`pnpm dev:seed`): no previous release to recover. */
  activateCostCenterDirectionForLocalSeed(tx: DbTx, organizationId: string): Promise<boolean> {
    return this.costCenters.recordLocalSeedActivation(tx, organizationId);
  }

  /** For each employee, the department they were in on `onDate` and its Unit: where a service account they answer for is owned and charged (`QĐ-86c`). */
  getOwningUnits(employeeIds: readonly string[], onDate: BusinessDate, tx?: DbTx): Promise<Map<string, OwningUnit>> {
    return this.departments.owningUnitsOn(employeeIds, onDate, tx);
  }

  /** The unit with the Cost Center a cost is charged to; the department may have none yet (`QĐ-87d(1)`): FinanceSetupIncompleteError. */
  requireUnitCostCenter(unit: OwningUnit): CostedOwningUnit {
    return this.departments.requireUnitCostCenter(unit);
  }

  /** `licensing` hands over how the organization reads the service accounts a department owns, when its module starts. */
  registerServiceAccountReader(reader: DepartmentServiceAccountReader): void {
    this.serviceAccounts.register(reader);
  }

  /** The first `limit` open or future service accounts the department owns and how many there are (`QĐ-86c`). */
  getOwnedServiceAccounts(departmentId: string, onDate: BusinessDate, limit: number, tx?: DbTx) {
    return this.serviceAccounts.current().ownedBy(departmentId, onDate, limit, tx);
  }

  /** The modules that hold what keeps a department in use (open work, subscriptions: `QĐ-90e`) register a reader when they start. */
  registerDepartmentUseReader(reader: DepartmentUseReader): void {
    this.use.registerDepartment(reader);
  }

  /** The first `limit` of each thing that keeps the department in use on `day` and how many there are: retiring waits for them. */
  getDepartmentUse(departmentId: string, day: BusinessDate, limit: number, tx?: DbTx): Promise<DepartmentUse> {
    return this.use.readDepartment(departmentId, day, limit, tx);
  }

  /** The same for a Cost Center: Requests with a cost not over and commitments held (`QĐ-87d(2)`), registered by their modules. */
  registerCostCenterUseReader(reader: CostCenterUseReader): void {
    this.use.registerCostCenter(reader);
  }

  getCostCenterUse(costCenterId: string, limit: number, tx?: DbTx): Promise<CostCenterUse> {
    return this.use.readCostCenter(costCenterId, limit, tx);
  }

  /** The notices a created or corrected employee record owes, to write with `NotificationsService.notifyInApp` in the same transaction (`F17`). */
  getProfileNotices(tx: DbTx, request: ProfileNoticeRequest): Promise<ProfileNotice[]> {
    return this.employees.profileNotices(tx, request);
  }

  /** Takes back the successor named to take over the department from a day after `today`; the caller holds the department lock. */
  clearDepartmentHeadSuccessor(
    tx: DbTx,
    departmentId: string,
    today: BusinessDate,
  ): Promise<ClearedHeadSuccessor | null> {
    return this.departments.clearHeadSuccessor(tx, departmentId, today);
  }

  /** The numbers and gaps of the onboarding checklist (US-02-04 AC-1, AC-6); with `tx`, in order in that transaction. */
  async getOnboardingFacts(tx?: DbTx): Promise<OnboardingFacts> {
    const today = await this.businessToday(new Date(), tx);
    // In order, in the caller's transaction when there is one (a transaction runs one statement at a time anyway).
    const activeDepartments = await this.departments.countActive(tx);
    const activeEmployees = await this.employees.countActive(tx);
    const withoutCostCenter = await this.costCenters.departmentsWithoutCostCenter(tx);
    const withoutHead = await this.departments.activeWithoutHead(today, tx);
    const withItAdmin = await this.departments.activeWithItAdmin(tx);

    return {
      activeDepartments,
      activeEmployees,
      departmentsWithoutCostCenter: withoutCostCenter.map(({ code, name }) => ({ code, name })),
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
