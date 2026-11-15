import { fromDateColumn } from '../../../core/business-date';
import { DONG, formatAmount } from '../../../core/money/money';
import type { PurchaseInvoiceFlag } from './labels/purchase-invoice-labels.policy';
import type {
  PurchaseInvoiceDetailWire,
  PurchaseInvoicePreviewWire,
  PurchaseInvoiceSummaryWire,
} from './purchase-invoice.dto';
import type { PurchaseInvoiceRow } from './purchase-invoice.repo';
import type { PurchaseInvoicePlan } from './purchase-invoice.types';

/** An amount in dong: the currency has no minor digits (`QĐ-111an`). */
export const dongView = (minor: bigint) => ({ amount: formatAmount(minor, 0), currency: DONG });

const monthOf = (day: string): string => day.slice(0, 7);

export function toSummary(row: PurchaseInvoiceRow): PurchaseInvoiceSummaryWire {
  return {
    id: row.id,
    state: row.state,
    label: row.label,
    servicePeriodMonth: monthOf(fromDateColumn(row.serviceMonth)),
    periodIndex: row.periodIndex,
    periodCount: row.periodCount,
    matchResult: row.matchResult === 'PRICE_QUANTITY_EXCEPTION' ? 'PRICE_QUANTITY_EXCEPTION' : 'MATCHED',
    flags: row.flags as PurchaseInvoiceFlag[],
    linkKind: row.linkKind,
    requestId: row.requestId,
    subscriptionId: row.subscriptionId,
    vendorId: row.vendorId,
    vendorInvoiceNumber: row.number,
    issuedOn: fromDateColumn(row.issuedOn),
    quantity: row.quantity,
    netAmount: dongView(row.netMinor),
    paymentSource: row.paymentSource,
    submittedBy: { employeeId: row.submittedByEmployeeId },
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

export function toDetail(
  row: PurchaseInvoiceRow,
  extra: {
    documents: { documentId: string; position: number }[];
    resubmittedAsId: string | null;
    originalMinorUnits: number;
  },
): PurchaseInvoiceDetailWire {
  return {
    ...toSummary(row),
    provisioningTaskId: row.provisioningTaskId,
    unitPriceOriginal: {
      amount: formatAmount(row.unitPriceOriginalMinor, extra.originalMinorUnits),
      currency: row.unitPriceOriginalCurrency,
    },
    deductibleTax: dongView(row.deductibleTaxMinor),
    nonDeductibleTax: dongView(row.nonDeductibleTaxMinor),
    chargedCostCenterId: row.chargedCostCenterId,
    decidedBy: row.decidedByEmployeeId ? { employeeId: row.decidedByEmployeeId } : null,
    returnReason: row.returnReason,
    resubmissionOfId: row.resubmissionOfId,
    resubmittedAsId: extra.resubmittedAsId,
    invoiceId: row.invoiceId,
    documents: extra.documents,
  };
}

export function toPreview(plan: PurchaseInvoicePlan): PurchaseInvoicePreviewWire {
  return {
    label: plan.period.label,
    servicePeriodMonth: monthOf(plan.serviceMonth),
    periodIndex: plan.period.periodIndex,
    periodCount: plan.period.periodCount,
    matchResult: plan.match.result,
    flags: plan.flags,
    chargedCostCenter: plan.chargedCostCenterId ? { id: plan.chargedCostCenterId } : null,
    commitment: plan.commitment
      ? { id: plan.commitment.id, remaining: dongView(plan.commitment.remainingMinor) }
      : null,
  };
}
