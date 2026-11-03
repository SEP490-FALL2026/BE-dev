import { hasSpendStep, type RequestPolicy } from '../access-request/access-request.policy';
import { LONG_TERM_MONTHS, type DeciderRole } from '../access-request/need-decision.policy';

/**
 * The rows of the routing table that give the need step to a person: the head (1), the spending approver for a head who sent for
 * themselves (2), the head who sent for others (5) and the head who decides the lines of a group an Employee sent (9). Row 8 gives
 * the step to nobody, so its step waits and is never in a queue; neither is a step on row 3 or 4, which the approver of last resort
 * held under the rule before `QĐ-93`: it is frozen until the conversion command rewrites it (`QĐ-93k(2)`).
 */
export const HELD_ROUTING_ROWS = [1, 2, 5, 9] as const;

/** The longest excerpt of the reason a row of the queue shows; the whole reason is read on the request. */
export const REASON_EXCERPT_LENGTH = 200;

/** The reason cut to the first `REASON_EXCERPT_LENGTH` characters (by character, not by byte), with an ellipsis when it was cut. */
export function reasonExcerptOf(reason: string): string {
  const characters = [...reason.trim()];

  return characters.length <= REASON_EXCERPT_LENGTH
    ? characters.join('')
    : `${characters.slice(0, REASON_EXCERPT_LENGTH).join('').trimEnd()}…`;
}

/**
 * Whether approving needs the person to confirm the term in so many words: a renewal is long when the right would run on for
 * more than twelve months in all, not when its own term is, as the decision itself reads it.
 */
export function termConfirmationRequiredOf(request: {
  termMonths: number;
  renewal: { consecutiveMonths: number } | null;
}): boolean {
  return (request.renewal?.consecutiveMonths ?? request.termMonths) > LONG_TERM_MONTHS;
}

/** Whether approving also chooses the line of the plan of the budget: the head decides a request that has a spend step. */
export function planLineRequiredOf(deciderRole: DeciderRole, policy: Pick<RequestPolicy, 'chain'>): boolean {
  return deciderRole === 'MANAGER' && hasSpendStep(policy);
}
