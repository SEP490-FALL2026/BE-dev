import type { RenewalChoice } from '../subscription-renewal.types';

/** The three parts of the seats the next period needs (`QĐ-103e`, `QĐ-106i`(2)); no buffer seat is added. */
export interface SeatsNeededParts {
  /** Seats not being taken back whose last day is after the renewal day (the seat that ends on the renewal day is not here). */
  heldPastRenewal: number;
  /** Seats ending by the renewal day, not being taken back, that a request to go on using is waiting for. */
  pendingContinuations: number;
  /** People the requests for the plan, approved in full, are still to be granted for (no task yet, so no seat holds them): the module of requests counts them. */
  approvedAwaitingGrant: number;
}

/** What the IT Admin sees and what a cancellation is judged by: the parts, the seats still in effect and the requests still open. */
export interface SeatsNeededCounts extends SeatsNeededParts {
  seatsNeeded: number;
  vendorMinimumSeats: number | null;
  /** The seats to buy for the next period: the need, raised to the vendor minimum, or zero when nothing is needed. */
  target: number;
  /** The seats of the subscription not ended today, including one that starts later and one being taken back (`R2-4`). */
  activeSeatsToday: number;
  /** The requests for the plan that are not in a final state. */
  openRequests: number;
}

export type SeatsNeededProblem =
  /** A cancellation while seats are held, taken back and not yet gone, or while a request for the plan is open. */
  | 'CANCEL_NOT_ALLOWED'
  /** The quantity is not the target: the numbers changed or the IT Admin counted otherwise (`QĐ-104d`). */
  | 'QUANTITY_NOT_SEATS_NEEDED'
  /** The target is the vendor minimum, above the need: the note is the evidence for it. */
  | 'VENDOR_MINIMUM_EVIDENCE_REQUIRED';

export const seatsNeededOf = (parts: SeatsNeededParts): number =>
  parts.heldPastRenewal + parts.pendingContinuations + parts.approvedAwaitingGrant;

export const targetOf = (seatsNeeded: number, vendorMinimumSeats: number | null): number =>
  seatsNeeded === 0 ? 0 : Math.max(seatsNeeded, vendorMinimumSeats ?? 0);

/**
 * The choice the count points to, for the IT Admin to start from: nothing needed is a cancellation (whether it is allowed is `cancelProblem`),
 * the target the seats bought is a renewal, fewer a reduction, more an increase; null when the seats bought are not known.
 */
export function suggestedChoiceOf(target: number, purchasedQuantity: number | null): RenewalChoice | null {
  if (target === 0) return 'CANCEL';
  if (purchasedQuantity === null) return null;
  if (target === purchasedQuantity) return 'RENEW';

  return target < purchasedQuantity ? 'REDUCE' : 'INCREASE';
}

/**
 * A cancellation is allowed only when nothing is needed, no seat is left in effect (the renewal outcome refuses a cancellation with
 * seats not taken back) and no request for the plan is open (`QĐ-103e`, `QĐ-99i`).
 */
export function cancelProblem(
  counts: Pick<SeatsNeededCounts, 'target' | 'activeSeatsToday' | 'openRequests'>,
): SeatsNeededProblem | null {
  const allowed = counts.target === 0 && counts.activeSeatsToday === 0 && counts.openRequests === 0;

  return allowed ? null : 'CANCEL_NOT_ALLOWED';
}

export interface RecordedChoice {
  choice: RenewalChoice;
  /** The seats the IT Admin names for the next period; null for a cancellation. */
  quantity: number | null;
  note: string | null;
}

/**
 * Whether the choice fits the counted seats (`§4.4` step 6), the first problem in the order of the rule: a cancellation by its three
 * conditions; any other choice by the target (zero means the next period must be cancelled), then by the evidence of a vendor minimum.
 */
export function choiceProblem(counts: SeatsNeededCounts, input: RecordedChoice): SeatsNeededProblem | null {
  if (input.choice === 'CANCEL') return cancelProblem(counts);
  if (counts.target === 0 || input.quantity !== counts.target) return 'QUANTITY_NOT_SEATS_NEEDED';
  const evidenced = (input.note ?? '').trim() !== '';

  return counts.target > counts.seatsNeeded && !evidenced ? 'VENDOR_MINIMUM_EVIDENCE_REQUIRED' : null;
}
