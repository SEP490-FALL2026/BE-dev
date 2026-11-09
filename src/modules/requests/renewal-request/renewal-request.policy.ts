import { addDays, type BusinessDate } from '../../../core/business-date';

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
  /** Anybody but the holder of the right (a head included): only the person who holds it asks to keep it (`QĐ-100t`). */
  'NOT_HOLDER';

export type RenewalSenderVerdict = { ok: true } | { ok: false; refusal: RenewalSenderRefusal };

/** Only the holder asks to renew their own right (`US-05-14` AC-1, `QĐ-100t`). */
export function checkRenewalSender(facts: { actorEmployeeId: string; holderEmployeeId: string }): RenewalSenderVerdict {
  return facts.actorEmployeeId === facts.holderEmployeeId ? { ok: true } : { ok: false, refusal: 'NOT_HOLDER' };
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

/**
 * A request sent up to the end of the right (today counts) renews it and leaves it as it is until it is decided; one sent after the
 * end is a new request for the same tool (`US-05-14` AC-4, AC-5).
 */
export function routeRenewal(facts: { today: BusinessDate; previousEnd: BusinessDate }): 'RENEWAL' | 'NEW_REQUEST' {
  return facts.today <= facts.previousEnd ? 'RENEWAL' : 'NEW_REQUEST';
}

/**
 * The window of the renewal (`BR-MF1-08a`, `QĐ-108b`): it opens `windowDays` days before the approved end and runs to the end (today
 * counts). `windowDays` is the one the window was recorded with when it opened, or the parameter in force when it is not recorded yet.
 */
export function renewalWindowOf(facts: { today: BusinessDate; previousEnd: BusinessDate; windowDays: number }): {
  open: boolean;
  opensOn: BusinessDate;
} {
  const opensOn = addDays(facts.previousEnd, -facts.windowDays);

  return { open: facts.today >= opensOn, opensOn };
}

/** The new end asked for fits (`QĐ-108a`): after the end the right has, and not after `maxEnd` (twelve months after it). */
export function newEndFits(facts: { previousEnd: BusinessDate; newEnd: BusinessDate; maxEnd: BusinessDate }): boolean {
  return facts.newEnd > facts.previousEnd && facts.newEnd <= facts.maxEnd;
}
