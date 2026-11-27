import type { NestedArrayEntry } from './api-collection-registry';

const OWNER = 'api-list-detail-contract-remediation';

/**
 * The nested arrays of a purchase invoice added by `PI-1.4` (`QĐ-111u`, `QĐ-111w`): the files that came with it and the marks laid on it. The
 * files are at most PURCHASE_INVOICE_DOCUMENTS_MAX (20) and the marks at most PURCHASE_INVOICE_FLAGS_MAX (3: over what was approved, outside the term,
 * or missing expected pool amount), both the `maxItems` of the schema, so none of them grows the answer.
 */
export const NESTED_ARRAYS_PI1: readonly NestedArrayEntry[] = [
  {
    key: 'purchaseInvoiceGet#documents',
    maxItems: 20,
    bound: 'PURCHASE_INVOICE_DOCUMENTS_MAX',
    rationale:
      'The files that came with the invoice, in the order the IT Admin gave them: one to twenty are accepted when it is submitted.',
  },
  {
    key: 'purchaseInvoiceGet#flags',
    maxItems: 3,
    bound: 'PURCHASE_INVOICE_FLAGS_MAX',
    rationale: 'The marks laid on the invoice: there are three kinds and each comes at most once.',
  },
  {
    key: 'purchaseInvoiceList#flags',
    maxItems: 3,
    bound: 'PURCHASE_INVOICE_FLAGS_MAX',
    rationale: 'The marks laid on each invoice of the page: there are three kinds and each comes at most once.',
  },
].map(({ key, maxItems, bound, rationale }): NestedArrayEntry => ({
  key,
  classification: 'bounded',
  findings: [],
  owner: OWNER,
  businessMaximum: {
    maxItems,
    source: `${bound} in purchase-invoice.dto.ts, the maxItems of the array in the schema: a submission takes at most that many and the detail never holds more`,
  },
  rationale,
  removeWhen: `Review when ${bound} changes or the files of a purchase invoice become a paged subresource.`,
}));
