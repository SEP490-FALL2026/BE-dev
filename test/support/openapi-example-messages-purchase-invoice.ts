/**
 * Part of SUCCESS_MESSAGES (requests): the success `message` each operation of the purchase invoices answers with (`PI-1`, `QĐ-111u`), and of the cases
 * of the invoices that differ from what was approved or bought (`RC-1`, `QĐ-111y`).
 */
export const SUCCESS_MESSAGES_PURCHASE_INVOICE: Readonly<Record<string, string>> = {
  // Redesign wave 2: a key's cap of activations (W2-21) and who answers for a subscription (W2-27 H16) sit here because the manifest is at its size.
  licenseKeyUpdate: 'LICENSE_KEY.UPDATED',
  subscriptionResponsibleItAdminChange: 'SUBSCRIPTION.RESPONSIBLE_CHANGED',
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
