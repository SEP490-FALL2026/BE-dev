/** Why the invoice of a purchase could not be recorded (`PI-1`): the number is already taken by an invoice of the vendor, the amounts are not above nothing, or nothing says where to book it. */
export type PurchaseInvoiceRecordRefusal = 'DUPLICATE_NUMBER' | 'AMOUNT_NOT_POSITIVE' | 'NO_PLACE';

export class PurchaseInvoiceRecordRefusedError extends Error {
  constructor(readonly reason: PurchaseInvoiceRecordRefusal) {
    super(`The invoice of the purchase was refused: ${reason}.`);
    this.name = 'PurchaseInvoiceRecordRefusedError';
  }
}
