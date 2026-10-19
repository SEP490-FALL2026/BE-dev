import { JobTitleStatus } from '../job-title/job-title.types';

export type EmployeeRowReasonCode =
  | 'DEPARTMENT_REQUIRED'
  | 'DEPARTMENT_NOT_FOUND'
  | 'DEPARTMENT_INACTIVE'
  | 'DEPARTMENT_COST_CENTER_INACTIVE'
  | 'JOB_TITLE_REQUIRED'
  | 'JOB_TITLE_NOT_FOUND'
  | 'JOB_TITLE_INACTIVE'
  | 'EMPLOYEE_CODE_TAKEN'
  | 'WORK_EMAIL_TAKEN';

/** The field of the row a reason is about, named as the form (and the import file column) names it. */
export type EmployeeRowField = 'departmentCode' | 'jobTitleId' | 'employeeCode' | 'workEmail';

export interface EmployeeRowReason {
  field: EmployeeRowField;
  code: EmployeeRowReasonCode;
}

/** What was looked up for the row, under the locks the caller holds. */
export interface EmployeeRowLookup {
  /** The department the row's code names; null when there is none. */
  department: { id: string; active: boolean; costCenterActive: boolean } | null;
  /** The job title the row's id names; null when there is none. */
  jobTitle: { status: JobTitleStatus } | null;
  employeeCodeTaken: boolean;
  workEmailTaken: boolean;
}

const isBlank = (value: string | null | undefined): boolean =>
  value === undefined || value === null || value.trim() === '';

/**
 * Why a row cannot become an employee (T-16): one list of reasons shared by the manual form and, later, by the
 * import preview, so the two never disagree about what is refused. It lists every reason at once, in a fixed
 * order, so one attempt shows everything to fix. It decides from what the caller looked up and nothing else.
 */
export function validateEmployeeRow(
  row: { departmentCode?: string | null; jobTitleId?: string | null },
  lookup: EmployeeRowLookup,
): EmployeeRowReason[] {
  const reasons: EmployeeRowReason[] = [];

  if (isBlank(row.departmentCode)) reasons.push({ field: 'departmentCode', code: 'DEPARTMENT_REQUIRED' });
  else if (!lookup.department) reasons.push({ field: 'departmentCode', code: 'DEPARTMENT_NOT_FOUND' });
  else if (!lookup.department.active) reasons.push({ field: 'departmentCode', code: 'DEPARTMENT_INACTIVE' });
  else if (!lookup.department.costCenterActive) {
    // A retired cost center has no people (US-04-09 AC-3); a department charged to one cannot take anyone in.
    reasons.push({ field: 'departmentCode', code: 'DEPARTMENT_COST_CENTER_INACTIVE' });
  }

  if (isBlank(row.jobTitleId)) reasons.push({ field: 'jobTitleId', code: 'JOB_TITLE_REQUIRED' });
  else if (!lookup.jobTitle) reasons.push({ field: 'jobTitleId', code: 'JOB_TITLE_NOT_FOUND' });
  else if (lookup.jobTitle.status === 'INACTIVE') reasons.push({ field: 'jobTitleId', code: 'JOB_TITLE_INACTIVE' });

  if (lookup.employeeCodeTaken) reasons.push({ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' });
  if (lookup.workEmailTaken) reasons.push({ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' });

  return reasons;
}
