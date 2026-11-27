import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { PeriodAdjustment } from '../../../catalog/public/subscription-period.types';

/**
 * How far past its renewal day a period is still looked at: a pass that did not run for that long (the API stopped) still marks the
 * incident or the end of a period; an older one is left alone rather than given an event long after.
 */
export const RENEWAL_DAY_LOOKBACK_DAYS = 60;

/**
 * What the pass has to do for a period on a day (`SBF-20` §4.5), in this order: tell the IT Admin the point of adjustment came, raise the red
 * alert of a plan by the year, tell the IT Admin that a plan by the month keeps its seats, and, past the renewal day, record the incident of
 * a plan that renewed itself or the end of one that did not.
 */
export type DueNoticeKind = 'ADJUSTMENT_POINT' | 'RED_ALERT' | 'KEPT' | 'AUTO_RENEWAL_INCIDENT' | 'EXPIRY_MARKED';

/** The two kinds the pass writes as an event of the period (`subscription_deadline_events`), once. */
export type EndEventKind = Extract<DueNoticeKind, 'AUTO_RENEWAL_INCIDENT' | 'EXPIRY_MARKED'>;

/**
 * What the day may bring for a period, from its dates alone (R2-12): the pass asks for the seats a period needs only when this is not empty,
 * since the counts are two statements and a hook. `hasCase` is whether a case stands for the period (the IT Admin recorded, or a case left
 * `DECIDED` before the one-write renewal); `eventRecorded` whether the period already has its event of the renewal day.
 */
export function candidateNotices(
  adjustment: PeriodAdjustment,
  today: BusinessDate,
  hasCase: boolean,
  autoRenew: boolean,
  eventRecorded: boolean,
): DueNoticeKind[] {
  if (hasCase) return [];
  const pastRenewalDay = adjustment.end < today && today <= addDays(adjustment.end, RENEWAL_DAY_LOOKBACK_DAYS);
  if (pastRenewalDay) return eventRecorded ? [] : [autoRenew ? 'AUTO_RENEWAL_INCIDENT' : 'EXPIRY_MARKED'];
  if (today < adjustment.point || today > adjustment.end) return [];
  const kinds: DueNoticeKind[] = ['ADJUSTMENT_POINT'];
  if (isRedAlertDay(adjustment, today)) kinds.push('RED_ALERT');
  if (adjustment.commitment === 'MONTHLY' && today === adjustment.deadline) kinds.push('KEPT');

  return kinds;
}

/** A plan by the year from the day its red alert opens (the day is the period's own, read when the period began). */
const isRedAlertDay = (adjustment: PeriodAdjustment, today: BusinessDate): boolean =>
  adjustment.commitment === 'ANNUAL' && adjustment.redAlertOn !== null && adjustment.redAlertOn <= today;

/**
 * The notices due for a period today (`SBF-20` §4.5, `QĐ-103e`, `QĐ-103v`(9), `QĐ-106i`): the candidates of its dates, kept when the facts
 * hold. Past the renewal day a period only counts while seats are still held; a plan by the month keeps its seats (and says so) only when
 * more are bought than the target. Nothing is due once a case stands for the period.
 */
export function dueNotices(
  adjustment: PeriodAdjustment,
  today: BusinessDate,
  hasCase: boolean,
  holdsSeats: boolean,
  purchased: number | null,
  target: number,
  autoRenew: boolean,
  eventRecorded = false,
): DueNoticeKind[] {
  return candidateNotices(adjustment, today, hasCase, autoRenew, eventRecorded).filter((kind) => {
    if (kind === 'KEPT') return purchased !== null && purchased > target;
    if (kind === 'AUTO_RENEWAL_INCIDENT') return holdsSeats;

    return true;
  });
}

/**
 * The people told of a notice (`SBF-20` §4.6): the IT Admin in charge always; Finance of the red alert and of what happens past the renewal
 * day; the person who decides spending only of an incident (`QĐ-99h`). A person who holds two of these roles is told once; who is
 * missing is left out.
 */
export function noticeRecipients(
  kind: DueNoticeKind,
  people: { itAdmin: string | null; finance: string | null; approver: string | null },
): string[] {
  const roles: (string | null)[] = [people.itAdmin];
  if (kind === 'RED_ALERT' || kind === 'EXPIRY_MARKED' || kind === 'AUTO_RENEWAL_INCIDENT') roles.push(people.finance);
  if (kind === 'AUTO_RENEWAL_INCIDENT') roles.push(people.approver);

  return [...new Set(roles.filter((person): person is string => person !== null))];
}

/** What the data of a period lacks for the IT Admin to be told in time (`SBF-20` §4.2): no date at all, or a plan by the year with no deadline to cancel. */
export type DataQualityProblem = 'NO_ALERT_ANCHOR' | 'NO_NOTICE_DEADLINE';

export function dataQualityProblemsOf(adjustment: PeriodAdjustment | null): DataQualityProblem[] {
  if (adjustment === null) return ['NO_ALERT_ANCHOR'];

  return adjustment.commitment === 'ANNUAL' && adjustment.kind === 'RENEWAL_DATE' ? ['NO_NOTICE_DEADLINE'] : [];
}
