import type { ExplanationView } from './budget-review-explanation.dto';
import type { LineExplanation } from './budget-review.repo';

/** The explanation of a line as it is read: the amount in the money of the period, the head by code and name. */
export function explanationViewOf(
  explanation: LineExplanation | null,
  money: (minor: bigint) => { amount: string; currency: string },
  people: ReadonlyMap<string, { employeeId: string; employeeCode: string; fullName: string }>,
): ExplanationView | null {
  if (explanation === null) return null;

  return {
    cause: explanation.cause,
    persistence: explanation.persistence,
    action: explanation.action,
    knownNeedsToYearEnd: {
      amount: explanation.needsAmountMinor === null ? null : money(explanation.needsAmountMinor),
      note: explanation.needsNote,
    },
    explainedBy: people.get(explanation.explainedByEmployeeId) ?? null,
    explainedAt: explanation.explainedAt.toISOString(),
  };
}
