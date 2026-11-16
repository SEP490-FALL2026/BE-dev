/** Why the invoice of a purchase could not be recorded (`PI-1`): the number is already taken by an invoice of the vendor, the amounts are not above nothing, or nothing says where to book it. */
export type PurchaseInvoiceRecordRefusal = 'DUPLICATE_NUMBER' | 'AMOUNT_NOT_POSITIVE' | 'NO_PLACE';

export class PurchaseInvoiceRecordRefusedError extends Error {
  constructor(readonly reason: PurchaseInvoiceRecordRefusal) {
    super(`The invoice of the purchase was refused: ${reason}.`);
    this.name = 'PurchaseInvoiceRecordRefusedError';
  }
}

/** Why the money of a case outside the process (`SBF-07a`) could not be recorded: the amount is not above nothing, or the vendor has an invoice with this number. */
export type OutOfProcessSpendRefusal = 'AMOUNT_NOT_POSITIVE' | 'DUPLICATE_NUMBER';

export class OutOfProcessSpendRefusedError extends Error {
  constructor(readonly reason: OutOfProcessSpendRefusal) {
    super(`The money of the case outside the process was refused: ${reason}.`);
    this.name = 'OutOfProcessSpendRefusedError';
  }
}
