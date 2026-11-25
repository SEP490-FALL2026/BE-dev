import type { BusinessDate } from '../../../../core/business-date';

/** Manual ledger entry effective date falls in a month before the current business month (`SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH`). */
export class SeatLedgerEffectiveInClosedMonthError extends Error {
  constructor(readonly earliestOn: BusinessDate) {
    super(`The effective date cannot be before the start of the current month (${earliestOn}).`);
    this.name = 'SeatLedgerEffectiveInClosedMonthError';
  }
}

/** A ledger entry breaks the shape required by its door. */
export class SeatLedgerInvalidEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeatLedgerInvalidEntryError';
  }
}
