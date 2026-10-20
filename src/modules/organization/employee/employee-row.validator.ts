import { PlacementReasonCode, PlacementSubject, placementReasons } from '../employee-placement.policy';
import { JobTitleStatus } from '../job-title/job-title.types';

/** The shared placement reasons (BEH.1), then the two keys the form checks against the people already there. */
export type EmployeeRowReasonCode = PlacementReasonCode | 'EMPLOYEE_CODE_TAKEN' | 'WORK_EMAIL_TAKEN';

/** The form field a reason is about (the import names a file column instead: H8 D-1). */
export type EmployeeRowField = 'departmentCode' | 'jobTitleId' | 'employeeCode' | 'workEmail';

/** Where the form shows a placement reason. */
const FORM_FIELD: Record<PlacementSubject, EmployeeRowField> = {
  DEPARTMENT: 'departmentCode',
  JOB_TITLE: 'jobTitleId',
};

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
 * Why a row of the manual form cannot become an employee (T-16). Whether the department and the job title can take
 * someone in is the placement policy the import preview shares (BEH.1); this adapter reads blank fields the form's
 * way, shows each reason on its form field, then adds the taken code and email — after the placement reasons, and a
 * taken code is a reason here, not an existing person to compare (H8 D-2, D-3). It lists every reason at once, in a
 * fixed order, so one attempt shows everything to fix. It decides from what the caller looked up and nothing else.
 */
export function validateEmployeeRow(
  row: { departmentCode?: string | null; jobTitleId?: string | null },
  lookup: EmployeeRowLookup,
): EmployeeRowReason[] {
  const reasons: EmployeeRowReason[] = placementReasons({
    department: { named: !isBlank(row.departmentCode), found: lookup.department },
    jobTitle: {
      named: !isBlank(row.jobTitleId),
      found: lookup.jobTitle === null ? null : { active: lookup.jobTitle.status !== 'INACTIVE' },
    },
  }).map(({ subject, code }) => ({ field: FORM_FIELD[subject], code }));

  if (lookup.employeeCodeTaken) reasons.push({ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' });
  if (lookup.workEmailTaken) reasons.push({ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' });

  return reasons;
}
