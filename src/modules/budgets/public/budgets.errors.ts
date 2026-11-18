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

/** The request already holds a commitment for the year: one for each year (`INV-16`, `US-06-04` AC-3). */
export class BudgetCommitmentExistsError extends Error {
  constructor(readonly year: number) {
    super(`The request already holds a commitment for the year ${year}.`);
    this.name = 'BudgetCommitmentExistsError';
  }
}

/**
 * The approval cannot hold a commitment as asked (`FR-5.8`(1), `FR-5.8a`): more or fewer than one year, a year that is not the current
 * one, an amount that is not above nothing, or no approved version of the year in the Cost Center. A safety net: the check of the budget
 * already stops a request whose year has no approved version, in the same transaction. The year is the one asked.
 */
export class BudgetCommitmentNotHoldableError extends Error {
  constructor(
    readonly reason: 'MORE_THAN_ONE_YEAR' | 'NOT_CURRENT_YEAR' | 'NOT_POSITIVE' | 'NO_APPROVED_BUDGET',
    readonly year: number | null = null,
  ) {
    super(`The request cannot hold a commitment as asked: ${reason}.`);
    this.name = 'BudgetCommitmentNotHoldableError';
  }
}
