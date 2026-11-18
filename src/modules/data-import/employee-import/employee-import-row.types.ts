/**
 * The shape of one row of a people file, shared by the whole capability: the columns it may have, its cells and what judging it
 * said. How a row is read and judged is in `row-validation/`.
 */
export const EMPLOYEE_COLUMNS = [
  'employee_code',
  'full_name',
  'work_email',
  'employment_type',
  'hire_date',
  'department_code',
  'job_title',
] as const;
export type EmployeeColumn = (typeof EMPLOYEE_COLUMNS)[number];

/** The cells of one row of the file, by the column they were read into. */
export type EmployeeCells = Partial<Record<EmployeeColumn, string>>;

export type EmployeeRowOutcome = 'VALID' | 'ERROR' | 'EXISTS_SAME' | 'EXISTS_DIFFERENT';

export interface RowIssue {
  column: EmployeeColumn;
  code: string;
}

export interface RowDifference {
  column: EmployeeColumn;
  current: string;
  incoming: string;
}
