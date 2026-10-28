/**
 * BEH.1 (A4-11): whether the department and the job title a row names can take a person in — the one decision the manual form
 * (`employee/employee-row.validator.ts`) and the import preview (`data-import/employee-import/employee-import-rows.ts`) share
 * (T-16, `US-02-02` AC-14), and the one the transfer of a person asks for its destination. It is semantic only: it knows no form
 * field, file column, DTO, database row or repository. Each adapter tells what it found, maps `subject` to its own field or column,
 * and adds the reasons of its own workflow (taken keys, duplicates in a file, other cells).
 */

/** A job title is free text on the person (`QĐ-87e`): at most this many characters once its display form is made. */
export const JOB_TITLE_MAX_LENGTH = 255;

/** Counts characters, not UTF-16 units, as the database does (`employees_job_title_shape`). */
export function isJobTitleTooLong(displayForm: string): boolean {
  return [...displayForm].length > JOB_TITLE_MAX_LENGTH;
}

/**
 * What the caller found for the department and the job title a row names. `found` is read only when `named`. The title is optional
 * free text, so it is only bounded, never required or looked up; a caller with no title to judge leaves it out and no reason about
 * one is given. Whether the department has a Cost Center is not asked: a department with none takes people in (`QĐ-87d(3)`).
 */
export interface PlacementFacts {
  /** A caller with no department to judge (the correction of a record that has one) leaves it out. */
  department?: { named: boolean; found: { active: boolean } | null };
  jobTitle?: { tooLong: boolean };
}

export type PlacementSubject = 'DEPARTMENT' | 'JOB_TITLE';

export type PlacementReasonCode =
  'DEPARTMENT_REQUIRED' | 'DEPARTMENT_NOT_FOUND' | 'DEPARTMENT_INACTIVE' | 'JOB_TITLE_TOO_LONG';

export interface PlacementReason {
  subject: PlacementSubject;
  code: PlacementReasonCode;
}

/**
 * At most one reason per subject, the department first. Within the department the first that holds wins: not named, not found,
 * retired. A title is only bounded.
 */
export function placementReasons(facts: PlacementFacts): PlacementReason[] {
  const reasons: PlacementReason[] = [];
  const { department, jobTitle } = facts;

  if (department) {
    if (!department.named) reasons.push({ subject: 'DEPARTMENT', code: 'DEPARTMENT_REQUIRED' });
    else if (department.found === null) reasons.push({ subject: 'DEPARTMENT', code: 'DEPARTMENT_NOT_FOUND' });
    else if (!department.found.active) reasons.push({ subject: 'DEPARTMENT', code: 'DEPARTMENT_INACTIVE' });
  }

  if (jobTitle?.tooLong) reasons.push({ subject: 'JOB_TITLE', code: 'JOB_TITLE_TOO_LONG' });

  return reasons;
}
