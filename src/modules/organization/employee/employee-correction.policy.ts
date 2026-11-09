import type { BusinessDate } from '../../../core/business-date';
import { normalizeDisplayName } from '../../../core/display-name';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { isJobTitleTooLong, placementReasons } from '../public/employee-placement.policy';
import type { EmploymentType } from '../public/organization.types';

/** The official fields of a record a correction may touch, in the order a correction notes them. */
export const OFFICIAL_FIELDS = ['fullName', 'workEmail', 'employmentType', 'hireDate', 'jobTitle'] as const;
export type OfficialField = (typeof OFFICIAL_FIELDS)[number];

export interface OfficialValues {
  fullName: string;
  workEmail: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  jobTitle: string | null;
}

/** What a correction asks for: a field that is not given (undefined) is left as it is. */
export type CorrectionInput = { [F in OfficialField]?: OfficialValues[F] };

/** The record as it is now; a record that never had a title may carry none at all. */
export type CorrectionCurrent = Omit<OfficialValues, 'jobTitle'> & { jobTitle?: string | null };

export interface Correction {
  /** What each changed field becomes, in the order of {@link OFFICIAL_FIELDS}; a cleared field is present as null. */
  changes: Partial<OfficialValues>;
  before: Partial<OfficialValues>;
  reasons: { field: string; code: string }[];
  /** The work email as it was asked for, trimmed (null when blank); undefined when none was asked for. */
  typedWorkEmail: string | null | undefined;
}

interface Verdict {
  change?: { was: unknown; now: unknown };
  reason?: string;
}

const typedEmailOf = (asked: string | null | undefined): string | null | undefined =>
  asked === undefined ? undefined : asked?.trim() || null;

const normalized = (workEmail: string): string | null => {
  try {
    return normalizeEmail(workEmail);
  } catch (error) {
    if (error instanceof InvalidEmailError) return null;
    throw error;
  }
};

/** Two emails are the same record when they normalize alike; the typed text is kept as it was written. */
const differs = (next: string | null, current: string | null): boolean => {
  if (next === null || current === null) return next !== current;

  return next !== current && normalized(next) !== normalized(current);
};

/**
 * The email that must be free for the person to take it: the normalized one, when the correction changes the email and it reads as an
 * email; null when no email is asked for, it is the person's own, it is cleared, or it does not normalize (then nobody can have it).
 */
export function workEmailToCheck(asked: string | null | undefined, onRecord: string | null): string | null {
  const typed = typedEmailOf(asked);
  if (typed === undefined || typed === null || !differs(typed, onRecord)) return null;

  return normalized(typed);
}

const fullNameVerdict = (current: CorrectionCurrent, input: CorrectionInput): Verdict | null =>
  input.fullName !== undefined && input.fullName !== current.fullName
    ? { change: { was: current.fullName, now: input.fullName } }
    : null;

const employmentTypeVerdict = (current: CorrectionCurrent, input: CorrectionInput): Verdict | null =>
  input.employmentType !== undefined && input.employmentType !== current.employmentType
    ? { change: { was: current.employmentType, now: input.employmentType } }
    : null;

const workEmailVerdict = (current: CorrectionCurrent, input: CorrectionInput, taken: boolean): Verdict | null => {
  const typed = typedEmailOf(input.workEmail);
  if (typed === undefined || !differs(typed, current.workEmail)) return null;

  return { change: { was: current.workEmail, now: typed }, ...(taken ? { reason: 'WORK_EMAIL_TAKEN' } : {}) };
};

const hireDateVerdict = (current: CorrectionCurrent, input: CorrectionInput, today: BusinessDate): Verdict | null => {
  if (input.hireDate === undefined || input.hireDate === current.hireDate) return null;
  if (current.hireDate <= today) return { reason: 'HIRE_DATE_LOCKED' };
  if (input.hireDate < today) return { reason: 'HIRE_DATE_IN_PAST' };

  return { change: { was: current.hireDate, now: input.hireDate } };
};

/** The title is optional free text, only bounded: the same bound the form and the people file keep. */
const jobTitleVerdict = (current: CorrectionCurrent, input: CorrectionInput): Verdict | null => {
  if (input.jobTitle === undefined) return null;
  const title = normalizeDisplayName(input.jobTitle ?? '') || null;
  if (title === (current.jobTitle ?? null)) return null;
  const [refused] = placementReasons({ jobTitle: { tooLong: title !== null && isJobTitleTooLong(title) } });

  return refused ? { reason: refused.code } : { change: { was: current.jobTitle ?? null, now: title } };
};

/**
 * What a correction of the official fields changes, what it refuses and why (`US-02-02` AC-19, `QĐ-82m`, `QĐ-87a`, `QĐ-87e`), field
 * by field in the order of the screen. `workEmailTaken` is the answer to {@link workEmailToCheck}: somebody else has that email.
 */
export function correctionOf(
  current: CorrectionCurrent,
  input: CorrectionInput,
  facts: { today: BusinessDate; workEmailTaken: boolean },
): Correction {
  const verdicts: [OfficialField, Verdict | null][] = [
    ['fullName', fullNameVerdict(current, input)],
    ['employmentType', employmentTypeVerdict(current, input)],
    ['workEmail', workEmailVerdict(current, input, facts.workEmailTaken)],
    ['hireDate', hireDateVerdict(current, input, facts.today)],
    ['jobTitle', jobTitleVerdict(current, input)],
  ];
  const changes: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const reasons: { field: string; code: string }[] = [];
  for (const [field, verdict] of verdicts) {
    if (verdict?.change) {
      before[field] = verdict.change.was;
      changes[field] = verdict.change.now;
    }
    if (verdict?.reason) reasons.push({ field, code: verdict.reason });
  }

  return {
    changes,
    before,
    reasons,
    typedWorkEmail: typedEmailOf(input.workEmail),
  };
}
