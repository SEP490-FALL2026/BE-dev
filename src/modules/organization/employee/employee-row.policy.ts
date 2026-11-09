import { isEmployeeCodeValid, isDepartmentCodeValid } from '../public/organization-code.policy';
import { normalizeDisplayName } from '../../../core/display-name';
import {
  PlacementReasonCode,
  PlacementSubject,
  isJobTitleTooLong,
  placementReasons,
} from '../public/employee-placement.policy';

/** The shared placement reasons, then the two keys the form checks against the people already there. */
export type EmployeeRowReasonCode =
  | PlacementReasonCode
  | 'EMPLOYEE_CODE_INVALID'
  | 'DEPARTMENT_CODE_INVALID'
  | 'EMPLOYEE_CODE_TAKEN'
  | 'WORK_EMAIL_TAKEN'
  /** The code or the email is the record of the person entering: nobody enters their own (`US-02-02` AC-18). */
  | 'OWN_RECORD';

/** The form field a reason is about (the import names a file column instead). */
export type EmployeeRowField = 'departmentCode' | 'jobTitle' | 'employeeCode' | 'workEmail';

/** Where the form shows a placement reason. */
const FORM_FIELD: Record<PlacementSubject, EmployeeRowField> = {
  DEPARTMENT: 'departmentCode',
  JOB_TITLE: 'jobTitle',
};

export interface EmployeeRowReason {
  field: EmployeeRowField;
  code: EmployeeRowReasonCode;
}

/** What was looked up for the row, under the locks the caller holds. */
export interface EmployeeRowLookup {
  /** The department the row's code names; null when there is none. */
  department: { id: string; active: boolean } | null;
  employeeCodeTaken: boolean;
  workEmailTaken: boolean;
  /** The code, or the normalized email, is the one of the person who is entering. */
  ownCode?: boolean;
  ownEmail?: boolean;
}

const isBlank = (value: string | null | undefined): boolean =>
  value === undefined || value === null || value.trim() === '';

/**
 * Why a row of the manual form cannot become an employee. Whether the department can take someone in and the job title
 * is bounded (it is optional free text, `QĐ-87e`) is the placement policy the import preview shares; this adapter reads
 * blank fields the form's way, shows each reason on its form field, then adds the taken code and email — after the placement
 * reasons, and a taken code is a reason here, not an existing person to compare. It lists every reason at once, in a
 * fixed order, so one attempt shows everything to fix. It decides from what the caller looked up and nothing else.
 */
export function validateEmployeeRow(
  row: { employeeCode?: string; departmentCode?: string | null; jobTitle?: string | null },
  lookup: EmployeeRowLookup,
): EmployeeRowReason[] {
  const reasons: EmployeeRowReason[] = placementReasons({
    department: { named: !isBlank(row.departmentCode), found: lookup.department },
    jobTitle: { tooLong: isJobTitleTooLong(normalizeDisplayName(row.jobTitle ?? '')) },
  }).map(({ subject, code }) => ({ field: FORM_FIELD[subject], code }));

  if (row.employeeCode !== undefined && !isEmployeeCodeValid(row.employeeCode))
    reasons.push({ field: 'employeeCode', code: 'EMPLOYEE_CODE_INVALID' });
  if (!isBlank(row.departmentCode) && !isDepartmentCodeValid(row.departmentCode!.trim().toUpperCase())) {
    const index = reasons.findIndex((reason) => reason.field === 'departmentCode');
    if (index >= 0) reasons.splice(index, 1);
    reasons.unshift({ field: 'departmentCode', code: 'DEPARTMENT_CODE_INVALID' });
  }
  if (lookup.ownCode) reasons.push({ field: 'employeeCode', code: 'OWN_RECORD' });
  else if (lookup.employeeCodeTaken) reasons.push({ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' });
  if (lookup.ownEmail) reasons.push({ field: 'workEmail', code: 'OWN_RECORD' });
  else if (lookup.workEmailTaken) reasons.push({ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' });

  return reasons;
}
