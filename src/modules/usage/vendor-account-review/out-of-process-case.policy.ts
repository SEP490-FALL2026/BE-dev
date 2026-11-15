import type { OutOfProcessOutcome } from './vendor-account-review.types';

export type OutOfProcessClosureRefusal =
  'RECORD_FIELDS_NOT_ALLOWED' | 'RECORD_FIELDS_MISSING' | 'DOCUMENT_REQUIRED' | 'AMOUNT_INVALID' | 'NO_VENDOR';

/**
 * What a case outside the process may be closed with (`SBF-07a`, R-45), as pure rules. Money is recorded only as money already spent that has a proof
 * of payment of the company: an amount above nothing and at least one file, booked to a vendor. With no proof the case can only be a false alarm or a
 * report with the reason, and the two of them carry no money, no file and no Cost Center. Why the closing is refused; null when it stands.
 */
export function closureRefusal(input: {
  outcome: OutOfProcessOutcome;
  documentCount: number;
  amountMinor: bigint | null;
  /** Whether a Cost Center, or none yet, was chosen for the money. */
  costCenterChosen: boolean;
  hasVendor: boolean;
}): OutOfProcessClosureRefusal | null {
  if (input.outcome !== 'RECORD_SPENT') {
    return input.documentCount > 0 || input.amountMinor !== null || input.costCenterChosen
      ? 'RECORD_FIELDS_NOT_ALLOWED'
      : null;
  }
  if (input.documentCount === 0) return 'DOCUMENT_REQUIRED';
  if (input.amountMinor === null || !input.costCenterChosen) return 'RECORD_FIELDS_MISSING';
  if (input.amountMinor <= 0n) return 'AMOUNT_INVALID';
  if (!input.hasVendor) return 'NO_VENDOR';

  return null;
}
