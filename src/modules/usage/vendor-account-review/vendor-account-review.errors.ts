/**
 * Why the review of the accounts at the vendor, or a case outside the process, refuses (RC-2): there is none of that id, it was decided or closed
 * already, the closing is not one the outcome can have (a proof of payment missing, an amount that is not above nothing, fields that belong to
 * another outcome), the software has no vendor to book the money to, the Cost Center is not one, or a file is not the proof of payment of the
 * person who closes it.
 */
export type VendorAccountReviewRefusal =
  | 'NOT_FOUND'
  | 'ALREADY_DECIDED'
  | 'CASE_NOT_FOUND'
  | 'CASE_ALREADY_CLOSED'
  | 'DOCUMENT_REQUIRED'
  | 'DOCUMENT_INVALID'
  | 'RECORD_FIELDS_MISSING'
  | 'RECORD_FIELDS_NOT_ALLOWED'
  | 'AMOUNT_INVALID'
  | 'NO_VENDOR'
  | 'COST_CENTER_NOT_FOUND'
  | 'NUMBER_TAKEN';

export class VendorAccountReviewRefusedError extends Error {
  constructor(
    readonly reason: VendorAccountReviewRefusal,
    readonly problem?: string,
  ) {
    super(`The review of the accounts at the vendor refused: ${reason}${problem ? ` (${problem})` : ''}.`);
    this.name = 'VendorAccountReviewRefusedError';
  }
}
