/**
 * Why a purchase invoice is refused (`PI-1`): the request or subscription it names is not one the IT Admin works (or does not exist), it is not
 * one that can be purchased for, the number is taken, a file is not the person's purchase document, and, when Finance decides, the person who
 * submitted it is the one signing or it was decided already.
 */
export type PurchaseInvoiceRefusal =
  | 'LINK_NOT_FOUND'
  | 'NOT_FOUND'
  | 'REQUEST_NOT_PURCHASABLE'
  | 'NO_VENDOR'
  | 'NUMBER_TAKEN'
  | 'DOCUMENT_INVALID'
  | 'NOT_RETURNED'
  | 'ALREADY_RESUBMITTED'
  | 'SAME_PERSON'
  | 'NOT_SUBMITTED'
  | 'NO_PLACE';

export class PurchaseInvoiceRefusedError extends Error {
  constructor(
    readonly reason: PurchaseInvoiceRefusal,
    readonly problem?: string,
  ) {
    super(`The purchase invoice was refused: ${reason}${problem ? ` (${problem})` : ''}.`);
    this.name = 'PurchaseInvoiceRefusedError';
  }
}
