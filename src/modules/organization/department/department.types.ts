import { BusinessDate } from '../../../core/business-date';
import { CostCenterStatus } from '../cost-center/cost-center.types';
import { EmployeeStatus, EmployeeWorkState } from '../employee/employee.types';
import { ProjectRecord } from '../project/project.types';

export type DepartmentStatus = 'ACTIVE' | 'INACTIVE';

/**
 * Why a department needs attention (US-03-06 AC-9, AC-15): it has no head, no usable IT Admin in charge, or no Cost Center in use yet
 * (its finance configuration is incomplete, `QĐ-87d(1)`; Finance creates the Cost Center for it).
 */
export type DepartmentWarning = 'MISSING_HEAD' | 'MISSING_IT_ADMIN' | 'MISSING_COST_CENTER';

/** How many head periods a profile shows, and how many a head change reads back to find the one in force. */
export const DEPARTMENT_HEAD_HISTORY_LIMIT = 50;

export interface DepartmentRecord {
  id: string;
  code: string;
  name: string;
  functionDescription: string | null;
  status: DepartmentStatus;
  /** The Cost Center Finance created for the department and that is in use; null while it has none (`QĐ-87d(1)`). */
  costCenter: { id: string; code: string; name: string; status: CostCenterStatus } | null;
  itAdmin: { employeeId: string; employeeCode: string; fullName: string; employeeStatus: EmployeeStatus } | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
}

export interface HeadPeriodRecord {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  validFrom: BusinessDate;
  validTo: BusinessDate | null;
}

/** Who heads a department on a day, and since when. */
export interface DepartmentHeadRecord {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  since: BusinessDate;
}

/** What making room for a new head from a day changed: the periods cancelled and the periods ended, for the audit. */
export interface HeadPeriodChanges {
  cancelled: HeadPeriodRecord[];
  ended: HeadPeriodRecord[];
  /** The ids of the periods in `ended` and of those in `cancelled`, each in the same order: what a change announced to the listeners names. */
  endedPeriodIds: string[];
  cancelledPeriodIds: string[];
}

export interface DepartmentView extends DepartmentRecord {
  head: DepartmentHeadRecord | null;
  memberCount: number;
  warnings: DepartmentWarning[];
  /** Whether the IT Admin named still holds the role on a usable account. Meaningful only when `itAdmin` is set. */
  itAdminUsable: boolean;
}

export interface DepartmentProfileView extends DepartmentView {
  /** The person named to take over from a day after today, with that day in `since`; null when nobody is (`QĐ-87` `D-5`). */
  successor: DepartmentHeadRecord | null;
  headHistory: HeadPeriodRecord[];
  /** The department had more head periods than the {@link DEPARTMENT_HEAD_HISTORY_LIMIT} shown. */
  headHistoryHasMore: boolean;
  projects: ProjectRecord[];
  /** How many projects the department takes part in; `projects` holds the first of them only. */
  projectTotal: number;
}

/** One active department that needs attention, for the IT Admin and the Super Admin (US-03-06 AC-9, AC-15). */
export interface DepartmentWarningItem {
  departmentId: string;
  code: string;
  name: string;
  warning: DepartmentWarning;
}

/** What a department head, or the IT Admin, may see of one person in the department. */
export interface DepartmentMemberRecord {
  employeeCode: string;
  fullName: string;
  status: EmployeeStatus;
  workState: EmployeeWorkState;
  hasWorkEmail: boolean;
  /** The first day of the person's current period in the department. */
  memberSince: BusinessDate;
}
