/**
 * Why a case of an invoice that differs is refused (`RC-1`): there is none of that id for the person (or at all), it was closed already, or the
 * difference Finance wrote is not one the outcome can have (`invoice-discrepancy-closure.policy.ts`).
 */
export type InvoiceDiscrepancyRefusal = 'NOT_FOUND' | 'ALREADY_CLOSED' | 'DIFFERENCE_INVALID';

export class InvoiceDiscrepancyRefusedError extends Error {
  constructor(readonly reason: InvoiceDiscrepancyRefusal) {
    super(`The case of an invoice that differs was refused: ${reason}.`);
    this.name = 'InvoiceDiscrepancyRefusedError';
  }
}
