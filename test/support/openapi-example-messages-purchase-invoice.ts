import { SUCCESS_MESSAGES_WAVE2 } from './openapi-example-messages-wave2';

/**
 * Part of SUCCESS_MESSAGES (requests): the success `message` each operation of the purchase invoices answers with (`PI-1`, `QĐ-111u`), and of the cases
 * of the invoices that differ from what was approved or bought (`RC-1`, `QĐ-111y`).
 */
export const SUCCESS_MESSAGES_PURCHASE_INVOICE: Readonly<Record<string, string>> = {
  ...SUCCESS_MESSAGES_WAVE2,
  invoiceDiscrepancyClose: 'INVOICE_DISCREPANCY.CLOSED',
  invoiceDiscrepancyGet: 'INVOICE_DISCREPANCY.READ',
  invoiceDiscrepancyList: 'INVOICE_DISCREPANCY.LISTED',
  purchaseInvoiceConfirm: 'PURCHASE_INVOICE.CONFIRMED',
  purchaseInvoiceGet: 'PURCHASE_INVOICE.READ',
  purchaseInvoiceList: 'PURCHASE_INVOICE.LISTED',
  purchaseInvoiceMissingPeriodList: 'PURCHASE_INVOICE.MISSING_PERIODS_LISTED',
  purchaseInvoicePreview: 'PURCHASE_INVOICE.PREVIEWED',
  purchaseInvoiceResubmit: 'PURCHASE_INVOICE.RESUBMITTED',
  purchaseInvoiceReturn: 'PURCHASE_INVOICE.RETURNED',
  purchaseInvoiceSubmit: 'PURCHASE_INVOICE.SUBMITTED',
};
