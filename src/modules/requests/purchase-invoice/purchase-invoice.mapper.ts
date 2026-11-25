import { fromDateColumn } from '../../../core/business-date';
import { DONG, formatAmount } from '../../../core/money/money';
import type { PurchaseInvoiceFlag } from './labels/purchase-invoice-labels.policy';
import type {
  PurchaseInvoiceDetailWire,
  PurchaseInvoiceMissingPeriodWire,
  PurchaseInvoicePreviewWire,
  PurchaseInvoiceSummaryWire,
} from './purchase-invoice.dto';
import type { PurchaseInvoiceRow } from './purchase-invoice.repo';
import type { MissingInvoicePeriod, PurchaseInvoicePlan } from './purchase-invoice.types';

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
    poolFigures?: { expectedMinor: bigint | null; varianceMinor: bigint } | null;
  },
): PurchaseInvoiceDetailWire {
  const summary = toSummary(row);
  const poolFigures = extra.poolFigures ?? null;
  const flags =
    poolFigures !== null && poolFigures.expectedMinor === null && !summary.flags.includes('NO_EXPECTED_AMOUNT')
      ? ([...summary.flags, 'NO_EXPECTED_AMOUNT'] as PurchaseInvoiceFlag[])
      : summary.flags;

  return {
    ...summary,
    flags,
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
    poolExpected: poolFigures?.expectedMinor != null ? dongView(poolFigures.expectedMinor) : null,
    poolVariance: poolFigures !== null ? dongView(poolFigures.varianceMinor) : null,
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

/** A period without an invoice with the names of its plan and department, as the list of them shows it. */
export function toMissingPeriod(
  row: MissingInvoicePeriod,
  names: {
    plan: { planId: string; planName: string; applicationName: string; logoUrl: string | null };
    department: { id: string; name: string } | null;
  },
): PurchaseInvoiceMissingPeriodWire {
  return {
    linkKind: row.link.kind,
    requestId: row.link.kind === 'REQUEST' ? row.link.requestId : null,
    subscriptionId: row.link.kind === 'SUBSCRIPTION' ? row.link.subscriptionId : null,
    label: row.label,
    servicePeriodMonth: monthOf(row.serviceMonth),
    periodIndex: row.periodIndex,
    periodCount: row.periodCount,
    paymentDate: row.paymentDate,
    dueDate: row.dueDate,
    plan: names.plan,
    department: names.department,
  };
}
