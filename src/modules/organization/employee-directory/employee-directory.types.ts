import type { BusinessDate } from '../../../core/business-date';
import type { EmployeeStatus, EmployeeWorkState, EmploymentType } from '../public/organization.types';

export const EMPLOYEE_PLACEMENT_HISTORY_LIMIT = 50;

export interface EmployeeListRow {
  id: string;
  employee_code: string;
  full_name: string;
  work_email: string | null;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  work_state: EmployeeWorkState;
  hire_date: Date;
  job_title: string | null;
  department_id: string | null;
  department_code: string | null;
  department_name: string | null;
  unplaced: boolean;
}

export interface EmployeePlacementHistoryRecord {
  department: {
    id: string;
    code: string;
    name: string;
  };
  validFrom: BusinessDate;
  validTo: BusinessDate | null;
}

export interface EmployeeDirectoryFilter {
  q?: string;
  departmentId?: string;
  unplaced?: boolean;
  workState?: EmployeeWorkState;
  employmentType?: EmploymentType;
  accountEmployeeIds?: readonly string[];
  excludeAccountEmployeeIds?: readonly string[];
  page: number;
  pageSize: number;
}
