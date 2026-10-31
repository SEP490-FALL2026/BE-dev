import { blockersOf, checklistOf, type Checklist } from '../offboarding.policy';
import type { OffboardingRecord } from '../offboarding.types';

/**
 * What the detail of a departure is read against (`US-03-04` AC-7, AC-20, `QĐ-62i`), as a pure assembly of what was read: the rights the
 * person still holds, those whose access runs on to the end of the paid period, the four steps of the checklist for a case that is not
 * cancelled, and what keeps the case open.
 */
export interface DepartureDetailReads {
  /** The case is not cancelled: only then are the rights, the steps and what keeps it open read at all. */
  live: boolean;
  seats: readonly { assignmentId: string; revocation: unknown }[];
  /** The seats whose renewal is cancelled but whose access runs on to the end of the paid period. */
  terminating: ReadonlySet<string>;
  duties: readonly { status: string; flaggedUnconfirmed: boolean }[];
  /** The seats this case asked to have revoked. */
  opened: readonly string[];
  /** What the flows that come after the record registered, each with how many things it still waits on. */
  registered: Readonly<Record<string, number>>;
}

export function departureDetailFacts(
  record: Pick<OffboardingRecord, 'abrupt' | 'state' | 'accountLockAt' | 'closedAt'>,
  reads: DepartureDetailReads,
): { heldRights: number; accessRunsOn: number; checklist: Checklist | null; blockers: Record<string, number> } {
  const { seats } = reads;
  const held = new Set(seats.map((seat) => seat.assignmentId));
  const accessRunsOn = seats.filter((seat) => reads.terminating.has(seat.assignmentId)).length;
  const lockRecorded = record.accountLockAt !== null;

  return {
    heldRights: seats.length,
    accessRunsOn,
    checklist: reads.live
      ? checklistOf({
          abrupt: record.abrupt,
          lockRecorded,
          pendingDuties: reads.duties.filter((duty) => duty.status === 'OPEN' && !duty.flaggedUnconfirmed).length,
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
      openRights: seats.length - accessRunsOn,
      accessRunsOn,
      registered: reads.registered,
    }),
  };
}
