import type { RenewalProblem } from '../subscription-renewal.errors';
import type { RenewalChoice, RenewalOutcomeKind } from '../subscription-renewal.types';

/**
 * Whether the outcome fits the decision (`US-11-03` AC-15, AC-18, `US-11-05` AC-11, AC-12): an outcome as decided records the new
 * period a renewal, a reduction or a raise makes, with the number of seats decided, and no period for a cancellation. A renewal as
 * it is of before the one-write renewal decided no number and keeps the seats bought. Any other outcome records what the vendor
 * really did, with or without a new period.
 */
export function checkOutcome(input: {
  outcome: RenewalOutcomeKind;
  decidedChoice: RenewalChoice;
  decidedQuantity: number | null;
  purchasedQuantity: number | null;
  nextQuantity: number | null;
}): RenewalProblem | null {
  if (input.outcome !== 'AS_DECIDED') return null;
  if (input.decidedChoice === 'CANCEL') return input.nextQuantity === null ? null : 'OUTCOME_MISMATCH';
  if (input.nextQuantity === null) return 'OUTCOME_MISMATCH';
  const numbered = input.decidedChoice === 'REDUCE' || input.decidedChoice === 'INCREASE';
  const expected = numbered ? input.decidedQuantity : (input.decidedQuantity ?? input.purchasedQuantity);

  return expected === null || expected === input.nextQuantity ? null : 'OUTCOME_MISMATCH';
}

/** Checks per-line next-period quantities against proposed `recordedQuantity` values (`422 QUANTITY_INVALID`). */
export function validateOutcomeLineQuantities(
  proposedByLine: ReadonlyMap<string, number>,
  outcomeLines: readonly { subscriptionLineId: string; quantity: number }[],
): { subscriptionLineId: string; proposed: number | null; quantity: number }[] | null {
  const seen = new Set<string>();
  const mismatches: { subscriptionLineId: string; proposed: number | null; quantity: number }[] = [];
  for (const item of outcomeLines) {
    if (seen.has(item.subscriptionLineId) || !proposedByLine.has(item.subscriptionLineId)) {
      mismatches.push({ subscriptionLineId: item.subscriptionLineId, proposed: null, quantity: item.quantity });
      continue;
    }
    seen.add(item.subscriptionLineId);
    const proposed = proposedByLine.get(item.subscriptionLineId)!;
    if (item.quantity !== proposed) {
      mismatches.push({ subscriptionLineId: item.subscriptionLineId, proposed, quantity: item.quantity });
    }
  }
  for (const [lineId, proposed] of proposedByLine) {
    if (!seen.has(lineId)) {
      mismatches.push({ subscriptionLineId: lineId, proposed, quantity: 0 });
    }
  }

  return mismatches.length > 0 ? mismatches : null;
}
