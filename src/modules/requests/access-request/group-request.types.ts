/** The shapes of a request for a group of people that more than one file of the capability reads (`US-05-17`). */

/** What became of one person of a request for a group; the database allows only the moves the policies make. */
export const LINE_STATES = [
  'AWAITING_NEED',
  'NEED_CONFIRMED',
  'NEED_REJECTED',
  'SPEND_REJECTED',
  'APPROVED',
  'EXECUTING',
  'AWAITING_IT_CLOSE',
  'COMPLETED',
  'FAILED',
  'WITHDRAWN',
  'DROPPED',
  'CANCELLED',
] as const;

export type LineState = (typeof LINE_STATES)[number];

export type LineStage = 'NEED' | 'SPEND';

/**
 * Why a line was cancelled: the cause of a request cancelled by the IT Admin, which the line shares: the person left, or was
 * transferred to another department while the part not yet granted was still open (`QĐ-90b`).
 */
export type LineCancelCause = 'BENEFICIARY_LEFT' | 'BENEFICIARY_TRANSFERRED';

/** What a row can carry as the cause of such a closing: the same two causes, written and read. */
export type ReadableCancelCause = LineCancelCause;

/** The states in which a line has ended: nothing happens to it again. */
export const ENDED_LINE_STATES: readonly LineState[] = [
  'NEED_REJECTED',
  'SPEND_REJECTED',
  'COMPLETED',
  'FAILED',
  'WITHDRAWN',
  'DROPPED',
  'CANCELLED',
];

export const isEnded = (state: LineState): boolean => ENDED_LINE_STATES.includes(state);

/** One person of a request as the services read them. */
export interface LineRecord {
  requestId: string;
  employeeId: string;
  /** Their place in the request: the order they were named in, which the shares of a commitment follow. */
  position: number;
  state: LineState;
  needStepId: string;
  expectedEndDate: string | null;
  endedAt: Date | null;
  endedByEmployeeId: string | null;
  endReason: string | null;
  /** Why the IT Admin closed the line, when its state is `CANCELLED`; null for every other state. */
  cancelCause: ReadableCancelCause | null;
  withdrawalRequestedAt: Date | null;
}

/** The share of a person in the commitment of one year. */
export interface LineAmountRecord {
  employeeId: string;
  budgetYear: number;
  amountMinor: bigint;
  currency: string;
  releasedAt: Date | null;
}

/** The lines that are the people the request is priced for: everyone not refused, withdrawn or left out of the file. */
export const PRICED_LINE_STATES: readonly LineState[] = [
  'AWAITING_NEED',
  'NEED_CONFIRMED',
  'APPROVED',
  'EXECUTING',
  'AWAITING_IT_CLOSE',
  'COMPLETED',
  'FAILED',
];

export const pricedPeople = (lines: readonly LineState[]): number =>
  lines.filter((state) => PRICED_LINE_STATES.includes(state)).length;
