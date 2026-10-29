import { isEnded, type LineState } from '../group-request/group-request.types';

/**
 * Whether the IT Admin may remove one person who left from a request for a group, and which person a whole-request closing means, as
 * pure decisions (`US-03-04` AC-25, `US-05-17`). The line of the person ends as cancelled and the request goes on for the people who
 * remain; the request itself ends only when no line is left, which is the one place `group-resolution.service.ts` decides.
 */

/** Why the line is not closed; the order is the order a caller should learn it. */
export type LineClosureRefusal =
  /** The line has an end of its own (refused, left out, withdrawn, cancelled, granted or failed): nothing is left to close. */
  | 'ALREADY_ENDED'
  /** The requester withdrew the person while the grant had failed, and the IT Admin closes that task first: that has its own way. */
  | 'WITHDRAWAL_PENDING'
  /** The person still works, handing over included: the line is only listed until they have left. */
  | 'BENEFICIARY_NOT_LEFT'
  /** The line is closed because its person was transferred, and they were not: they still sit where the request was sent from, or left (F29). */
  | 'BENEFICIARY_NOT_TRANSFERRED';

export interface LineClosureFacts {
  lineState: LineState;
  /** Whether the person has left (`TERMINATED`); a person who is handing over has not. */
  beneficiaryLeft: boolean;
}

/** The first reason the line is not closed because its person left, or null when it is. */
export function checkLineClosure(facts: LineClosureFacts): LineClosureRefusal | null {
  if (isEnded(facts.lineState)) return 'ALREADY_ENDED';
  if (facts.lineState === 'AWAITING_IT_CLOSE') return 'WITHDRAWAL_PENDING';
  if (!facts.beneficiaryLeft) return 'BENEFICIARY_NOT_LEFT';

  return null;
}

export interface LineTransferClosureFacts {
  lineState: LineState;
  /** Whether the person still works and sits in a department other than the one the request was sent from (a paid request keeps it). */
  beneficiaryTransferred: boolean;
}

/** The first reason the line is not closed because its person was transferred, or null when it is (F29); the same order as above. */
export function checkLineTransferClosure(facts: LineTransferClosureFacts): LineClosureRefusal | null {
  if (isEnded(facts.lineState)) return 'ALREADY_ENDED';
  if (facts.lineState === 'AWAITING_IT_CLOSE') return 'WITHDRAWAL_PENDING';
  if (!facts.beneficiaryTransferred) return 'BENEFICIARY_NOT_TRANSFERRED';

  return null;
}

/**
 * The person whose line is the only one still live, or null when none or more than one is. Closing a request for a group because
 * somebody left is the removal of that person's line when theirs is the last: with two or more people live, the IT Admin removes
 * each one who left by name.
 */
export function soleLiveLine(lines: readonly { employeeId: string; state: LineState }[]): string | null {
  const live = lines.filter((line) => !isEnded(line.state));

  return live.length === 1 ? live[0].employeeId : null;
}
