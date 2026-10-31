import type { BusinessDate } from '../../../../core/business-date';
import type { DeadlineOutcome } from '../subscription-renewal.types';

/**
 * Whether the renewal is flagged late today (`FR-1.4`, `US-11-03` AC-13, AC-14, AC-20): the milestone is reached, a decision taken
 * by then has no outcome recorded, and the flag is not set yet. A decision recorded after the milestone has its own execution
 * point and is not late by it. The flag never changes the subscription, the decision, nor `KPI-4`.
 */
export function lateFlagDue(input: {
  today: BusinessDate;
  baseDate: BusinessDate;
  decided: boolean;
  decidedAfterDeadline: boolean;
  outcomeRecorded: boolean;
  alreadyFlagged: boolean;
}): boolean {
  if (!input.decided || input.decidedAfterDeadline || input.outcomeRecorded || input.alreadyFlagged) return false;

  return input.today >= input.baseDate;
}

/**
 * What a passed milestone records when no decision was taken by it (`US-11-04` AC-1, AC-2, AC-4, AC-6, AC-9): a subscription that
 * renews itself has an incident (counted by `KPI-4`), one that does not is marked to end; one event per period, and nothing at all
 * while the milestone has not passed or when a decision was recorded by it. A decision recorded later never removes the event. The
 * system never renews, cancels or decides anything here.
 */
export function deadlineOutcomeOf(input: {
  today: BusinessDate;
  baseDate: BusinessDate;
  autoRenew: boolean;
  decidedOn: BusinessDate | null;
  alreadyRecorded: boolean;
}): DeadlineOutcome | null {
  if (input.alreadyRecorded || input.today <= input.baseDate) return null;
  if (input.decidedOn !== null && input.decidedOn <= input.baseDate) return null;

  return input.autoRenew ? 'AUTO_RENEWAL_INCIDENT' : 'EXPIRY_MARKED';
}
