import { DONG, formatAmount } from '../../../core/money/money';
import type { LicenseLotWire } from './license-lot.dto';
import type { LicenseLotDetail } from './license-lot.types';

const dong = (minor: bigint) => ({ amount: formatAmount(minor, 0), currency: DONG });

/** A lot as the routes answer it: money in dong as decimal text, dates as ISO text. */
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
