/**
 * The limits of a request for new access, judged per beneficiary (`BR-MF1-01`, `QĐ-103c`, `QĐ-104b`, `QĐ-108c`). A pure rule: the
 * caller reads the facts (under the lock of the person when it sends) and refuses or records what this answers.
 *
 * - GH-1 (`BR-MF1-01e`): a person who holds the plan, or has a request for new access of the plan open, cannot ask for it again. The
 *   seat held is judged by the caller (`ALREADY_HOLDS_ACCESS`, as before); the open request is judged here.
 * - GH-2 (`BR-MF1-01f`): a person who already has `openLimit` requests for new access open cannot be named in another one.
 *   A request in the grace of a transfer (`QĐ-110q`) is left out of this count and of the seat held, but not of the duplicate of GH-1: an open request of
 *   the same plan, an exempt one included, still refuses it.
 * - GH-3 (`BR-MF1-01g`): a person who already uses `paidThreshold` paid applications or more may still ask, with a reason, and the
 *   request is flagged; asking for another plan of an application they already use adds nothing, so it is not flagged (M-16).
 *
 * A request for a renewal, for a service account, or a request again exempt by `QĐ-108c` or the grace of a transfer is not judged
 * by GH-1/GH-2.
 */

// Why a request is left out of GH-1/GH-2 (`TRANSFER_GRACE`, `ROLE_ENDED`) is kept with the request, in the core: `access-request.types.ts`.
import type { LimitExemption } from '../access-request/access-request.types';

export type { LimitExemption };

export type LimitRefusal = 'HAS_OPEN_REQUEST' | 'OPEN_LIMIT_REACHED';

/** A request for new access of the person that is still open, as the count reads it. */
export interface OpenNewRequest {
  requestId: string;
  /** Null for a proposal of software that is not in the catalog yet: it counts for GH-2 but matches no plan for GH-1. */
  planId: string | null;
}

export interface LimitFacts {
  /** The plan asked for; null for a proposal of software that is not in the catalog. */
  planId: string | null;
  /** The application of the plan asked for; null for a proposal. */
  applicationId: string | null;
  openNew: readonly OpenNewRequest[];
  /**
   * Every request for new access the person has open, the ones left out of the count included (the ones sent in a grace): what a request in the grace of a
   * transfer is judged against for a duplicate of its plan. Absent: the same as `openNew`.
   */
  openIncludingExempt?: readonly OpenNewRequest[];
  openLimit: number;
  /** The paid applications the person uses (ids), each once. */
  paidApplicationIds: ReadonlySet<string>;
  paidThreshold: number;
  /** The request is exempt: `ROLE_ENDED` from GH-1 and GH-2, `TRANSFER_GRACE` from GH-2 only (a duplicate of its plan is still refused); GH-3 still applies. */
  exemption: LimitExemption | null;
}

export interface LimitVerdict {
  refusal: LimitRefusal | null;
  /** The open request of the same plan (GH-1), when that is the refusal. */
  openRequestId: string | null;
  /** The open requests for new access that count for GH-2, oldest first. */
  openRequestIds: string[];
  /** How many requests for new access the person has open, and the most they may (what a preview shows). */
  openCount: number;
  /** GH-3: the person uses this many paid applications, at or above the threshold; null when the request is not flagged. */
  manyPaidSoftware: { count: number; threshold: number } | null;
  /** How many paid applications the person uses, flagged or not. */
  paidSoftwareCount: number;
}

export function judgeNewRequestLimits(facts: LimitFacts): LimitVerdict {
  const count = facts.paidApplicationIds.size;
  const alreadyUsed = facts.applicationId !== null && facts.paidApplicationIds.has(facts.applicationId);
  const manyPaidSoftware =
    count >= facts.paidThreshold && !alreadyUsed ? { count, threshold: facts.paidThreshold } : null;
  const base = { openRequestId: null, manyPaidSoftware, paidSoftwareCount: count };
  // A request in the grace of a transfer is left out of the count (GH-2), not out of the duplicate: a second open request of the same plan, an exempt one
  // included, is refused (`QĐ-110q` frees the count of the limit, it does not let the same software be asked for twice).
  if (facts.exemption === 'TRANSFER_GRACE') {
    const duplicate =
      facts.planId === null
        ? undefined
        : (facts.openIncludingExempt ?? facts.openNew).find((open) => open.planId === facts.planId);

    return duplicate
      ? {
          ...base,
          refusal: 'HAS_OPEN_REQUEST',
          openRequestId: duplicate.requestId,
          openRequestIds: [duplicate.requestId],
          openCount: 0,
        }
      : { ...base, refusal: null, openRequestIds: [], openCount: 0 };
  }
  if (facts.exemption !== null) return { ...base, refusal: null, openRequestIds: [], openCount: 0 };

  const openRequestIds = facts.openNew.map((open) => open.requestId);
  const counted = { ...base, openRequestIds, openCount: openRequestIds.length };
  const samePlan = facts.planId === null ? undefined : facts.openNew.find((open) => open.planId === facts.planId);
  if (samePlan) return { ...counted, refusal: 'HAS_OPEN_REQUEST', openRequestId: samePlan.requestId };
  if (facts.openNew.length >= facts.openLimit) return { ...counted, refusal: 'OPEN_LIMIT_REACHED' };

  return { ...counted, refusal: null };
}

/** What GH-3 asks of the reason the sender gave: kept only when the request is flagged, so a reason sent for nothing is not stored. */
export interface PaidSoftwareReason {
  flagged: boolean;
  reason: string | null;
  /** The request is flagged and no reason was given: it cannot be sent. */
  missing: boolean;
}

export function manyPaidSoftwareReasonOf(
  verdict: Pick<LimitVerdict, 'manyPaidSoftware'>,
  reason: string | null | undefined,
): PaidSoftwareReason {
  if (verdict.manyPaidSoftware === null) return { flagged: false, reason: null, missing: false };
  const cleaned = reason?.trim() ?? '';

  return cleaned.length > 0
    ? { flagged: true, reason: cleaned, missing: false }
    : { flagged: true, reason: null, missing: true };
}
