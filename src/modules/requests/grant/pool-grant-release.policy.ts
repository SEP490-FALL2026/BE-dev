import type { GrantOutcome, GrantOutcomeFacts } from '../../licensing/public/licensing.types';

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
