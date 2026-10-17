import { BusinessDate } from '../../core/business-date';
import { CostCenterStatus } from './cost-center.types';
import { EmployeeStatus } from './organization.types';

export type DepartmentStatus = 'ACTIVE' | 'INACTIVE';
export type ProjectStatus = 'RUNNING' | 'FINISHED';

/** Why a department needs attention (US-03-06 AC-9, AC-15). */
export type DepartmentWarning = 'MISSING_HEAD' | 'MISSING_IT_ADMIN';

export interface DepartmentRecord {
  id: string;
  code: string;
  name: string;
  functionDescription: string | null;
  status: DepartmentStatus;
  costCenter: { id: string; code: string; name: string; status: CostCenterStatus };
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

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  departments: { id: string; code: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;
}

/** What a department head, or the IT Admin, may see of one person in the department. */
export interface DepartmentMemberRecord {
  employeeCode: string;
  fullName: string;
  status: EmployeeStatus;
  hasWorkEmail: boolean;
  /** The first day of the person's current period in the department. */
  memberSince: BusinessDate;
}
