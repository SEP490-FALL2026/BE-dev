import type { BusinessDate } from '../../../core/business-date';

/**
 * The rules of the renewal of a right that ends on a day (`US-05-14`): who asks, which right may be renewed, whether the ask comes
 * before or after the end, how many months it is and how many the right would run on without a break. Pure: the services read
 * the facts and write what these decide.
 */

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const parts = (date: BusinessDate): { year: number; month: number; day: number } => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
  day: Number(date.slice(8, 10)),
});

/**
 * The months from `from` to `to`, rounded up: a part of a month counts as one, except that the last day of a month to the last
 * day of a later month is whole months (30 Sep to 31 Dec is three). Never less than one for a `to` after `from`.
 */
export function monthsBetween(from: BusinessDate, to: BusinessDate): number {
  const a = parts(from);
  const b = parts(to);
  const months = (b.year - a.year) * 12 + (b.month - a.month);
  const bothMonthEnds = a.day === daysInMonth(a.year, a.month) && b.day === daysInMonth(b.year, b.month);

  return b.day > a.day && !bothMonthEnds ? months + 1 : months;
}

export type RenewalSenderRefusal =
  /** Neither the holder nor the head of the department of the holder. */
  | 'NOT_HOLDER'
  /** The head of another department. */
  | 'OUTSIDE_DEPARTMENT';

export type RenewalSenderVerdict = { ok: true; byHead: boolean } | { ok: false; refusal: RenewalSenderRefusal };

/** The holder asks to renew their own right; the head of their department asks for them (`US-05-14` AC-1). */
export function checkRenewalSender(facts: {
  actorEmployeeId: string;
  holderEmployeeId: string;
  holderDepartmentId: string | null;
  actorHeadedDepartmentId: string | null;
}): RenewalSenderVerdict {
  if (facts.actorEmployeeId === facts.holderEmployeeId) return { ok: true, byHead: false };
  if (facts.actorHeadedDepartmentId === null) return { ok: false, refusal: 'NOT_HOLDER' };
  if (facts.actorHeadedDepartmentId === facts.holderDepartmentId) return { ok: true, byHead: true };

  return { ok: false, refusal: 'OUTSIDE_DEPARTMENT' };
}

export type RenewableProblem =
  /** The right of a service account has no end date to renew (it is answered for by a person, `US-03-08`). */
  | 'SERVICE_ACCOUNT'
  /** Another record already follows it: the one to renew is the last of the chain. */
  | 'NOT_CURRENT'
  /** It has ended, failed or been cancelled. */
  | 'NOT_OPEN'
  /** It has no day it is expected to end: there is nothing to renew. */
  | 'NO_END_DATE'
  /** The grant it was made for is not done. */
  | 'GRANT_NOT_COMPLETED'
  /** Its revocation is under way: a renewal would end the record the revocation has to end. */
  | 'REVOCATION_PENDING';

/** The first reason the right cannot be renewed, or null when it can. */
export function checkRenewable(facts: {
  kind: 'PERSONAL' | 'SERVICE';
  hasSuccessor: boolean;
  open: boolean;
  expectedEndDate: BusinessDate | null;
  grant: 'NONE' | 'COMPLETED' | 'NOT_COMPLETED';
  revocationLive: boolean;
}): RenewableProblem | null {
  if (facts.kind === 'SERVICE') return 'SERVICE_ACCOUNT';
  if (facts.hasSuccessor) return 'NOT_CURRENT';
  if (!facts.open) return 'NOT_OPEN';
  if (facts.expectedEndDate === null) return 'NO_END_DATE';
  if (facts.grant === 'NOT_COMPLETED') return 'GRANT_NOT_COMPLETED';
  if (facts.revocationLive) return 'REVOCATION_PENDING';

  return null;
}

export type EndRefusal =
  /** The new end is not after the end the right has, or, when the end has passed, not after today. */
  | 'END_NOT_AFTER'
  /** The term it asks for is longer than any request may ask for. */
  | 'END_TOO_FAR';

/**
 * Whether the end asked for is acceptable: after the end the right has and after today. `maxTermMonths` is the bound every request
 * keeps against a typo.
 */
export function checkNewEnd(facts: {
  today: BusinessDate;
  previousEnd: BusinessDate;
  newEnd: BusinessDate;
  maxTermMonths: number;
}): EndRefusal | null {
  const floor = facts.previousEnd > facts.today ? facts.previousEnd : facts.today;
  if (facts.newEnd <= floor) return 'END_NOT_AFTER';

  return monthsBetween(floor, facts.newEnd) > facts.maxTermMonths ? 'END_TOO_FAR' : null;
}

/**
 * A request sent up to the end of the right (today counts) renews it and leaves it as it is until it is decided; one sent after the
 * end is a new request for the same tool (`US-05-14` AC-4, AC-5).
 */
export function routeRenewal(facts: { today: BusinessDate; previousEnd: BusinessDate }): 'RENEWAL' | 'NEW_REQUEST' {
  return facts.today <= facts.previousEnd ? 'RENEWAL' : 'NEW_REQUEST';
}
