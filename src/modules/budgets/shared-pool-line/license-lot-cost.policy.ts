import { roundHalfAway } from '../../../core/seat-month-cost';

export type LotInvoiceAllocationPlan =
  | {
      readonly bucket: 'POOL_IDLE';
      readonly kind: 'ORIGINAL';
      readonly amountMinor: bigint;
    }
  | {
      readonly bucket: 'POOL_LOT_DIFFERENCE';
      readonly kind: 'LOT_DIFFERENCE';
      readonly amountMinor: bigint;
    };

export type LotInvoiceConfirmationPlan =
  | { readonly kind: 'OPENING' }
  | {
      readonly kind: 'POOL_BUCKET';
      readonly bucket: 'POOL_IDLE' | 'POOL_DEVICE_LOT' | 'POOL_REPLACEMENT';
      readonly amountMinor: bigint;
      readonly unitCostActualMinor: bigint;
      readonly taxVariancePerLicenseMinor: bigint;
    }
  | {
      readonly kind: 'REQUEST';
      readonly unitCostActualMinor: bigint;
      readonly taxVariancePerLicenseMinor: bigint;
      readonly costCenterMinor: bigint;
      readonly poolAllocation: LotInvoiceAllocationPlan | null;
    };

export interface LotInvoiceConfirmationInput {
  readonly purpose: 'OPENING' | 'REQUEST' | 'REPLACEMENT' | 'STOCK';
  readonly keyBinding?: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED' | null;
  readonly actualMinor: bigint;
  readonly licenseCount: number;
  readonly beneficiaryCount: number;
  readonly unitPriceMinor: bigint;
  readonly preInvoiceChargedCount: number;
  readonly preInvoiceChargedSumMinor: bigint;
}

export interface LotExcessChargeInput {
  readonly grantRequestId: string;
  readonly lotRequestId: string | null;
  readonly keyCostBorneBeforeGrant: boolean;
  readonly licenseCount: number;
  readonly effectiveBeneficiaryCount: number;
  readonly unitPriceMinor: bigint;
  readonly invoiceActualMinor: bigint | null;
  readonly alreadyChargedCount: number;
  readonly alreadyChargedSumMinor: bigint;
  readonly costCenterAllocatedMinor: bigint | null;
}

export interface LotExcessChargePlan {
  readonly kind: 'OWN_REQUEST' | 'ALREADY_BORNE' | 'EXCESS_LICENSE';
  readonly chargeMinor: bigint;
  readonly markCostBorne: boolean;
  readonly releaseCommitmentAll: boolean;
}

export interface LotIdleRatioEntry {
  readonly licenseCount: number;
  readonly beneficiaryCount: number;
  readonly chargedPreOrSameMonthCount: number;
  readonly unitPriceMinor: bigint;
}

export interface LotIdleRatioStats {
  readonly idlePreTaxMinor: bigint;
  readonly totalPreTaxMinor: bigint;
  readonly ratioPercent: string;
  readonly exceedsThreshold: boolean;
}

export interface LotWithdrawalPlan {
  readonly unitCostActualMinor: bigint;
  readonly costCenterAdjustmentMinor: bigint;
  readonly poolIdleAdjustmentMinor: bigint;
  readonly commitmentAction: 'RELEASE_HELD' | 'SKIP_EXPENSED_D16' | 'NONE';
}

/** Per-license actual cost rounded half away from zero: `roundHalfAway(A / n)`. */
export function lotUnitCostActualMinor(actualMinor: bigint, licenseCount: number): bigint {
  return roundHalfAway(actualMinor, BigInt(licenseCount));
}

/** Plans how Finance's confirmation of a lot invoice allocates `actualMinor` across `COST_CENTER` and shared-pool buckets. */
export function planLotInvoiceConfirmation(input: LotInvoiceConfirmationInput): LotInvoiceConfirmationPlan {
  if (input.purpose === 'OPENING') return { kind: 'OPENING' };

  const unitCostActualMinor = lotUnitCostActualMinor(input.actualMinor, input.licenseCount);
  const taxVariancePerLicenseMinor = unitCostActualMinor - input.unitPriceMinor;

  if (input.purpose === 'STOCK' || input.purpose === 'REPLACEMENT') {
    const bucket =
      input.purpose === 'REPLACEMENT'
        ? 'POOL_REPLACEMENT'
        : input.keyBinding === 'ACCOUNT'
          ? 'POOL_IDLE'
          : 'POOL_DEVICE_LOT';

    return {
      kind: 'POOL_BUCKET',
      bucket,
      amountMinor: input.actualMinor,
      unitCostActualMinor,
      taxVariancePerLicenseMinor,
    };
  }

  const fullConsumption = input.beneficiaryCount >= input.licenseCount;
  const costCenterMinor = fullConsumption ? input.actualMinor : unitCostActualMinor * BigInt(input.beneficiaryCount);
  const restMinor = input.actualMinor - costCenterMinor - input.preInvoiceChargedSumMinor;
  const remainingExcess = input.licenseCount - input.beneficiaryCount - input.preInvoiceChargedCount;

  const poolAllocation: LotInvoiceAllocationPlan | null =
    remainingExcess > 0
      ? { bucket: 'POOL_IDLE', kind: 'ORIGINAL', amountMinor: restMinor }
      : restMinor !== 0n
        ? { bucket: 'POOL_LOT_DIFFERENCE', kind: 'LOT_DIFFERENCE', amountMinor: restMinor }
        : null;

  return {
    kind: 'REQUEST',
    unitCostActualMinor,
    taxVariancePerLicenseMinor,
    costCenterMinor,
    poolAllocation,
  };
}

/**
 * Plans the charge and commitment settlement when granting a key of lot `L` for request `R` (`fromPool`).
 * Keeps own-request grants held until invoice confirmation (`F10`), skips already-borne keys, and pushes
 * any rounding or pre-invoice tax difference onto the final excess license (`K-A9`, `F13b`).
 */
export function planLotExcessCharge(input: LotExcessChargeInput): LotExcessChargePlan {
  if (input.lotRequestId !== null && input.grantRequestId === input.lotRequestId) {
    return { kind: 'OWN_REQUEST', chargeMinor: 0n, markCostBorne: true, releaseCommitmentAll: false };
  }
  if (input.keyCostBorneBeforeGrant) {
    return { kind: 'ALREADY_BORNE', chargeMinor: 0n, markCostBorne: false, releaseCommitmentAll: true };
  }

  const rawCharge = computeExcessCharge(input);
  return {
    kind: 'EXCESS_LICENSE',
    chargeMinor: rawCharge > 0n ? rawCharge : 0n,
    markCostBorne: true,
    releaseCommitmentAll: false,
  };
}

function computeExcessCharge(input: LotExcessChargeInput): bigint {
  if (input.invoiceActualMinor === null) return input.unitPriceMinor;

  const unitActual = lotUnitCostActualMinor(input.invoiceActualMinor, input.licenseCount);
  const isLastExcess = input.alreadyChargedCount >= input.licenseCount - input.effectiveBeneficiaryCount - 1;
  if (!isLastExcess) return unitActual;

  const defaultCc =
    input.effectiveBeneficiaryCount >= input.licenseCount
      ? input.invoiceActualMinor
      : unitActual * BigInt(input.effectiveBeneficiaryCount);
  const ccAllocated = input.costCenterAllocatedMinor ?? defaultCc;

  return input.invoiceActualMinor - ccAllocated - input.alreadyChargedSumMinor;
}

/** Computes the pre-tax idle cost ratio and 10% threshold status across one or more `REQUEST` lots (`K-A8`, `F14b`). */
export function lotIdleRatioStats(lots: readonly LotIdleRatioEntry[]): LotIdleRatioStats {
  let idlePreTaxMinor = 0n;
  let totalPreTaxMinor = 0n;
  for (const lot of lots) {
    const unchargedExcess = Math.max(0, lot.licenseCount - lot.beneficiaryCount - lot.chargedPreOrSameMonthCount);
    idlePreTaxMinor += BigInt(unchargedExcess) * lot.unitPriceMinor;
    totalPreTaxMinor += BigInt(lot.licenseCount) * lot.unitPriceMinor;
  }
  if (totalPreTaxMinor <= 0n) {
    return { idlePreTaxMinor: 0n, totalPreTaxMinor: 0n, ratioPercent: '0.0', exceedsThreshold: false };
  }

  const tenths = roundHalfAway(idlePreTaxMinor * 1000n, totalPreTaxMinor);
  return {
    idlePreTaxMinor,
    totalPreTaxMinor,
    ratioPercent: `${tenths / 10n}.${tenths % 10n}`,
    exceedsThreshold: idlePreTaxMinor * 10n > totalPreTaxMinor,
  };
}

/** Plans compensating `WITHDRAWAL` allocation lines and commitment action when a group beneficiary withdraws after lot invoice confirmation (`F13c`). */
export function planLotWithdrawalAfterInvoice(input: {
  readonly invoiceActualMinor: bigint;
  readonly licenseCount: number;
  readonly commitmentState: 'HELD' | 'EXPENSED' | 'RELEASED' | null;
}): LotWithdrawalPlan {
  const unitCostActualMinor = lotUnitCostActualMinor(input.invoiceActualMinor, input.licenseCount);
  const commitmentAction: LotWithdrawalPlan['commitmentAction'] =
    input.commitmentState === 'HELD'
      ? 'RELEASE_HELD'
      : input.commitmentState === 'EXPENSED'
        ? 'SKIP_EXPENSED_D16'
        : 'NONE';

  return {
    unitCostActualMinor,
    costCenterAdjustmentMinor: -unitCostActualMinor,
    poolIdleAdjustmentMinor: unitCostActualMinor,
    commitmentAction,
  };
}
