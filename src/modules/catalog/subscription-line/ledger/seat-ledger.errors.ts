/** A ledger entry breaks the shape required by its door. */
export class SeatLedgerInvalidEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeatLedgerInvalidEntryError';
  }
}
