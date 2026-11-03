import { fromDateColumn } from '../../../core/business-date';
import type { EmployeeAccountDetail, EmployeeAccountSummary } from '../public/organization.extension-points';
import type { EmployeeListRow, EmployeePlacementHistoryRecord } from './employee-directory.types';

export interface EmployeeSummaryWire {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmployeeListRow['employment_type'];
  status: EmployeeListRow['status'];
  workState: EmployeeListRow['work_state'];
  hireDate: string;
  jobTitle: string | null;
  department: {
    id: string;
    code: string;
    name: string;
  } | null;
  unplaced: boolean;
  account: {
    id: string;
    status: 'ACTIVE' | 'LOCKED';
    activationState: 'INVITED' | 'ACTIVATED';
    employeeLeft: boolean;
  } | null;
}

export interface EmployeeDetailWire extends EmployeeSummaryWire {
  placements: {
    department: {
      id: string;
      code: string;
      name: string;
    };
    validFrom: string;
    validTo: string | null;
  }[];
  placementsHasMore: boolean;
  account: {
    id: string;
    status: 'ACTIVE' | 'LOCKED';
    activationState: 'INVITED' | 'ACTIVATED';
    employeeLeft: boolean;
    roles: readonly string[];
  } | null;
}

export function toEmployeeSummaryWire(
  row: EmployeeListRow,
  account: EmployeeAccountSummary | undefined,
): EmployeeSummaryWire {
  return {
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    workEmail: row.work_email,
    employmentType: row.employment_type,
    status: row.status,
    workState: row.work_state,
    hireDate: fromDateColumn(row.hire_date),
    jobTitle: row.job_title,
    department:
      row.department_id !== null && row.department_code !== null && row.department_name !== null
        ? {
            id: row.department_id,
            code: row.department_code,
            name: row.department_name,
          }
        : null,
    unplaced: row.unplaced,
    account: account
      ? {
          id: account.id,
          status: account.status,
          activationState: account.activationState,
          employeeLeft: account.employeeLeft,
        }
      : null,
  };
}

export function toEmployeeDetailWire(
  row: EmployeeListRow,
  placements: readonly EmployeePlacementHistoryRecord[],
  placementsHasMore: boolean,
  account: EmployeeAccountDetail | null,
): EmployeeDetailWire {
  const summary = toEmployeeSummaryWire(row, account ?? undefined);

  return {
    ...summary,
    placements: placements.map((p) => ({
      department: p.department,
      validFrom: p.validFrom,
      validTo: p.validTo,
    })),
    placementsHasMore,
    account: account
      ? {
          id: account.id,
          status: account.status,
          activationState: account.activationState,
          employeeLeft: account.employeeLeft,
          roles: account.roles,
        }
      : null,
  };
}
