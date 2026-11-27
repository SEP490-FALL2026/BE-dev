/** What differs between an invoice and what was approved or bought (`R-44`): count, unit price, or expected pool amount. */
export type InvoiceDiscrepancyMismatch = 'QUANTITY' | 'UNIT_PRICE' | 'EXPECTED_AMOUNT';

export type InvoiceDiscrepancyState = 'OPEN' | 'CLOSED';

export type InvoiceDiscrepancyOutcome = 'EXPLAINED' | 'OUT_OF_PROCESS_SUSPECTED' | 'EXCHANGE_RATE_LINE_PRICE_UPDATED';

/** Whose cases are read: Finance reads every one; an IT Admin those of the invoices they submitted and of the requests of the departments they work (`D8`). */
export type InvoiceDiscrepancyScope =
  { kind: 'ALL' } | { kind: 'IT_ADMIN'; employeeId: string; departmentIds: readonly string[] };

export interface InvoiceDiscrepancyFilter {
  state?: InvoiceDiscrepancyState;
  outcome?: InvoiceDiscrepancyOutcome;
}
