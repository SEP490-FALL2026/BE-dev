import { roundHalfAway } from '../../../core/seat-month-cost';
import type { GrantOutcome, GrantOutcomeFacts, ProvisioningKind } from '../../licensing/public/licensing.types';

/**
 * Whether the completed grant of a request gives back all the money still held for it (`FR-5.8`(2), `QĐ-106d`, `BR-MF1-09`): a K4 key
 * taken from a free key of the pool costs nothing, so the commitment of the purchase price the request held is released in full, every year
 * of it, when the task is completed; what already became an expense stays. A K4 grant that bought a key keeps its commitment until the
 * invoice, and a grant of another kind is not judged here (its release follows the days of the seat). Kept apart from the release of a
 * revocation so each rule has one home.
 */
export function releasesAllOnPoolGrant(outcome: GrantOutcome, facts: GrantOutcomeFacts | undefined): boolean {
  return outcome === 'COMPLETED' && facts !== undefined && facts.fromPool && facts.provisioningType === 'K4';
}

export interface PoolAvoidedCostInput {
  provisioningType: ProvisioningKind;
  /** First-year (approval) commitment held for this request, when K2. */
  yearCommitment: { amountMinor: bigint; currency: string } | null;
  /** Number of seats covered by the K2 commitment (1 for individual; committed headcount for group). */
  commitmentSeatCount: number;
  /** Priced total amount on the access request (used for K4 pool grants). */
  requestAmount: { amountMinor: bigint; currency: string } | null;
  /** Number of beneficiaries on the request. */
  beneficiaryCount: number;
}

/**
 * Per-person avoided cost of a grant completed from the shared pool (`W3-09`, `B1-R8`, `Q-G`):
 * - `K2`: `roundHalfAway(yearCommitmentAmount ÷ commitmentSeatCount)` (not prorated by elapsed days).
 * - `K4`: `roundHalfAway(requestAmount ÷ beneficiaryCount)` (retained even after commitment release).
 * Returns null when the source figure is absent/non-positive or the kind is not `K2`/`K4`.
 */
export function avoidedCostForPoolGrant(input: PoolAvoidedCostInput): { amountMinor: bigint; currency: string } | null {
  if (input.provisioningType === 'K2') {
    const base = input.yearCommitment;
    if (!base || base.amountMinor <= 0n || input.commitmentSeatCount <= 0) return null;
    const amountMinor = roundHalfAway(base.amountMinor, BigInt(input.commitmentSeatCount));

    return amountMinor > 0n ? { amountMinor, currency: base.currency } : null;
  }
  if (input.provisioningType === 'K4') {
    const base = input.requestAmount;
    if (!base || base.amountMinor <= 0n || input.beneficiaryCount <= 0) return null;
    const amountMinor = roundHalfAway(base.amountMinor, BigInt(input.beneficiaryCount));

    return amountMinor > 0n ? { amountMinor, currency: base.currency } : null;
  }

  return null;
}
