import { fromDateColumn } from '../../../core/business-date';
import { DONG, formatAmount } from '../../../core/money/money';
import type { InvoiceDiscrepancyRow } from '../invoice-discrepancy/invoice-discrepancy.repo';
import type { InvoiceDiscrepancyDetailWire, InvoiceDiscrepancySummaryWire } from './invoice-discrepancy.dto';

/** The digits after the point of each currency the cases of a page state a price in, by code; the dong has none. */
export type MinorUnitsOf = ReadonlyMap<string, number>;

const dong = (minor: bigint) => ({ amount: formatAmount(minor, 0), currency: DONG });

const priceOf = (minor: bigint, currency: string, units: MinorUnitsOf) => ({
  amount: formatAmount(minor, units.get(currency) ?? 2),
  currency,
});

/** The currencies the prices of these cases are stated in, so a page reads each one once. */
export function currenciesOf(rows: readonly InvoiceDiscrepancyRow[]): string[] {
  return [
    ...new Set(
      rows.flatMap((row) => [
        row.purchaseInvoice.unitPriceOriginalCurrency,
        ...(row.purchaseInvoice.expectedUnitPriceOriginalCurrency
          ? [row.purchaseInvoice.expectedUnitPriceOriginalCurrency]
          : []),
      ]),
    ),
  ];
}

export function toSummary(row: InvoiceDiscrepancyRow, units: MinorUnitsOf): InvoiceDiscrepancySummaryWire {
  const invoice = row.purchaseInvoice;

  return {
    id: row.id,
    state: row.state,
    mismatches: row.mismatches as InvoiceDiscrepancySummaryWire['mismatches'],
    openedAt: row.openedAt.toISOString(),
    outcome: row.outcome,
    purchaseInvoice: {
      id: invoice.id,
      vendorId: invoice.vendorId,
      vendorInvoiceNumber: invoice.number,
      servicePeriodMonth: fromDateColumn(invoice.serviceMonth).slice(0, 7),
      linkKind: invoice.linkKind,
      requestId: invoice.requestId,
      subscriptionId: invoice.subscriptionId,
      netAmount: dong(invoice.netMinor),
    },
    quantity: { invoice: invoice.quantity, expected: invoice.expectedQuantity },
    unitPrice: {
      invoice: priceOf(invoice.unitPriceOriginalMinor, invoice.unitPriceOriginalCurrency, units),
      expected:
        invoice.expectedUnitPriceOriginalMinor !== null && invoice.expectedUnitPriceOriginalCurrency !== null
          ? priceOf(invoice.expectedUnitPriceOriginalMinor, invoice.expectedUnitPriceOriginalCurrency, units)
          : null,
    },
  };
}

export function toDetail(row: InvoiceDiscrepancyRow, units: MinorUnitsOf): InvoiceDiscrepancyDetailWire {
  return {
    ...toSummary(row, units),
    closure:
      row.state === 'CLOSED' &&
      row.outcome !== null &&
      row.reason !== null &&
      row.differenceMinor !== null &&
      row.closedByEmployeeId !== null &&
      row.closedAt !== null
        ? {
            outcome: row.outcome,
            reason: row.reason,
            differenceAmount: dong(row.differenceMinor),
            closedBy: { employeeId: row.closedByEmployeeId },
            closedAt: row.closedAt.toISOString(),
          }
        : null,
  };
}
