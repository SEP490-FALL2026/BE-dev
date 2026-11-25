import { DONG, formatAmount } from '../../../core/money/money';
import type { LicenseLotSummaryWire, LicenseLotWire } from './license-lot.dto';
import type { LicenseLotDetail } from './license-lot.types';

const dong = (minor: bigint) => ({ amount: formatAmount(minor, 0), currency: DONG });

/** A lot as the detail routes answer it: money in dong as decimal text, dates as ISO text. */
export function toLicenseLotWire(lot: LicenseLotDetail): LicenseLotWire {
  return {
    id: lot.id,
    plan: lot.plan,
    purchasedOn: lot.purchasedOn,
    licenseCount: lot.licenseCount,
    assigned: lot.assigned,
    free: lot.free,
    keysInStore: lot.keysInStore,
    grantable: lot.grantable,
    unitPrice: dong(lot.unitPriceMinor),
    freeValue: dong(lot.freeValueMinor),
    purpose: lot.purpose,
    contract: lot.contract,
    workspace: lot.workspace,
    responsibleItAdminEmployeeId: lot.responsibleItAdminEmployeeId,
    note: lot.note,
    requestId: lot.requestId,
    invoiceActual: lot.invoiceActualMinor === null ? null : dong(lot.invoiceActualMinor),
    originalUnitPrice: lot.originalUnitPrice
      ? { amount: formatAmount(lot.originalUnitPrice.amountMinor, 2), currency: lot.originalUnitPrice.currency }
      : null,
    updatedAt: lot.updatedAt.toISOString(),
  };
}

/** A lot as a page of the list shows it: the detail without the note, the request, the invoice and the quote in another currency. */
export function toLicenseLotSummaryWire(lot: LicenseLotDetail): LicenseLotSummaryWire {
  const detail: Partial<LicenseLotWire> = toLicenseLotWire(lot);
  delete detail.note;
  delete detail.requestId;
  delete detail.invoiceActual;
  delete detail.originalUnitPrice;

  return detail as LicenseLotSummaryWire;
}
