/** The four kinds of an adjustment of the budget in the year, one record and one flow (`QĐ-111ag`, C-1). */
export type AdjustmentKind = 'SUPPLEMENT' | 'TRANSFER' | 'RETURN' | 'CEILING_REDUCTION';

export type AdjustmentState = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Why a transfer is made. A department that changed its Cost Center in the year moves what is left to the new one, and nothing holds that back (`QĐ-111bh`). */
export type TransferReason = 'COST_CENTER_CHANGE';

/** What an adjustment says, before it is judged. */
export interface AdjustmentShape {
  kind: AdjustmentKind;
  amountMinor: bigint;
  fromCostCenterId: string | null;
  toCostCenterId: string | null;
  transferReason: TransferReason | null;
}

/** Why the shape of an adjustment is not one of the four kinds. */
export type ShapeRefusal =
  | 'FROM_REQUIRED'
  | 'FROM_NOT_ALLOWED'
  | 'TO_REQUIRED'
  | 'TO_NOT_ALLOWED'
  | 'SAME_COST_CENTER'
  | 'TRANSFER_REASON_NOT_ALLOWED'
  | 'AMOUNT_NOT_POSITIVE';

/**
 * What a Cost Center that gives money stands on: its effective base and reserve, what it has used (what was spent plus what its commitments still hold, the same figure the check of a
 * Request reads) and the forecast of the end of the year of the review (`RV-1`).
 */
export interface CostCenterPosition {
  baseMinor: bigint;
  reserveMinor: bigint;
  usedMinor: bigint;
  forecastMinor: bigint;
}

export type AdjustmentVerdict =
  | { kind: 'OK' }
  | { kind: 'OVER_UNALLOCATED'; availableMinor: bigint; overByMinor: bigint }
  | { kind: 'BELOW_FORECAST_FLOOR'; costCenterId: string; floorMinor: bigint; afterMinor: bigint }
  | { kind: 'OVER_BASE'; costCenterId: string; baseMinor: bigint }
  | { kind: 'OVER_REMAINING'; costCenterId: string; remainingMinor: bigint; usedMinor: bigint }
  | { kind: 'NO_BUDGET'; costCenterId: string };
