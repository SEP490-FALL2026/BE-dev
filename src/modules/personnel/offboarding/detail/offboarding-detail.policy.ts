import { blockersOf, checklistOf, type Checklist } from '../offboarding.policy';
import type { OffboardingRecord } from '../offboarding.types';

/**
 * What the detail of a departure is read against (`US-03-04` AC-7, AC-20, `QĐ-62i`), as a pure assembly of what was read: the rights the
 * person still holds, those whose access runs on to the end of the paid period, the four steps of the checklist for a case that is not
 * cancelled, and what keeps the case open (`QĐ-110e`).
 */
export interface DepartureDetailReads {
  /** The case is not cancelled: only then are the rights, the steps and what keeps it open read at all. */
  live: boolean;
  seats: readonly { assignmentId: string; revocation: { status: string } | null }[];
  /**
   * How many of the personal seats have no task of revocation completed (`QĐ-110c`): the one count the list of departures and the pass that
   * tells the late ones use (`LicensingApi.countPersonalSeatsWithoutCompletedTaskOf`), so the three never disagree. It is not derived from
   * `seats`: the listing shows one task for a seat, which may not be the completed one.
   */
  withoutCompletedTask: number;
  /** The seats whose renewal is cancelled but whose access runs on to the end of the paid period. */
  terminating: ReadonlySet<string>;
  /** The seats this case asked to have revoked. */
  opened: readonly string[];
}

export function departureDetailFacts(
  record: Pick<OffboardingRecord, 'accessBlockMode' | 'state' | 'accountLockAt' | 'mailboxLockAt' | 'closedAt'>,
  reads: DepartureDetailReads,
): {
  heldRights: number;
  rightsWithoutCompletedTask: number;
  accessRunsOn: number;
  checklist: Checklist | null;
  blockers: Record<string, number>;
} {
  const { seats } = reads;
  const held = new Set(seats.map((seat) => seat.assignmentId));
  const accessRunsOn = seats.filter((seat) => reads.terminating.has(seat.assignmentId)).length;
  const lockRecorded = record.accountLockAt !== null;

  return {
    heldRights: seats.length,
    rightsWithoutCompletedTask: reads.withoutCompletedTask,
    accessRunsOn,
    checklist: reads.live
      ? checklistOf({
          blockNow: record.accessBlockMode === 'BLOCK_NOW',
          lockRecorded,
          heldRights: seats.length,
          withoutTask: seats.filter((seat) => seat.revocation === null).length,
          accessRunsOn,
          opened: reads.opened.length,
          released: reads.opened.filter((assignmentId) => !held.has(assignmentId)).length,
        })
      : null,
    blockers: blockersOf({
      state: record.state,
      closed: record.closedAt !== null,
      lockRecorded,
      mailboxLocked: record.mailboxLockAt !== null,
      openRights: reads.withoutCompletedTask,
    }),
  };
}
