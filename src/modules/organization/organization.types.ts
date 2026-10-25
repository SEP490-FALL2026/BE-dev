import { BusinessDate } from '../../core/business-date';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import { CostCenterKind, CostCenterStatus } from './cost-center/cost-center.types';
import { DepartmentStatus } from './department/department.types';
import { JobTitleStatus } from './job-title/job-title.types';

export type EmploymentType = 'STAFF' | 'CONTRACTOR' | 'FREELANCER' | 'INTERN';
export type EmployeeStatus = 'ACTIVE' | 'TERMINATED';
/** What a person is doing for the organization apart from whether they have left (`FR-2.13`). */
export type EmployeeWorkState = 'WORKING' | 'ON_LONG_LEAVE' | 'HANDING_OVER' | 'LEFT';

export interface CreateOrganizationInput {
  name: string;
  timeZone: string;
  reportingCurrency: string;
}

export interface CreateCostCenterInput {
  organizationId: string;
  code: string;
  name: string;
}

export interface CreateDepartmentInput {
  organizationId: string;
  code: string;
  name: string;
  costCenterId: string;
}

export interface CreateEmployeeWithPlacementInput {
  organizationId: string;
  employeeCode: string;
  fullName: string;
  workEmail?: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  /**
   * The day the person becomes a member of the department (`QĐ-66ak`, R-11). Left out, it is the hire date: only
   * the installation command does that (`QĐ-67a`). Every path inside the application passes the day the person is
   * recorded, so no placement is ever made up for days before the person was in the system.
   */
  memberSince?: BusinessDate;
  departmentId: string;
  jobTitleId: string;
}

/** The official fields of an employee record an IT Admin may correct on an HR basis (`US-02-02` AC-19). */
export interface OfficialFieldsPatch {
  fullName?: string;
  workEmail?: string | null;
  employmentType?: EmploymentType;
  hireDate?: BusinessDate;
}

export interface EmployeeRecord {
  id: string;
  organizationId: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  workState: EmployeeWorkState;
  hireDate: BusinessDate;
}

export interface EmployeeProfile {
  id: string;
  employeeCode: string;
  fullName: string;
  department: { code: string; name: string } | null;
  jobTitle: string | null;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  timeZone: string;
  reportingCurrency: string;
}

/** What a people file names, by what the import looks each of them up by. */
export interface EmployeeImportNames {
  departmentCodes: string[];
  normalizedJobTitleNames: string[];
  employeeCodes: string[];
  normalizedEmails: string[];
}

/** A department locked for the entry of a person, with what the entry needs to judge it. */
export interface DepartmentEntryLock {
  id: string;
  code: string;
  name: string;
  active: boolean;
  costCenterActive: boolean;
}

/** The department and the job title an employee had on a day, by id. */
export interface EmployeePlacementIds {
  departmentId: string;
  jobTitleId: string;
}

/** The department an employee was in on a day and the IT Admin in charge of it, named only while still working. */
export interface ItAdminInCharge {
  departmentId: string;
  itAdminEmployeeId: string | null;
}

export interface EmployeeCandidate {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  /** Department name at the date asked about. */
  department: string | null;
}

/** What a people file names, as the database knows it (for the import preview and its confirmation). */
export interface EmployeeImportLookupData {
  departments: { id: string; code: string; active: boolean; costCenterActive: boolean }[];
  jobTitles: { id: string; name: string; normalizedName: string; status: JobTitleStatus }[];
  employees: {
    id: string;
    employeeCode: string;
    fullName: string;
    workEmail: string | null;
    employmentType: EmploymentType;
    hireDate: BusinessDate;
    departmentCode: string | null;
    jobTitleName: string | null;
  }[];
  emailOwners: { normalizedEmail: string; employeeCode: string }[];
}

/** What the onboarding checklist needs to know about the organization (US-02-04). */
export interface OnboardingFacts {
  activeDepartments: number;
  activeEmployees: number;
  /** Active UNIT cost centers with no department yet: the department that is created next takes one of these. */
  freeCostCenters: number;
  departmentsWithoutHead: { code: string; name: string }[];
  /** Active departments and the employee named IT Admin in charge, to be judged by the account side. */
  departmentsByItAdmin: {
    code: string;
    name: string;
    itAdminEmployeeId: string | null;
    itAdminStatus: 'ACTIVE' | 'TERMINATED' | null;
  }[];
}

/**
 * What the organization needs to know of the service accounts a department owns, without importing `licensing`: the
 * first `limit` of those that are open or will be, and how many there are in all. `licensing` registers the reader when
 * its module starts (as `licensing` does for the seats the catalog reads).
 */
export interface DepartmentServiceAccountReader {
  ownedBy(
    departmentId: string,
    day: BusinessDate,
    limit: number,
    tx?: DbTx,
  ): Promise<{ items: { assignmentId: string; accountIdentifier: string }[]; total: number }>;
}

/** The department an employee was in on a day and its Unit (the Cost Center the department is charged to). */
export interface OwningUnit {
  departmentId: string;
  costCenter: { id: string; code: string; status: CostCenterStatus };
}

/**
 * The local seed fixture items as `pnpm dev:seed` compares them (P23-RV-01): every field the fixture fixes, the link
 * between the cost center and its department, and the ids it writes against. Null when absent.
 */
export interface LocalSeedFixtureFacts {
  costCenter: {
    id: string;
    code: string;
    name: string;
    kind: CostCenterKind;
    status: CostCenterStatus;
    departmentCode: string | null;
  } | null;
  department: {
    id: string;
    code: string;
    name: string;
    status: DepartmentStatus;
    costCenterId: string;
    costCenterCode: string;
  } | null;
  jobTitle: { id: string; name: string; normalizedName: string; status: JobTitleStatus } | null;
}

/** What another module needs to know of a department to point at it: its code, name and whether it and its Cost Center are active. */
export interface DepartmentBrief {
  id: string;
  code: string;
  name: string;
  active: boolean;
  /** A retired Cost Center has no people (`US-04-09` AC-3), so a department charged to one takes nobody in. */
  costCenterActive: boolean;
}

/**
 * A change of the organization that has taken effect, told to the modules that act on it, in the transaction of the change
 * (`FR-3.16`). The contract is the one of `g6-transfer-record` (`PLACEMENT_START`, `HEAD_PERIOD_START`, `HEAD_PERIOD_END`) with
 * one more kind for a person who has left (`EMPLOYEE_LEFT`), which `g6-offboarding-record` announces when it writes the
 * `TERMINATED` status. `id` identifies the change: a listener that must not act twice keys on it.
 *
 * Until `g6-transfer-record` is built, the only changes announced are the head periods the department use cases write for a
 * day that is today; the transfer of a person and the leaving of a person are announced by the items that write them.
 */
export type OrganizationChange =
  | {
      id: string;
      kind: 'PLACEMENT_START';
      placementId: string;
      employeeId: string;
      fromDepartmentId: string | null;
      toDepartmentId: string;
      fromJobTitleId: string | null;
      toJobTitleId: string;
      effectiveOn: BusinessDate;
    }
  | {
      id: string;
      kind: 'HEAD_PERIOD_START';
      periodId: string;
      departmentId: string;
      headEmployeeId: string;
      previousHeadEmployeeId: string | null;
      effectiveOn: BusinessDate;
    }
  | {
      id: string;
      kind: 'HEAD_PERIOD_END';
      periodId: string;
      departmentId: string;
      headEmployeeId: string;
      effectiveOn: BusinessDate;
    }
  | { id: string; kind: 'EMPLOYEE_LEFT'; employeeId: string; effectiveOn: BusinessDate };

/** A change before it is announced: the registry gives it its `id`. */
export type NewOrganizationChange = OrganizationChange extends infer Change
  ? Change extends unknown
    ? Omit<Change, 'id'>
    : never
  : never;

/**
 * A module that acts on a change of the organization. It is called in the transaction of the change, in the order the
 * listeners were registered; throwing rolls the change back with it.
 */
export interface OrganizationChangeListener {
  onChange(tx: DbTx, change: OrganizationChange): Promise<void>;
}

/** What another module needs to know of a Cost Center to point at it: its code, name, kind and whether it takes new use. */
export interface CostCenterBrief {
  id: string;
  code: string;
  name: string;
  kind: CostCenterKind;
  status: CostCenterStatus;
}

/** The placement of a person in force on a day, with the days it covers: the first day, and the last (exclusive) when it is to end. */
export interface PlacementInForce {
  placementId: string;
  departmentId: string;
  jobTitleId: string;
  validFrom: BusinessDate;
  validTo: BusinessDate | null;
}

/** A change of the department and/or the job title of a person from a day: what `scheduleStructureChange` writes. */
export interface StructureChangeInput {
  organizationId: string;
  employeeId: string;
  effectiveOn: BusinessDate;
  departmentId: string;
  jobTitleId: string;
}

/** The two placements a scheduled change wrote, and what the person had before it: what a later move or cancellation needs. */
export interface ScheduledStructureChange {
  closedPlacementId: string;
  openedPlacementId: string;
  from: { departmentId: string; jobTitleId: string; validFrom: BusinessDate };
}

/**
 * The head periods a scheduled handover moved: the period of the person leaving (ended on the day, `endedPeriodValidTo` is
 * where it ended before, null when it was open) and the period of the successor it opened, null when nobody follows.
 */
export interface HeadHandoverRecord {
  endedPeriodId: string;
  endedPeriodValidTo: BusinessDate | null;
  createdPeriodId: string | null;
}

/** A department and a day to ask who heads it on. */
export interface HeadOnDateQuery {
  departmentId: string;
  onDate: BusinessDate;
}

/** A period in which a person heads a department; `validTo` is the first day they no longer do, null while it is open. */
export interface HeadPeriodOfEmployee {
  departmentId: string;
  validFrom: BusinessDate;
  validTo: BusinessDate | null;
}

export interface HeadHandoverInput {
  organizationId: string;
  departmentId: string;
  outgoingEmployeeId: string;
  effectiveOn: BusinessDate;
  successorEmployeeId: string | null;
}
