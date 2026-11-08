import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CostCenterCatalogueService } from '../cost-center/cost-center-catalogue.service';
import { DepartmentRecordService } from '../department/department-record.service';
import { OrganizationChangeService } from '../change-announcement/organization-change.service';
import { DepartmentHeadRecord } from '../department/department.types';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { toBrief } from '../organization-brief.mapper';
import { OrganizationContextService } from '../organization-context.service';
import { OrganizationRepo } from '../organization.repo';
import {
  CostCenterBrief,
  CostedOwningUnit,
  DepartmentBrief,
  DepartmentEntryLock,
  EmployeeCandidate,
  EmployeeHeadPeriod,
  EmployeeImportNames,
  EmployeePlacementIds,
  EmployeeImportLookupData,
  EmployeeProfile,
  EmployeeRecord,
  ItAdminInCharge,
  OnboardingFacts,
  OwningUnit,
  OrganizationRecord,
  ProfileNotice,
  ProfileNoticeRequest,
  UsableItAdmins,
} from './organization.types';

/**
 * Public facade of the organization module for what other modules READ: departments, employees, Cost Centers, who heads and who is IT
 * Admin in charge, today in the organization's calendar, and the locks taken `FOR SHARE` to keep a value read stable until commit.
 * Writes and `FOR UPDATE` locks are `OrganizationApi`. Other modules call it in their own transaction, never the tables.
 */
@Injectable()
export class OrganizationReadApi {
  constructor(
    private readonly repo: OrganizationRepo,
    private readonly departments: DepartmentRecordService,
    private readonly employees: EmployeeRecordService,
    private readonly costCenters: CostCenterCatalogueService,
    private readonly changes: OrganizationChangeService,
    private readonly context: OrganizationContextService,
  ) {}

  unplacedAmong(employeeIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    return this.employees.unplacedAmong(employeeIds, tx);
  }

  async getScheduledFirstPlacement(
    employeeId: string,
    onDate?: BusinessDate,
    tx?: DbTx,
  ): Promise<{ placementId: string; departmentId: string; validFrom: BusinessDate } | null> {
    return this.employees.scheduledFirstPlacement(employeeId, onDate ?? (await this.businessToday(new Date(), tx)), tx);
  }

  /** Today in the organization's own calendar (`now` is a parameter for tests; `tx` reads the zone in the caller's transaction). */
  businessToday(now: Date = new Date(), tx?: DbTx): Promise<BusinessDate> {
    return this.context.businessToday(now, tx);
  }

  /** True when the employee heads a department or has a head period not yet ended: never a Super Admin (FR-8.7, AC-3). */
  async isDepartmentHead(employeeId: string, tx?: DbTx): Promise<boolean> {
    return this.departments.hasHeadPeriodFrom(tx, employeeId, await this.businessToday());
  }

  /** The department this employee heads on `onDate` (default today), or null; unlocked, for the per-request role check. */
  async getHeadedDepartment(employeeId: string, onDate?: BusinessDate): Promise<{ departmentId: string } | null> {
    return this.departments.headedDepartment(employeeId, onDate ?? (await this.businessToday()));
  }

  /** The Cost Center in use each of these departments is charged to, by department id (a department with none is absent). */
  getUnitCostCenterIds(departmentIds: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    return this.departments.unitCostCenterIds(departmentIds, tx);
  }

  /** Who is to head a department that is not yet in effect, from the day it takes effect; null when nobody or when it is in effect (`QĐ-106k`). */
  getUpcomingHeadOf(departmentId: string, today: BusinessDate, tx?: DbTx): Promise<string | null> {
    return this.departments.upcomingHeadOf(departmentId, today, tx);
  }

  /**
   * The departments not yet in effect that the employee is to head from the day they take effect, each with the day and the Cost Center
   * in use when there is one: the head of a department made for next year works for it before it starts (`QĐ-106k`).
   */
  getUpcomingHeadedUnits(employeeId: string, today: BusinessDate, tx?: DbTx) {
    return this.departments.upcomingHeadedUnits(employeeId, today, tx);
  }

  /**
   * The periods in which the employee heads a department that have not ended on `onDate` (default today in the organization's
   * calendar), oldest first, each with the code of its department and `CURRENT` or `UPCOMING`. Empty when there is none. `tx` reads
   * in the caller's transaction (the revoke of `MANAGER` and the grant of `SPENDING_APPROVER` give the periods in their refusal).
   */
  async headPeriodsFrom(employeeId: string, onDate?: BusinessDate, tx?: DbTx): Promise<EmployeeHeadPeriod[]> {
    const day = onDate ?? (await this.businessToday(new Date(), tx));
    const periods = await this.departments.headPeriodsOf(employeeId, day, tx);
    if (periods.length === 0) return [];
    const briefs = await this.getDepartmentBriefs([...new Set(periods.map((period) => period.departmentId))], tx);
    const codes = new Map(briefs.map((brief) => [brief.id, brief.code]));

    return periods.map((period) => ({
      departmentId: period.departmentId,
      departmentCode: codes.get(period.departmentId) ?? '',
      validFrom: period.validFrom,
      validTo: period.validTo,
      timing: period.validFrom <= day ? 'CURRENT' : 'UPCOMING',
    }));
  }

  /** The department with this id: its code, name and whether it is still active; null when there is none. */
  async getDepartmentBrief(departmentId: string, tx?: DbTx): Promise<DepartmentBrief | null> {
    return toBrief(await this.departments.find(departmentId, tx));
  }

  /** The departments with these ids in one read, by id. */
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

  /** The IT Admin in charge of the department, named only while still working; null when there is none (`US-01-11`). */
  getItAdminInChargeOfDepartment(departmentId: string, tx?: DbTx): Promise<string | null> {
    return this.departments.itAdminInChargeOf(departmentId, tx);
  }

  /** The departments this employee is named IT Admin in charge of, while they still work (an unlocked read, `US-01-11`). */
  getDepartmentIdsInChargeOf(employeeId: string, tx?: DbTx): Promise<string[]> {
    return this.departments.idsInChargeOf(employeeId, tx);
  }

  /** What an IT Admin reads and handles: the departments that name them and, while nobody usable is named, every active one. */
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

  /** For `ops:inspect` (read only): how many changes of each kind had taken effect at `asOf` in their organization's calendar and were never marked as told. */
  countUnmarkedChangesAsOf(
    tx: DbTx,
    asOf: Date,
  ): Promise<Record<'PLACEMENT_START' | 'HEAD_PERIOD_START' | 'HEAD_PERIOD_END', number>> {
    return this.changes.countUnmarkedAsOf(tx, asOf);
  }

  /** The installation's organization, or null before bootstrap. */
  getOrganization(tx?: DbTx): Promise<OrganizationRecord | null> {
    return this.repo.findOrganization(tx);
  }

  /** The organization, its row held shared until `tx` ends: a caller freezing a value into the reporting currency (DB-01). */
  getOrganizationShared(tx: DbTx): Promise<OrganizationRecord | null> {
    return this.repo.findOrganizationShared(tx);
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

  /** `FOR SHARE`, when the caller needs the status to stay stable. `FOR UPDATE`: `OrganizationApi.lockEmployeeForUpdate`. */
  lockEmployeeForShare(tx: DbTx, employeeId: string): Promise<void> {
    return this.employees.lock(tx, employeeId, 'SHARE');
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

  /** The row locks a write of imported people needs: the departments. */
  lockForEmployeeImport(tx: DbTx, departmentIds: string[]): Promise<void> {
    return this.employees.lockForImport(tx, departmentIds);
  }

  /** `FOR SHARE` on the department a person is entered into (it must stay until commit), then its state; null if none. */
  lockDepartmentForEntry(tx: DbTx, organizationId: string, code: string): Promise<DepartmentEntryLock | null> {
    return this.departments.lockForEntry(tx, organizationId, code);
  }

  isWorkEmailTaken(tx: DbTx, organizationId: string, normalizedWorkEmail: string): Promise<boolean> {
    return this.employees.isWorkEmailTaken(tx, organizationId, normalizedWorkEmail);
  }

  /** Among these active departments, those nobody heads today: what the people import reports at its end (AC-1). */
  async departmentsWithoutHead(ids: string[]) {
    return (await this.departments.activeWithoutHead(await this.businessToday())).filter((d) => ids.includes(d.id));
  }

  /** For each employee, the department they were in on `onDate` and its Unit: where a service account they answer for is owned and charged (`QĐ-86c`). */
  getOwningUnits(employeeIds: readonly string[], onDate: BusinessDate, tx?: DbTx): Promise<Map<string, OwningUnit>> {
    return this.departments.owningUnitsOn(employeeIds, onDate, tx);
  }

  /** The unit with the Cost Center a cost is charged to; the department may have none yet (`QĐ-87d(1)`): FinanceSetupIncompleteError. */
  requireUnitCostCenter(unit: OwningUnit): CostedOwningUnit {
    return this.departments.requireUnitCostCenter(unit);
  }

  /** The notices a created or corrected employee record owes, to write with `NotificationsApi.notifyInApp` in the same transaction. */
  getProfileNotices(tx: DbTx, request: ProfileNoticeRequest): Promise<ProfileNotice[]> {
    return this.employees.profileNotices(tx, request);
  }

  /**
   * The ids of the departments that are not stopped and take effect by the end of `year`, by id; `tx` reads in the caller's
   * transaction (the budget cycle of that year divides among them).
   */
  getActiveDepartmentIds(year: number, tx?: DbTx): Promise<string[]> {
    return this.departments.activeIds(year, tx);
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
