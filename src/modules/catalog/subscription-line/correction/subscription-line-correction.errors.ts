/** Mid-term seat reduction is refused when the subscription's `allowsMidTermReduction` flag is off (`SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED`). */
export class SeatLedgerMidTermReductionNotAllowedError extends Error {
  constructor() {
    super('Mid-term seat reduction is not allowed for this subscription.');
    this.name = 'SeatLedgerMidTermReductionNotAllowedError';
  }
}

/** Total mid-term reductions referencing a purchase row exceed that purchase's delta (`SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE`). */
export class SeatLedgerReductionExceedsPurchaseError extends Error {
  constructor(
    readonly remaining: number,
    readonly requested: number,
  ) {
    super(`Requested reduction (${requested}) exceeds the remaining reducible seats (${remaining}) of this purchase.`);
    this.name = 'SeatLedgerReductionExceedsPurchaseError';
  }
}

/** Referenced `refundedSeatChangeId` is missing, on another line, or not an INITIAL/TOP_UP/RENEWAL row (`VALIDATION_ERROR`). */
export class SeatLedgerInvalidRefundTargetError extends Error {
  constructor() {
    super('refundedSeatChangeId must reference an INITIAL, TOP_UP, or RENEWAL entry on this same subscription line.');
    this.name = 'SeatLedgerInvalidRefundTargetError';
  }
}
