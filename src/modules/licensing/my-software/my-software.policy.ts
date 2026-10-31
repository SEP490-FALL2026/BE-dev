import { addDays, type BusinessDate } from '../../../core/business-date';
import { REMINDER_LEAD_DAYS } from '../expiry/expiry.policy';

/** The two windows of the list: what a person holds today or will, and what they held and no longer do. */
export const MY_SOFTWARE_VIEWS = ['current', 'ended'] as const;
export type MySoftwareView = (typeof MY_SOFTWARE_VIEWS)[number];

/**
 * Where a right of a person stands on the day it is read, one word each, in the order they are judged:
 * - `ENDED` — the record ended on or before that day; the person no longer holds it.
 * - `UPCOMING` — it starts on a later day (a renewal that takes over, a grant dated ahead).
 * - `PROVISIONING` — decided and holding the seat, but its grant is not done yet (queued, being worked, or failed and waiting).
 * - `REVOKING` — a revocation of it is open and not done; the person still holds it meanwhile.
 * - `ENDING` — a K1 seat whose renewal was cancelled: access runs to the end of the paid period, then it ends.
 * - `EXPIRED` — its expected end day has passed and it is still held, waiting for a renewal decision or a revocation.
 * - `ACTIVE` — held and in force.
 */
export const MY_SOFTWARE_STATUSES = [
  'UPCOMING',
  'PROVISIONING',
  'ACTIVE',
  'EXPIRED',
  'REVOKING',
  'ENDING',
  'ENDED',
] as const;
export type MySoftwareStatus = (typeof MY_SOFTWARE_STATUSES)[number];

/** The facts of one right that its status is read from, all as of the moment it is read. */
export interface RightFacts {
  effectiveFrom: BusinessDate;
  /** The first day it is no longer held; null while it has no end. */
  validUntil: BusinessDate | null;
  /** The day a time-limited right was expected to end (its last day); null when it has none. */
  expectedEndDate: BusinessDate | null;
  /** A grant task of it is not finished. */
  grantOpen: boolean;
  /** A revocation task of it is open and not done (not completed, not cancelled, not closed as failed). */
  revocationOpen: boolean;
  /** Its revocation is done with the access left to run to the end of the paid period (a K1 renewal cancelled). */
  accessUntilPaidEnd: boolean;
  /** A later record of the same seat continues it (a renewal). */
  continued: boolean;
}

/** The status of a right on `today`, judged in the order the type lists them; a pure function of the facts and the day. */
export function rightStatusOf(facts: RightFacts, today: BusinessDate): MySoftwareStatus {
  if (facts.validUntil !== null && facts.validUntil <= today) return 'ENDED';
  if (facts.effectiveFrom > today) return 'UPCOMING';
  if (facts.grantOpen) return 'PROVISIONING';
  if (facts.revocationOpen) return 'REVOKING';
  if (facts.accessUntilPaidEnd && facts.validUntil !== null) return 'ENDING';
  // The right ends on its last day: it is expired from the day after (`US-03-05` AC-2), unless a renewal already took it over.
  if (facts.expectedEndDate !== null && today > facts.expectedEndDate && !facts.continued) return 'EXPIRED';

  return 'ACTIVE';
}

/**
 * Whether a right that is in force is about to end on its expected end day: within the same seven days as the reminder its holder
 * gets (`US-03-05` AC-1, the warning of a time-limited right that is about to end). A right that a renewal continues is not.
 */
export function isExpiringSoon(facts: RightFacts, status: MySoftwareStatus, today: BusinessDate): boolean {
  if (status !== 'ACTIVE' && status !== 'PROVISIONING') return false;
  if (facts.expectedEndDate === null || facts.continued) return false;

  return facts.expectedEndDate >= today && facts.expectedEndDate <= addDays(today, REMINDER_LEAD_DAYS);
}
