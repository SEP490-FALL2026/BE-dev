/**
 * The limits of a request for new access, judged per beneficiary (`BR-MF1-01`, `QĐ-103c`, `QĐ-111h`, `QĐ-108c`). A pure rule: the
 * caller reads the facts (under the lock of the person when it sends) and refuses or records what this answers.
 *
 * - GH-1 (`BR-MF1-01e`): a person who holds the plan, or has a request for new access of the plan open, cannot ask for it again. The
 *   seat held is judged by the caller (`ALREADY_HOLDS_ACCESS`, as before); the open request is judged here.
 * - GH-2 (`BR-MF1-01f`, `QĐ-111h`): a person who was already named in `weeklyLimit` requests for new access sent in the calendar week
 *   (Monday to Sunday of the organization, see {@link weekWindowOf}) cannot be named in another one before the next Monday. A request
 *   withdrawn or refused still counts: the count is of what was sent, not of what is open. A request in the grace of a transfer
 *   (`QĐ-110q`) is left out of this count and of the seat held, but not of the duplicate of GH-1: an open request of the same plan, an
 *   exempt one included, still refuses it.
 *
 * There is no GH-3 (`QĐ-111h`): how many paid applications a person uses neither asks a reason nor flags a request.
 *
 * A request for a renewal, for a service account, or a request again exempt by `QĐ-108c` or the grace of a transfer is not judged
 * by GH-1/GH-2.
 */

import { businessDateAt, weekBoundsOf, type BusinessDate } from '../../../core/business-date';
import { instantAtWallClock } from '../../../core/working-days';
// Why a request is left out of GH-1/GH-2 (`TRANSFER_GRACE`, `ROLE_ENDED`) is kept with the request, in the core: `access-request.types.ts`.
import type { LimitExemption } from '../access-request/access-request.types';

export type { LimitExemption };

export type LimitRefusal = 'HAS_OPEN_REQUEST' | 'OPEN_LIMIT_REACHED';

/** The calendar week an instant is in, in the time zone of the organization: `[from, to)` as instants, and the Monday that starts the next one. */
export interface WeekWindow {
  from: Date;
  to: Date;
  /** The date the count of GH-2 starts again: the Monday after the week. */
  resetsOn: BusinessDate;
}

/**
 * The week (Monday 00:00 to the next Monday 00:00 on the clock of the organization) `now` is in. The zone decides: 00:30 on a Monday in
 * Ho Chi Minh is Sunday 17:30 in UTC, and it already belongs to the new week.
 */
export function weekWindowOf(now: Date, timeZone: string): WeekWindow {
  const { start, nextStart } = weekBoundsOf(businessDateAt(now, timeZone));

  return {
    from: instantAtWallClock({ date: start, msOfDay: 0 }, timeZone),
    to: instantAtWallClock({ date: nextStart, msOfDay: 0 }, timeZone),
    resetsOn: nextStart,
  };
}

/** A request for new access of the person that is still open, as GH-1 reads it. */
export interface OpenNewRequest {
  requestId: string;
  /** Null for a proposal of software that is not in the catalog yet: it matches no plan for GH-1. */
  planId: string | null;
}

export interface LimitFacts {
  /** The plan asked for; null for a proposal of software that is not in the catalog. */
  planId: string | null;
  /** The requests for new access of the person that are still open, for the duplicate of the plan (GH-1). */
  openNew: readonly OpenNewRequest[];
  /**
   * Every request for new access the person has open, the ones left out of the count included (the ones sent in a grace): what a request in the grace of a
   * transfer is judged against for a duplicate of its plan. Absent: the same as `openNew`.
   */
  openIncludingExempt?: readonly OpenNewRequest[];
  /** How many requests for new access the person was named in this calendar week, withdrawn and refused ones included, exempt ones left out (GH-2). */
  sentThisWeek: number;
  /** The most the person may be named in a week. */
  weeklyLimit: number;
  /** The Monday the count starts again: what a refusal says. */
  resetsOn: BusinessDate;
  /** The request is exempt: `ROLE_ENDED` from GH-1 and GH-2, `TRANSFER_GRACE` from GH-2 only (a duplicate of its plan is still refused). */
  exemption: LimitExemption | null;
}

export interface LimitVerdict {
  refusal: LimitRefusal | null;
  /** The open request of the same plan (GH-1), when that is the refusal. */
  openRequestId: string | null;
  /** How many requests for new access the person was named in this week and counts (what a preview shows; 0 for an exempt request). */
  sentThisWeek: number;
  /** The Monday the count of GH-2 starts again. */
  resetsOn: BusinessDate;
}

export function judgeNewRequestLimits(facts: LimitFacts): LimitVerdict {
  const base = { openRequestId: null, resetsOn: facts.resetsOn };
  // A request in the grace of a transfer is left out of the count (GH-2), not out of the duplicate: a second open request of the same plan, an exempt one
  // included, is refused (`QĐ-110q` frees the count of the limit, it does not let the same software be asked for twice).
  if (facts.exemption === 'TRANSFER_GRACE') {
    const duplicate =
      facts.planId === null
        ? undefined
        : (facts.openIncludingExempt ?? facts.openNew).find((open) => open.planId === facts.planId);

    return duplicate
      ? { ...base, refusal: 'HAS_OPEN_REQUEST', openRequestId: duplicate.requestId, sentThisWeek: 0 }
      : { ...base, refusal: null, sentThisWeek: 0 };
  }
  if (facts.exemption !== null) return { ...base, refusal: null, sentThisWeek: 0 };

  const counted = { ...base, sentThisWeek: facts.sentThisWeek };
  const samePlan = facts.planId === null ? undefined : facts.openNew.find((open) => open.planId === facts.planId);
  if (samePlan) return { ...counted, refusal: 'HAS_OPEN_REQUEST', openRequestId: samePlan.requestId };
  if (facts.sentThisWeek >= facts.weeklyLimit) return { ...counted, refusal: 'OPEN_LIMIT_REACHED' };

  return { ...counted, refusal: null };
}
