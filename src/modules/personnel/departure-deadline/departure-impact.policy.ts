import type { CommitmentToRelease, RightToRevoke } from './departure-impact.types';

/** K1, K2, K4 (the key goes back to the store) and K5 have a revocation; K3 does not, so a task cannot be made for it. */
export const isRevocableType = (provisioningType: string): boolean =>
  provisioningType === 'K1' || provisioningType === 'K2' || provisioningType === 'K4' || provisioningType === 'K5';

/** What the system gives back to the budget: what is held of the requests it closes, added by currency, in the order of the code. */
export function commitmentToRelease(
  held: readonly { requestId: string; currency: string; heldMinor: bigint }[],
): CommitmentToRelease[] {
  const totals = new Map<string, bigint>();
  for (const item of held) {
    if (item.heldMinor <= 0n) continue;
    totals.set(item.currency, (totals.get(item.currency) ?? 0n) + item.heldMinor);
  }

  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currency, amount]) => ({ currency, amountMinor: amount.toString() }));
}

/** What the departure needs to know of a personal seat (a subset of what the licensing facade gives). */
export interface SeatFacts {
  assignmentId: string;
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  provisioningType: string;
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
  /** The revocation under way for the seat, if a task already works on it. */
  revocation: { taskId: string; status: string; source: string } | null;
}

/** A seat as the departure would take it away: what it is, how it is removed, and whether a task already works on it. */
export function rightToRevokeOf(seat: SeatFacts): RightToRevoke {
  return {
    assignmentId: seat.assignmentId,
    application: { id: seat.applicationId, name: seat.applicationName },
    plan: { id: seat.planId, name: seat.planName },
    provisioningType: seat.provisioningType,
    revocable: isRevocableType(seat.provisioningType),
    dataLossOnRemoval: seat.dataLossOnRemoval,
    revocationNote: seat.revocationNote,
    revocationUnderWay: seat.revocation !== null,
  };
}
