import { addWorkingDays, type NonWorkingDates } from '../../../core/working-days';
import type { BusinessDate } from '../../../core/business-date';
import type { HeadDecision, ReviewStatus, WaitingReason } from './transfer-review.types';

/**
 * The rules of the review a new head makes of the tools a person brought from another department after a transfer (`US-03-07`,
 * `QĐ-89b`: every personal seat they hold). Pure: the service reads the seats, the calendar and the head, and asks here what
 * follows. Nothing here takes a seat away or decides for anybody: a review that is late is only told.
 */

/** What the head may decide about a tool, in the order the wire lists them. */
export const HEAD_DECISIONS: readonly HeadDecision[] = ['STILL_NEEDED', 'NOT_NEEDED', 'NEEDS_NEW_TOOL'];

/** The longest note about a new tool the head may leave (`US-03-07` AC-5). */
export const NEW_TOOL_NOTE_MAX = 500;

/**
 * The last day to decide: the working days after the day the transfer took effect, which itself does not count (`OQ-A-17` (b)). A
 * transfer effective on Friday the 16th with five working days is due on Friday the 23rd.
 */
export function reviewDueOn(
  effectiveOn: BusinessDate,
  workingDays: number,
  nonWorkingDates: NonWorkingDates,
): BusinessDate {
  return addWorkingDays(effectiveOn, workingDays, nonWorkingDates);
}

/** A review is late from the day after its deadline, and only while it is open. */
export function isReviewOverdue(status: ReviewStatus, dueOn: BusinessDate, today: BusinessDate): boolean {
  return status === 'OPEN' && today > dueOn;
}

/** How many days past the deadline the review is on `today`; zero while it is not late. */
export function overdueDaysOf(status: ReviewStatus, dueOn: BusinessDate, today: BusinessDate): number {
  if (!isReviewOverdue(status, dueOn, today)) return 0;
  const day = (date: BusinessDate) => Date.parse(`${date}T00:00:00.000Z`);

  return Math.round((day(today) - day(dueOn)) / 86_400_000);
}

/**
 * Who may decide: the head of the department the person came to, as of today, and nobody else: not the head before, not an IT Admin,
 * not a stand-in approver (`AC-7`, `AC-9`). A department without a head holds the review until it has one.
 */
export function mayDecide(headEmployeeId: string | null, callerEmployeeId: string): boolean {
  return headEmployeeId !== null && headEmployeeId === callerEmployeeId;
}

export function waitingReasonOf(status: ReviewStatus, headEmployeeId: string | null): WaitingReason | null {
  return status === 'OPEN' && headEmployeeId === null ? 'NO_HEAD' : null;
}

/** Whether the note that goes with a decision is allowed: only the need for a new tool carries one, never blank, within the limit. */
export function isNoteAllowed(decision: HeadDecision, note: string | undefined): boolean {
  if (note === undefined) return true;

  return decision === 'NEEDS_NEW_TOOL' && note.trim().length > 0 && note.length <= NEW_TOOL_NOTE_MAX;
}

/** The review is complete when no line waits. */
export function statusAfterDecision(pendingItems: number): Extract<ReviewStatus, 'OPEN' | 'COMPLETED'> {
  return pendingItems === 0 ? 'COMPLETED' : 'OPEN';
}
