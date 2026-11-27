import type { BusinessDate } from '../../../core/business-date';
import {
  adjustmentCommitmentOf as deriveAdjustmentCommitment,
  adjustmentPointOf as deriveAdjustmentPoint,
  earliestReducibleOn as deriveEarliestReducibleOn,
  type AdjustmentInput as InternalAdjustmentInput,
  type AdjustmentPoint as InternalAdjustmentPoint,
  type AdjustmentWindows as InternalAdjustmentWindows,
} from '../subscription/obligation/subscription-obligation.policy';

export type AdjustmentInput = InternalAdjustmentInput;
export type AdjustmentPoint = InternalAdjustmentPoint;
export type AdjustmentWindows = InternalAdjustmentWindows;

/** Public wrapper returning `MONTHLY` or `ANNUAL` commitment classification for a subscription period. */
export function adjustmentCommitmentOf(input: AdjustmentInput): 'MONTHLY' | 'ANNUAL' {
  return deriveAdjustmentCommitment(input);
}

/** Public wrapper computing the adjustment point of a subscription period on `today`. */
export function adjustmentPointOf(
  input: AdjustmentInput,
  today: BusinessDate,
  windows: AdjustmentWindows,
): AdjustmentPoint | null {
  return deriveAdjustmentPoint(input, today, windows);
}

/** Public wrapper computing the earliest effective seat-reduction date for a subscription on `today`. */
export function earliestReducibleOn(input: AdjustmentInput, today: BusinessDate): BusinessDate | null {
  return deriveEarliestReducibleOn(input, today);
}
