import type { BusinessDate } from '../../../core/business-date';
import { isRevocableType } from '../departure-deadline/departure-impact.policy';
import { isOldRightOf } from './transfer-grace.policy';
import type { HeldTransfer } from './transfer-grace.types';

/** What the sweep needs to know of a transfer to decide what it owes it today. */
export interface SweptTransfer {
  status: 'PENDING' | 'EFFECTIVE' | 'CANCELLED';
  closed: boolean;
  /** The last day the person keeps the rights of the old department; null on a transfer that never opened a grace. */
  graceEndsOn: BusinessDate | null;
  graceReminderOn: BusinessDate | null;
  /** The person was told once more already (`reminded_at`). */
  reminded: boolean;
  /** The picture of the rights the day it took effect exists: the settlement of the day wrote it, with the first notice. */
  hasSnapshot: boolean;
}

/** The facts of a held transfer as the policy of the sweep reads them. */
export const sweptOf = (held: HeldTransfer): SweptTransfer => ({
  status: held.status,
  closed: held.closed,
  graceEndsOn: held.graceEndsOn,
  graceReminderOn: held.graceReminderOn,
  reminded: held.reminded,
  hasSnapshot: held.snapshotBefore !== null,
});

/** A transfer that took effect, is not closed and has a grace: the only kind the sweep acts on. */
const inForce = (transfer: SweptTransfer): transfer is SweptTransfer & { graceEndsOn: BusinessDate } =>
  transfer.status === 'EFFECTIVE' && !transfer.closed && transfer.graceEndsOn !== null;

/**
 * Whether the person is to be told once more that the rights of the old department are about to be taken back (`QĐ-110p`): from the day of the
 * reminder to the last day of the grace, once. A pass that missed the day tells on a later day of the grace; after the last day the
 * revocation tells instead.
 */
export function reminderDue(transfer: SweptTransfer, today: BusinessDate): boolean {
  if (!inForce(transfer) || transfer.graceReminderOn === null || transfer.reminded) return false;

  return transfer.graceReminderOn <= today && today <= transfer.graceEndsOn;
}

/** Whether the grace is over and the rights are to be taken back: the day after its last day (`QĐ-110p`), and every day after until the transfer closes. */
export function revocationDue(transfer: SweptTransfer, today: BusinessDate): boolean {
  return inForce(transfer) && today > transfer.graceEndsOn;
}

/**
 * Whether the notice of the start of the grace is still owed (m-17): a transfer that took effect before the grace existed was given its grace by the
 * migration and never told anyone on day 1. It has no picture of the rights either, which is how it is told from a transfer the settlement of the day
 * opened. Owed only while the grace lasts; after it the revocation tells the person.
 */
export function legacyAnnouncementDue(transfer: SweptTransfer, today: BusinessDate): boolean {
  return inForce(transfer) && !transfer.hasSnapshot && today <= transfer.graceEndsOn;
}

/**
 * The personal rights the system takes back when the grace ends (`QĐ-110p`, C.1): the rights of the old department (the ones the picture of the day the
 * transfer took effect names; for a transfer from before the grace, which has none, the ones begun on that day or before — `isOldRightOf`), that are still
 * in force (a right with an end is revoked already or ends by itself) and that a task can take away (K3 has no revocation: nothing could close the
 * transfer if it waited for one). A right granted after the picture, even on the day itself, is the new department's. A right the person asked for again on
 * the same subscription in the grace was ended by the grant (R-49) and is not listed.
 */
export function rightsToTakeBack<
  T extends {
    assignmentId: string;
    effectiveFrom: BusinessDate;
    validUntil: BusinessDate | null;
    provisioningType: string;
  },
>(seats: readonly T[], transfer: { effectiveOn: BusinessDate; pictureIds: readonly string[] | null }): T[] {
  return seats.filter(
    (seat) => isOldRightOf(transfer, seat) && seat.validUntil === null && isRevocableType(seat.provisioningType),
  );
}

/** The ids of the rights the picture of a held transfer names; null when it has none (a transfer from before the grace). */
export const pictureIdsOf = (held: Pick<HeldTransfer, 'snapshotBefore'>): string[] | null =>
  held.snapshotBefore?.rights.map((right) => right.assignmentId) ?? null;

/** A grant of a right asked for again (R-49) that has neither been done nor failed nor been cancelled, and the right of the person it ended. */
export interface WaitingRegrant {
  replacedAssignmentId: string;
  replacedEffectiveFrom: BusinessDate;
}

/**
 * How many grants of a right asked for again wait for the picture of a transfer (R-49): the right they ended is a right of the old department
 * (`isOldRightOf`). If one fails or is cancelled the old right is open again and the grace has to take it back, so the transfer cannot be closed yet.
 */
export function regrantsPendingOf(
  waiting: readonly WaitingRegrant[],
  transfer: { effectiveOn: BusinessDate; pictureIds: readonly string[] | null },
): number {
  return waiting.filter((grant) =>
    isOldRightOf(transfer, { assignmentId: grant.replacedAssignmentId, effectiveFrom: grant.replacedEffectiveFrom }),
  ).length;
}

/**
 * Whether the system closes the transfer (`QĐ-110r`, SPEC MF3-C.2): the grace is over and no right of the old department is left to take back —
 * every task of revocation is completed, or the person held nothing, or the rights ended another way — and no grant of a right asked for again waits
 * (a grant that fails gives its old right back, R-49). Closed at once, with no account: a transfer whose person held nothing is closed too, or the
 * person could never be moved again (`TRANSFER_SETTLING`).
 */
export function closureDue(
  transfer: SweptTransfer,
  left: { openRights: number; pendingRegrants: number },
  today: BusinessDate,
): boolean {
  return inForce(transfer) && today > transfer.graceEndsOn && left.openRights === 0 && left.pendingRegrants === 0;
}

/** Whether a departure recorded today takes the old rights over (`QĐ-110r`): while the grace lasts, the last day included; after it the revocation is open and the departure adds its reason to the tasks. */
export function supersedable(transfer: SweptTransfer, today: BusinessDate): boolean {
  return inForce(transfer) && today <= transfer.graceEndsOn;
}

/** What became of one right of the picture when the transfer closes. */
export type RightOutcome = 'REVOKED' | 'ENDED' | 'REGRANTED' | 'TAKEN_OVER';

/**
 * What became of a right of the picture of the transfer (`snapshot_after`): asked for again and granted on the same subscription (R-49), taken over by
 * a departure that was recorded in the grace (`held`: it is still the person's, and now the departure's to take back), taken back by the revocation
 * this transfer opened, or ended some other way (a return, an expiry, a revocation of a departure).
 */
export function rightOutcome(facts: { held: boolean; revoked: boolean; regranted: boolean }): RightOutcome {
  if (facts.regranted) return 'REGRANTED';
  if (facts.held) return 'TAKEN_OVER';

  return facts.revoked ? 'REVOKED' : 'ENDED';
}
