/**
 * What Finance may close a case of an invoice that differs with (`RC-1`, `QĐ-111y`, `R-29`), as pure rules. An explanation (the extra seats were
 * bought for a reason, the vendor's price changed) may leave a difference of nothing; a suspicion that someone paid for the software outside the
 * process only means something when there is money unaccounted for, so it needs a difference above nothing. No difference is below nothing: it is what
 * the invoice cost beyond what was approved or bought, and an invoice for less is explained, not suspected.
 */

export type InvoiceDiscrepancyOutcomeKind =
  'EXPLAINED' | 'OUT_OF_PROCESS_SUSPECTED' | 'EXCHANGE_RATE_LINE_PRICE_UPDATED';

export type InvoiceDiscrepancyClosureRefusal = 'DIFFERENCE_INVALID';

/** Why the closing is refused; null when it stands. */
export function closureRefusal(input: {
  outcome: InvoiceDiscrepancyOutcomeKind;
  differenceMinor: bigint;
}): InvoiceDiscrepancyClosureRefusal | null {
  if (input.differenceMinor < 0n) return 'DIFFERENCE_INVALID';
  if (input.outcome === 'OUT_OF_PROCESS_SUSPECTED' && input.differenceMinor === 0n) return 'DIFFERENCE_INVALID';

  return null;
}

/** Whether the case goes on to the review of the accounts at the vendor (`SBF-08`): only a suspicion does. */
export function isReferred(outcome: InvoiceDiscrepancyOutcomeKind): boolean {
  return outcome === 'OUT_OF_PROCESS_SUSPECTED';
}
