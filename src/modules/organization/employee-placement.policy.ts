/**
 * BEH.1 (A4-11): whether the department (with its cost center) and the job title a row names can take a person in —
 * the one decision the manual form (`employee/employee-row.validator.ts`) and the import preview
 * (`data-import/employee-import/employee-import-rows.ts`) share (T-16, `US-02-02` AC-14). It is semantic only: it knows
 * no form field, file column, DTO, database row or repository. Each adapter tells what it found, maps `subject` to its
 * own field or column, and adds the reasons of its own workflow (taken keys, duplicates in a file, other cells).
 */

/** What the caller found for the department and the job title a row names. `found` is read only when `named`. */
export interface PlacementFacts {
  department: { named: boolean; found: { active: boolean; costCenterActive: boolean } | null };
  jobTitle: { named: boolean; found: { active: boolean } | null };
}

export type PlacementSubject = 'DEPARTMENT' | 'JOB_TITLE';

export type PlacementReasonCode =
  | 'DEPARTMENT_REQUIRED'
  | 'DEPARTMENT_NOT_FOUND'
  | 'DEPARTMENT_INACTIVE'
  | 'DEPARTMENT_COST_CENTER_INACTIVE'
  | 'JOB_TITLE_REQUIRED'
  | 'JOB_TITLE_NOT_FOUND'
  | 'JOB_TITLE_INACTIVE';

export interface PlacementReason {
  subject: PlacementSubject;
  code: PlacementReasonCode;
}

/**
 * At most one reason per subject, the department first. Within a subject the first that holds wins: not named, not
 * found, retired, then (department only) charged to a retired cost center — a retired cost center has no people
 * (`US-04-09` AC-3), so a department charged to one cannot take anyone in.
 */
export function placementReasons(facts: PlacementFacts): PlacementReason[] {
  const reasons: PlacementReason[] = [];
  const { department, jobTitle } = facts;

  if (!department.named) reasons.push({ subject: 'DEPARTMENT', code: 'DEPARTMENT_REQUIRED' });
  else if (department.found === null) reasons.push({ subject: 'DEPARTMENT', code: 'DEPARTMENT_NOT_FOUND' });
  else if (!department.found.active) reasons.push({ subject: 'DEPARTMENT', code: 'DEPARTMENT_INACTIVE' });
  else if (!department.found.costCenterActive) {
    reasons.push({ subject: 'DEPARTMENT', code: 'DEPARTMENT_COST_CENTER_INACTIVE' });
  }

  if (!jobTitle.named) reasons.push({ subject: 'JOB_TITLE', code: 'JOB_TITLE_REQUIRED' });
  else if (jobTitle.found === null) reasons.push({ subject: 'JOB_TITLE', code: 'JOB_TITLE_NOT_FOUND' });
  else if (!jobTitle.found.active) reasons.push({ subject: 'JOB_TITLE', code: 'JOB_TITLE_INACTIVE' });

  return reasons;
}
