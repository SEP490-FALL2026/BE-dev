import { BusinessDate } from '../../../core/business-date';
import { CostCenterKind, CostCenterStatus } from '../organization-structure.types';
import { DepartmentStatus, HeadPeriodRecord } from '../organization-structure.types';

import type { EmployeeStatus, EmployeeWorkState, EmploymentType } from '../organization-employee.types';

export type { EmployeeStatus, EmployeeWorkState, EmploymentType };

export interface CreateOrganizationInput {
  name: string;
  timeZone: string;
  reportingCurrency: string;
}

/** A Cost Center is created for a department that exists, and linked to it in the same statement (`QĐ-87d(1)`). */
export interface CreateCostCenterInput {
  organizationId: string;
  code: string;
  name: string;
  departmentId: string;
}

/** A department is created with no Cost Center: Finance creates it for the department afterwards. */
export interface CreateDepartmentInput {
  organizationId: string;
  code: string;
  name: string;
}

export interface CreateEmployeeWithPlacementInput {
  organizationId: string;
  employeeCode: string;
  fullName: string;
  workEmail?: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  /**
   * The day the person becomes a member of the department (`QĐ-66ak`). Left out, it is the hire date: only
   * the installation command does that (`QĐ-67a`). Every path inside the application passes the day the person is
   * recorded, so no placement is ever made up for days before the person was in the system.
   */
  memberSince?: BusinessDate;
  departmentId: string;
  /** Free text (`QĐ-87e`); the catalogue entry is the database's business, not this call's. */
  jobTitle: string | null;
}

/** The official fields of an employee record the Super Admin may correct (`US-02-02` AC-19, `QĐ-87a`, no HR basis since `QĐ-93f`). */
export interface OfficialFieldsPatch {
  fullName?: string;
  workEmail?: string | null;
  employmentType?: EmploymentType;
  hireDate?: BusinessDate;
  /** Free text, null to clear it (`QĐ-87e`): its display form is what is stored. */
  jobTitle?: string | null;
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
  /** The free-text title on the record (`QĐ-87e`); null when there is none. */
  jobTitle?: string | null;
}

/**
 * What an IT Admin may read of a person: the least a technical task needs (grant, revoke, hand over), never the record, the
 * basis of an event or a verification. `effectiveOn` is the first day of the person's current period in the
 * department. Read only for the departments the IT Admin is in charge of or stands in for.
 */
export interface EmployeeTechnicalView {
  id: string;
  code: string;
  fullName: string;
  departmentId: string;
  employmentStatus: EmployeeWorkState;
  effectiveOn: BusinessDate;
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
  employeeCodes: string[];
  normalizedEmails: string[];
}

/** A department locked for the entry of a person, with what the entry needs to judge it: a department with no Cost Center takes people in (`QĐ-87d(3)`). */
export interface DepartmentEntryLock {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

/** The department an employee had on a day, by id. */
export interface EmployeePlacementIds {
  departmentId: string;
}

/** The department an employee was in on a day and the IT Admin in charge of it, named only while still working. */
/**
 * Which of these IT Admins can act now (they still work and hold the role on an account that can sign in). The accounts are another
 * module's, so a caller of an organization read that needs the answer brings it.
 */
export type UsableItAdmins = (employeeIds: readonly string[]) => Promise<ReadonlySet<string>>;

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
  departments: { id: string; code: string; active: boolean }[];
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
  /** Active departments with no Cost Center in use yet: Finance creates one for each (`QĐ-87d(1)`). */
  departmentsWithoutCostCenter: { code: string; name: string }[];
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
 * What taking back a named successor changed: the period that was removed and the head whose period is open again (it had been
 * ended the day before the successor's began), for the audit.
 */
export interface ClearedHeadSuccessor {
  successor: HeadPeriodRecord;
  restoredHead: HeadPeriodRecord | null;
}

/**
 * A notice an employee record owes, in the shape the inbox takes (`InAppNotificationInput`). It is declared here and not imported
 * so that the facade, which the installation command loads, does not reach the notifications module; the code that writes it
 * (`NotificationsApi.notifyInApp`) takes it as it is, and the compiler holds the two shapes together. Ids only.
 */
export interface ProfileNotice {
  organizationId: string;
  recipientEmployeeId: string;
  code: 'EMPLOYEE_PROFILE_CREATED' | 'EMPLOYEE_PROFILE_UPDATED';
  subject: { type: 'EMPLOYEE'; id: string };
  params: { employeeId: string; departmentId: string | null };
  eventKey: string;
}

/** The notices an employee record owes when it is created or corrected, as the inbox takes them (`QĐ-87b(3)`). */
export interface ProfileNoticeRequest {
  kind: 'CREATED' | 'UPDATED';
  organizationId: string;
  employeeId: string;
  onDate: BusinessDate;
}

/**
 * The department an employee was in on a day and its Unit (the Cost Center Finance created for the department and that is
 * in use). A department may have none (`QĐ-87d(1)`): `costCenter` is then null and whatever needs a Cost Center refuses
 * with `FINANCE.SETUP_INCOMPLETE` (`OrganizationApi.requireUnitCostCenter`).
 */
export interface OwningUnit {
  departmentId: string;
  costCenter: { id: string; code: string; status: CostCenterStatus } | null;
}

/** An {@link OwningUnit} whose department has a Cost Center in use: what a cost is charged to. */
export interface CostedOwningUnit extends OwningUnit {
  costCenter: { id: string; code: string; status: CostCenterStatus };
}

/**
 * The local seed fixture items as `pnpm dev:seed` compares them: every field the fixture fixes, the link
 * between the cost center and its department, and the ids it writes against. Null when absent.
 */
export interface LocalSeedFixtureFacts {
  /** Whether the Cost Center link of this local database is activated (a new local database has no previous release to recover). */
  costCenterDirectionActivated: boolean;
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
    costCenterId: string | null;
    costCenterCode: string | null;
  } | null;
}

/**
 * A period in which an employee heads a department that has not ended on the day asked about (`headPeriodsFrom`): `CURRENT` when it
 * has begun by then, `UPCOMING` when it begins later (a head from a later day, or a successor named for it).
 */
export interface EmployeeHeadPeriod {
  departmentId: string;
  departmentCode: string;
  validFrom: BusinessDate;
  validTo: BusinessDate | null;
  timing: 'CURRENT' | 'UPCOMING';
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

/** A change before it is announced: the row of its announcement gives it its `id`. */
export type NewOrganizationChange = OrganizationChange extends infer Change
  ? Change extends unknown
    ? Omit<Change, 'id'>
    : never
  : never;

/** What another module needs to know of a Cost Center to point at it: its code, name, kind and whether it takes new use. */
export interface CostCenterBrief {
  id: string;
  code: string;
  name: string;
  kind: CostCenterKind;
  status: CostCenterStatus;
  /** The department the Cost Center belongs to for its whole life (`QĐ-87d(1)`): who heads it is who answers for the budget. */
  departmentId: string;
}

/** The placement of a person in force on a day, with the days it covers: the first day, and the last (exclusive) when it is to end. */
export interface PlacementInForce {
  placementId: string;
  departmentId: string;
  validFrom: BusinessDate;
  validTo: BusinessDate | null;
}

/** A change of the department of a person from a day: what `scheduleStructureChange` writes. The title stays (`QĐ-87e`). */
export interface StructureChangeInput {
  organizationId: string;
  employeeId: string;
  effectiveOn: BusinessDate;
  departmentId: string;
}

/** The two placements a scheduled change wrote, and what the person had before it: what a later move or cancellation needs. */
export interface ScheduledStructureChange {
  closedPlacementId: string;
  openedPlacementId: string;
  from: { departmentId: string; validFrom: BusinessDate };
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
