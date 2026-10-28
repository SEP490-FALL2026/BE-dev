import { normalizeDisplayName } from '../../../core/display-name';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { isJobTitleTooLong, placementReasons } from '../../organization/employee-placement.policy';
import type { EmployeeRecord, OfficialFieldsPatch } from '../../organization/organization.types';
import type { ProfileCorrection } from './super-admin-event.types';

/** What the correction would change, what it was, and why it must be refused. Pure: no store, no clock. */
export interface ProfilePlan {
  changes: OfficialFieldsPatch;
  before: Record<string, string | null>;
  /** The refusals, in the order of the fields: work email, hire date, job title. The first one is the answer. */
  reasons: string[];
  /** The normalized work email to ask the organization whether somebody else has it; null when the email does not change. */
  workEmailToCheck: string | null;
}

/** Two emails are the same record when they normalize alike; the typed text is kept as it was written. */
function sameEmail(next: string | null, current: string | null): boolean {
  if (next === null || current === null) return next === current;
  if (next === current) return true;

  return normalized(next) === normalized(current);
}

function normalized(email: string): string | null {
  try {
    return normalizeEmail(email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return null;
    throw error;
  }
}

/**
 * The same rules as the correction of the official fields the application makes of anyone else's record (`US-02-02` AC-19, `QĐ-82m`):
 * only the fields that differ change; a hire date that has already come is locked and one in the past is refused; a job title is only
 * bounded; a work email that cannot be normalized is refused and one somebody else has is refused by the caller, who asks the
 * organization. The department, the status, the account and the login email are not here.
 */
export function planProfileCorrection(current: EmployeeRecord, input: ProfileCorrection, today: string): ProfilePlan {
  const changes: OfficialFieldsPatch = {};
  const before: Record<string, string | null> = {};
  const reasons: string[] = [];
  let workEmailToCheck: string | null = null;

  if (input.fullName !== undefined && normalizeDisplayName(input.fullName) !== current.fullName) {
    before.fullName = current.fullName;
    changes.fullName = normalizeDisplayName(input.fullName);
  }
  if (input.employmentType !== undefined && input.employmentType !== current.employmentType) {
    before.employmentType = current.employmentType;
    changes.employmentType = input.employmentType;
  }
  if (input.workEmail !== undefined) {
    const next = input.workEmail === null ? null : input.workEmail.trim() || null;
    if (!sameEmail(next, current.workEmail)) {
      if (next !== null && normalized(next) === null) reasons.push('WORK_EMAIL_INVALID');
      else workEmailToCheck = next === null ? null : normalized(next);
      before.workEmail = current.workEmail;
      changes.workEmail = next;
    }
  }
  if (input.hireDate !== undefined && input.hireDate !== current.hireDate) {
    if (current.hireDate <= today) reasons.push('HIRE_DATE_LOCKED');
    else if (input.hireDate < today) reasons.push('HIRE_DATE_IN_PAST');
    else {
      before.hireDate = current.hireDate;
      changes.hireDate = input.hireDate;
    }
  }
  if (input.jobTitle !== undefined) {
    const next = input.jobTitle === null ? null : normalizeDisplayName(input.jobTitle) || null;
    if (next !== (current.jobTitle ?? null)) {
      const [refused] = placementReasons({ jobTitle: { tooLong: next !== null && isJobTitleTooLong(next) } });
      if (refused) reasons.push(refused.code);
      else {
        before.jobTitle = current.jobTitle ?? null;
        changes.jobTitle = next;
      }
    }
  }

  return { changes, before, reasons, workEmailToCheck };
}
