import type { DeviceSessionState } from '../../public/devices.types';

/** How far back a collector may send data: the day it is allowed to look at is never earlier than six months ago. */
const LOOK_BACK_MONTHS = 6;

export interface SessionFacts {
  acknowledgedFrom: Date | null;
  collectionStoppedAt: Date | null;
}

export interface SessionWindow {
  state: DeviceSessionState;
  /** Data from this instant on may be sent; null when nothing may be (`state` is not `ACTIVE`). */
  acceptFromAt: Date | null;
  /** Data after this instant may not be sent: the collection was stopped then; null while it runs or waits. */
  acceptUntilAt: Date | null;
}

/**
 * The state of collection of a machine and the window of data the server accepts from it (`US-09-05` AC-14): one definition for
 * the session a tool reads and the context the intake decides on, so the two can never disagree. Collection is on only after the
 * holder acknowledged, from that instant and no earlier than six months back; a stopped collection accepts nothing newer than
 * the stop.
 */
export function sessionWindowOf(facts: SessionFacts, now: Date): SessionWindow {
  if (facts.collectionStoppedAt) {
    return { state: 'COLLECTION_STOPPED', acceptFromAt: null, acceptUntilAt: facts.collectionStoppedAt };
  }
  if (!facts.acknowledgedFrom) return { state: 'AWAITING_ACKNOWLEDGEMENT', acceptFromAt: null, acceptUntilAt: null };

  const floor = new Date(now);
  floor.setUTCMonth(floor.getUTCMonth() - LOOK_BACK_MONTHS);
  const from = facts.acknowledgedFrom > floor ? facts.acknowledgedFrom : floor;

  return { state: 'ACTIVE', acceptFromAt: from, acceptUntilAt: null };
}
