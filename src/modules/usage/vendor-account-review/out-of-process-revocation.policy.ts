import type { BusinessDate } from '../../../core/business-date';
import { nthWorkingDayFrom, type NonWorkingDates } from '../../../core/working-days';
import type { OutOfProcessState } from './vendor-account-review.types';

/** The working days a case waits for the new Request of the person to reach the step of the spending approver (`US-13-05` AC-23). */
export const REVOCATION_WAIT_WORKING_DAYS = 10;

/**
 * Where the Request to grant the software, which the person sent themselves, stands on its way (`US-13-05` AC-23): before the step of the spending
 * approver (the head, the IT Admin's assessment or the person's own revision still to come), at that step (to be submitted or to be decided), or
 * approved (to be carried out, being carried out or done). A Request that was rejected, withdrawn or failed is none of these: the case reads no Request.
 */
export interface WaitedRequest {
  id: string;
  stage: 'BEFORE_SPEND' | 'AT_SPEND' | 'APPROVED';
  /** The day it reached the step of the spending approver; null before it, or when it was not recorded. */
  reachedSpendOn: BusinessDate | null;
}

export interface RevocationFacts {
  state: OutOfProcessState;
  /** Concluded on a company asset (`QĐ-103y`(3)); null for a case opened before the question was asked. */
  companyAsset: boolean | null;
  /** The day the case was concluded as outside the process, the first of the working days of the wait; null for a case older than that. */
  concludedOn: BusinessDate | null;
  today: BusinessDate;
  nonWorkingDates: NonWorkingDates;
  /** The open or approved Request of the person for the same software; null when there is none. */
  request: WaitedRequest | null;
}

/**
 * What a case asks of the IT Admin by way of revocation, worked out when it is read and kept nowhere (`US-13-05` AC-20, AC-23, AC-24, `QĐ-104j`,
 * `QĐ-104k`(2)). Only an open case on a company asset asks for one. With no Request of the person it is due at once; with one that has not reached the
 * step of the spending approver it is due once the tenth working day after the conclusion has passed (the day of the conclusion is the first when it is
 * a working day), the Request going on its way; with one at that step it waits for the decision, however long, unless the Request reached the step only
 * after the ceiling; with one that was approved the grant goes by the task of that Request and nothing is asked. A Request that ended unsuccessfully is
 * no Request: the revocation is due.
 */
export interface Revocation {
  required: boolean;
  /** The Request still on its way that the case waits for or that goes on after the ceiling; null when there is none. */
  waitingRequestId: string | null;
  /** The last day of the ceiling, while it counts: with a Request that has not reached the spend step, or that reached it after the ceiling. */
  waitUntil: BusinessDate | null;
  /** The IT Admin has the revocation to do now. */
  due: boolean;
}

const NOT_REQUIRED: Revocation = { required: false, waitingRequestId: null, waitUntil: null, due: false };

export function revocationOf(facts: RevocationFacts): Revocation {
  if (facts.state !== 'OPEN' || facts.companyAsset !== true || facts.concludedOn === null) return NOT_REQUIRED;
  const { request } = facts;
  if (request === null) return { required: true, waitingRequestId: null, waitUntil: null, due: true };
  if (request.stage === 'APPROVED') return NOT_REQUIRED;
  const ceiling = nthWorkingDayFrom(facts.concludedOn, REVOCATION_WAIT_WORKING_DAYS, facts.nonWorkingDates);
  if (request.stage === 'BEFORE_SPEND') {
    return { required: true, waitingRequestId: request.id, waitUntil: ceiling, due: facts.today > ceiling };
  }
  const reachedAfterCeiling = request.reachedSpendOn !== null && request.reachedSpendOn > ceiling;

  return {
    required: true,
    waitingRequestId: request.id,
    waitUntil: reachedAfterCeiling ? ceiling : null,
    due: reachedAfterCeiling,
  };
}
