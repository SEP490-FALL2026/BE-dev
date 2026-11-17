import { slaDueAt, type NonWorkingDates } from '../../../core/working-days';

/**
 * How long the IT Admin has to stop the collection a holder asked to stop, in working days (`US-09-04` AC-5). A constant on purpose:
 * `US-09-04` says "configurable", but `FR-8.2` (the source above the story) does not list this among the operating parameters.
 */
export const STOP_REQUEST_WORKING_DAYS = 2;

export type StopRequestState = 'OPEN' | 'COMPLETED' | 'INVALID';

/** The reasons the system itself gives for a request that is not valid; the IT Admin has no way to close a valid one (`AC-6`). */
export type StopRequestInvalidReason = 'DUPLICATE' | 'ALREADY_STOPPED' | 'REGISTRATION_ENDED';

export interface StopRequestFacts {
  registrationEnded: boolean;
  /** `collection_stopped_at` of the registration is set. */
  collectionStopped: boolean;
  /** Another request of the registration is open. */
  openRequestExists: boolean;
}

/**
 * Why a request is not valid, or null when it is (`US-09-04` AC-1, AC-10), in the order the facts are decided: a registration that
 * ended, then a collection stopped already, then one request waiting. A registration not yet acknowledged is valid: the only
 * condition is that the registration is in force.
 */
export function stopRequestVerdict(facts: StopRequestFacts): StopRequestInvalidReason | null {
  if (facts.registrationEnded) return 'REGISTRATION_ENDED';
  if (facts.collectionStopped) return 'ALREADY_STOPPED';
  if (facts.openRequestExists) return 'DUPLICATE';

  return null;
}

/** When a request received at `receivedAt` is due: the same wall clock, `STOP_REQUEST_WORKING_DAYS` working days later (`AC-5`). */
export function stopRequestDueAt(receivedAt: Date, nonWorkingDates: NonWorkingDates, timeZone: string): Date {
  return slaDueAt(receivedAt, STOP_REQUEST_WORKING_DAYS, nonWorkingDates, timeZone);
}

/** Only a request still waiting can be late. */
export function isStopRequestOverdue(state: StopRequestState, dueAt: Date | null, now: Date): boolean {
  return state === 'OPEN' && dueAt !== null && now.getTime() > dueAt.getTime();
}
