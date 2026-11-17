import type { OutOfProcessOutcome } from './vendor-account-review.types';

export type OutOfProcessClosureRefusal =
  | 'RECORD_FIELDS_NOT_ALLOWED'
  | 'RECORD_FIELDS_MISSING'
  | 'DOCUMENT_REQUIRED'
  | 'AMOUNT_INVALID'
  | 'NO_VENDOR'
  | 'REVOKE_NOT_ALLOWED'
  | 'REVOKE_EVIDENCE_MISSING';

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
  /** Concluded on a company asset (`QĐ-103y`(3)); the person said so when they decided it was outside the process. */
  companyAsset: boolean | null;
  /** The IT Admin says the renewal or payment with the vendor was cancelled (`QĐ-104j`). */
  renewalCancelled: boolean;
}): OutOfProcessClosureRefusal | null {
  if (input.outcome === 'REVOKED') return revokeRefusal(input);
  if (input.renewalCancelled) return 'RECORD_FIELDS_NOT_ALLOWED';
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

/**
 * The account a case is about, as the key that keeps one case open for each (`QĐ-98h`, `US-13-03` AC-11): the vendor, then the identifier at the vendor
 * lower-cased, or the person when only the person is known, or the difference itself when nothing says which account it is (it is then its own account).
 */
export function openCaseKeyOf(input: {
  vendorId: string | null;
  identity: string | null;
  employeeId: string | null;
  discrepancyId: string;
}): string {
  const identity = input.identity?.trim().toLowerCase();
  const account = identity
    ? identity
    : input.employeeId !== null
      ? `employee:${input.employeeId}`
      : `discrepancy:${input.discrepancyId}`;

  return `${input.vendorId ?? 'no-vendor'}:${account}`;
}

/**
 * A revocation closes only a case on a company asset (an account registered with the company email or in the company workspace; a personal account is only
 * recorded), and only with the renewal or payment cancelled and a proof of it, such as the letter of the vendor, a screenshot of the payment page or the card
 * locked (`QĐ-104j`, `US-13-05` AC-20, AC-24, AC-25); it carries no money.
 */
function revokeRefusal(input: {
  documentCount: number;
  amountMinor: bigint | null;
  costCenterChosen: boolean;
  companyAsset: boolean | null;
  renewalCancelled: boolean;
}): OutOfProcessClosureRefusal | null {
  if (input.companyAsset !== true) return 'REVOKE_NOT_ALLOWED';
  if (input.amountMinor !== null || input.costCenterChosen) return 'RECORD_FIELDS_NOT_ALLOWED';
  if (!input.renewalCancelled || input.documentCount === 0) return 'REVOKE_EVIDENCE_MISSING';

  return null;
}
