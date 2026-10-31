import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { RenewalProblem } from '../subscription-renewal.errors';
import type { HeldSeat, RenewalChoice, RenewalOutcomeKind } from '../subscription-renewal.types';

/**
 * Whether the outcome fits the decision (`US-11-03` AC-15, AC-18, `US-11-05` AC-11, AC-12): an outcome as decided records the new
 * period a renewal or a reduction makes, with the number of seats decided (the same number for a renewal as it is), and no period
 * for a cancellation. Any other outcome records what the vendor really did, with or without a new period.
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
  const expected = input.decidedChoice === 'REDUCE' ? input.decidedQuantity : input.purchasedQuantity;

  return expected === null || expected === input.nextQuantity ? null : 'OUTCOME_MISMATCH';
}

/**
 * The seats that go on into the new period (`QĐ-35c`): those held on its first day — begun before it, not ended by it, and not
 * expected to end before it. A seat that ends before the new period stays where it is and is never carried.
 */
export function seatsToCarry(seats: readonly HeldSeat[], startDate: BusinessDate): HeldSeat[] {
  return seats.filter(
    (seat) =>
      seat.validFrom < startDate &&
      (seat.validUntil === null || seat.validUntil > startDate) &&
      (seat.expectedEndDate === null || seat.expectedEndDate >= startDate),
  );
}

interface PeriodCost {
  unitPrice: { amountMinor: bigint; currency: string } | null;
  quantity: number | null;
  billingCycle: string | null;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
}

const lengthOf = (period: PeriodCost): number | null =>
  period.startDate !== null && period.endDate !== null
    ? Math.round((Date.parse(addDays(period.endDate, 1)) - Date.parse(period.startDate)) / 86_400_000)
    : null;

const totalOf = (period: PeriodCost): bigint | null =>
  period.unitPrice === null ? null : period.unitPrice.amountMinor * BigInt(period.quantity ?? 1);

/** Two periods compare when both are priced in one currency, on one billing cycle and, when both say it, for the same length. */
function comparable(old: PeriodCost, next: PeriodCost): boolean {
  if (old.unitPrice === null || next.unitPrice === null) return false;
  if (old.unitPrice.currency !== next.unitPrice.currency || old.billingCycle !== next.billingCycle) return false;
  const [oldLength, nextLength] = [lengthOf(old), lengthOf(next)];

  return oldLength === null || nextLength === null || oldLength === nextLength;
}

/**
 * The savings at renewal (`FR-4.15`, `QĐ-66w`, `US-11-03` AC-3, AC-21): only for an outcome the vendor confirmed as decided, when
 * the total of the new period is lower than the total of the old one of the same length, in the same currency. Fewer seats at a
 * higher price can save nothing; a decision that is not carried out saves nothing; a cancellation is left to the reports.
 */
export function realisedSavingsOf(input: {
  outcome: RenewalOutcomeKind;
  old: PeriodCost;
  next: PeriodCost | null;
}): { amountMinor: bigint; currency: string } | null {
  if (input.outcome !== 'AS_DECIDED' || input.next === null || !comparable(input.old, input.next)) return null;
  const saved = (totalOf(input.old) ?? 0n) - (totalOf(input.next) ?? 0n);

  return saved > 0n && input.old.unitPrice ? { amountMinor: saved, currency: input.old.unitPrice.currency } : null;
}
