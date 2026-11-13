import type { BusinessDate } from '../../../core/business-date';
import { isRevocableType } from '../departure-deadline/departure-impact.policy';
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
 * The personal rights the system takes back when the grace ends (`QĐ-110p`, C.1): the ones held from the day the transfer took effect or before
 * (the ones begun later are the new department's), that are still in force (a right with an end is revoked already or ends by itself) and that a
 * task can take away (K3 has no revocation: nothing could close the transfer if it waited for one). A right the person asked for again on the same
 * subscription in the grace was ended by the grant (R-49) and is not listed.
 */
export function rightsToTakeBack<
  T extends { effectiveFrom: BusinessDate; validUntil: BusinessDate | null; provisioningType: string },
>(seats: readonly T[], effectiveOn: BusinessDate): T[] {
  return seats.filter(
    (seat) => seat.effectiveFrom <= effectiveOn && seat.validUntil === null && isRevocableType(seat.provisioningType),
  );
}
