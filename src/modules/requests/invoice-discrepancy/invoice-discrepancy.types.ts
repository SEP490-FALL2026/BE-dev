/** What differs between an invoice and what was approved or bought (`R-44`): the count of seats or keys, the price of one in the currency the invoice states. */
export type InvoiceDiscrepancyMismatch = 'QUANTITY' | 'UNIT_PRICE';

export type InvoiceDiscrepancyState = 'OPEN' | 'CLOSED';

export type InvoiceDiscrepancyOutcome = 'EXPLAINED' | 'OUT_OF_PROCESS_SUSPECTED';

/** Whose cases are read: Finance reads every one; an IT Admin those of the invoices they submitted and of the requests of the departments they work (`D8`). */
export type InvoiceDiscrepancyScope =
  { kind: 'ALL' } | { kind: 'IT_ADMIN'; employeeId: string; departmentIds: readonly string[] };

export interface InvoiceDiscrepancyFilter {
  state?: InvoiceDiscrepancyState;
  outcome?: InvoiceDiscrepancyOutcome;
}
