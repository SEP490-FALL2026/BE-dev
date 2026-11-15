import type { AdjustmentShape, AdjustmentVerdict, CostCenterPosition, ShapeRefusal } from './budget-adjustment.types';

/**
 * The rules of an adjustment of the budget in the year (`QĐ-111ag`, `QĐ-111bh`; R-36, R-40, C-1), as pure functions of figures in dong. An adjustment adds to or
 * takes from the base of a Cost Center and leaves its reserve as it is; the Cost Centers together never hold more than the annual ceiling less the reserve of the
 * shared pool, and a Cost Center is never taken below what it will spend.
 */

/** Whether the four kinds are made as they are meant: which Cost Center each one names, and that only a transfer has a reason and every amount is above nothing. */
export function shapeRefusalOf(shape: AdjustmentShape): ShapeRefusal | null {
  if (shape.amountMinor <= 0n) return 'AMOUNT_NOT_POSITIVE';
  const gives = shape.kind === 'TRANSFER' || shape.kind === 'RETURN';
  const receives = shape.kind === 'TRANSFER' || shape.kind === 'SUPPLEMENT';

  return (
    sideRefusal(gives, shape.fromCostCenterId, 'FROM_REQUIRED', 'FROM_NOT_ALLOWED') ??
    sideRefusal(receives, shape.toCostCenterId, 'TO_REQUIRED', 'TO_NOT_ALLOWED') ??
    (shape.fromCostCenterId !== null && shape.fromCostCenterId === shape.toCostCenterId ? 'SAME_COST_CENTER' : null) ??
    (shape.transferReason !== null && shape.kind !== 'TRANSFER' ? 'TRANSFER_REASON_NOT_ALLOWED' : null)
  );
}

/** A side of the adjustment (the Cost Center that gives, or the one that receives) is named exactly when the kind has that side. */
function sideRefusal(
  has: boolean,
  costCenterId: string | null,
  required: ShapeRefusal,
  notAllowed: ShapeRefusal,
): ShapeRefusal | null {
  if (has) return costCenterId === null ? required : null;

  return costCenterId === null ? null : notAllowed;
}

/**
 * What of the annual ceiling is not allocated (`R-36`): the ceiling less the reserve of the shared pool less the effective budget (base and reserve) of every Cost
 * Center. Never below nothing, so a ceiling that was set under what is allocated reads as nothing left.
 */
export function unallocatedOf(input: {
  annualCeilingMinor: bigint;
  sharedPoolReserveMinor: bigint | null;
  allocatedMinor: bigint;
}): bigint {
  const left = input.annualCeilingMinor - (input.sharedPoolReserveMinor ?? 0n) - input.allocatedMinor;

  return left > 0n ? left : 0n;
}

/**
 * Whether the adjustment may be made on the figures of now. A supplement and a reduction of the ceiling come out of what is not allocated. A return and the
 * source of a transfer must leave the Cost Center with an effective budget, its base after the adjustment and its reserve, not below its forecast of the end of
 * the year (`R-40`: the forecast already holds what was spent, so spent is never added to it again); a transfer made because the department changed its Cost
 * Center (`COST_CENTER_CHANGE`) has no such floor. No Cost Center gives more than its base, and a Cost Center with no budget gives nothing.
 */
export function judgeAdjustment(input: {
  shape: AdjustmentShape;
  unallocatedMinor: bigint;
  /** The Cost Center that gives, with its figures now; null when it has no budget of the year. */
  from: CostCenterPosition | null;
}): AdjustmentVerdict {
  const { shape } = input;
  if (shape.kind === 'SUPPLEMENT' || shape.kind === 'CEILING_REDUCTION') {
    return shape.amountMinor > input.unallocatedMinor
      ? {
          kind: 'OVER_UNALLOCATED',
          availableMinor: input.unallocatedMinor,
          overByMinor: shape.amountMinor - input.unallocatedMinor,
        }
      : { kind: 'OK' };
  }
  const costCenterId = shape.fromCostCenterId as string;
  if (input.from === null) return { kind: 'NO_BUDGET', costCenterId };
  if (shape.amountMinor > input.from.baseMinor) {
    return { kind: 'OVER_BASE', costCenterId, baseMinor: input.from.baseMinor };
  }
  if (shape.kind === 'TRANSFER' && shape.transferReason === 'COST_CENTER_CHANGE') return { kind: 'OK' };
  const afterMinor = input.from.baseMinor - shape.amountMinor + input.from.reserveMinor;

  return afterMinor < input.from.forecastMinor
    ? { kind: 'BELOW_FORECAST_FLOOR', costCenterId, floorMinor: input.from.forecastMinor, afterMinor }
    : { kind: 'OK' };
}
