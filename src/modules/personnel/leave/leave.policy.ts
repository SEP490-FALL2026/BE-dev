import type { BusinessDate } from '../../../core/business-date';
import { groundsRefusal, type GroundsInput } from '../personnel-grounds.policy';

/**
 * What the policy of a long leave refuses, as a semantic code (`LONG_LEAVE.<code>` on the wire) and the facts a person needs to
 * put it right. The first thing that is wrong wins, in the order a person would fix it.
 */
export interface LeaveRefusal {
  code: string;
  details?: Record<string, unknown>;
}

export type WorkStateFact = 'WORKING' | 'ON_LONG_LEAVE' | 'HANDING_OVER' | 'LEFT';

/** The basis of a day: whole, and not the code of a notice (`US-03-03` AC-5, AC-8; `QĐ-77a`). */
export function leaveGroundsRefusal(grounds: GroundsInput | undefined | null): LeaveRefusal | null {
  const refused = groundsRefusal(grounds);
  if (!refused) return null;

  return { code: refused.reason, ...('missing' in refused ? { details: { missing: refused.missing } } : {}) };
}

export interface StartLeaveFacts {
  today: BusinessDate;
  startedOn: BusinessDate;
  approvedReturnOn: BusinessDate;
  hireDate: BusinessDate;
  employee: { status: 'ACTIVE' | 'TERMINATED'; workState: WorkStateFact };
  grounds: GroundsInput | undefined;
}

/**
 * Whether a long leave may begin (`US-03-03` AC-5): only a person who works, on a day that has begun and is not before they joined,
 * with a day of return after it and a whole authoritative basis. A leave is recorded once it has begun: no future start.
 */
export function startLeaveRefusal(facts: StartLeaveFacts): LeaveRefusal | null {
  const workState = facts.employee.status === 'TERMINATED' ? 'LEFT' : facts.employee.workState;
  if (workState === 'ON_LONG_LEAVE') return { code: 'ALREADY_ON_LEAVE' };
  if (workState !== 'WORKING') return { code: 'EMPLOYEE_NOT_WORKING', details: { workState } };
  if (facts.startedOn > facts.today) return { code: 'START_DATE_INVALID', details: { reason: 'IN_FUTURE' } };
  if (facts.startedOn < facts.hireDate) return { code: 'START_DATE_INVALID', details: { reason: 'BEFORE_HIRE_DATE' } };
  if (facts.approvedReturnOn <= facts.startedOn) {
    return { code: 'RETURN_DATE_INVALID', details: { reason: 'NOT_AFTER_START' } };
  }

  return leaveGroundsRefusal(facts.grounds);
}

export interface LeaveFacts {
  today: BusinessDate;
  status: 'ACTIVE' | 'ENDED';
  startedOn: BusinessDate;
  approvedReturnOn: BusinessDate;
}

export interface ChangeReturnDateFacts extends LeaveFacts {
  newApprovedReturnOn: BusinessDate;
  grounds: GroundsInput | undefined;
}

/** Whether the approved day of return may move (`US-03-03` AC-8): a new day that is not the same, not behind, with a new basis. */
export function changeReturnDateRefusal(facts: ChangeReturnDateFacts): LeaveRefusal | null {
  if (facts.status !== 'ACTIVE') return { code: 'NOT_ACTIVE' };
  if (facts.newApprovedReturnOn === facts.approvedReturnOn) {
    return { code: 'RETURN_DATE_INVALID', details: { reason: 'SAME_DAY' } };
  }
  if (facts.newApprovedReturnOn <= facts.startedOn) {
    return { code: 'RETURN_DATE_INVALID', details: { reason: 'NOT_AFTER_START' } };
  }
  if (facts.newApprovedReturnOn < facts.today) return { code: 'RETURN_DATE_IN_PAST' };

  return leaveGroundsRefusal(facts.grounds);
}

export interface ConfirmReturnFacts extends LeaveFacts {
  returnedOn: BusinessDate;
  grounds: GroundsInput | undefined;
}

/** Whether the return was on the day that was approved, which needs no new document (`US-03-03` AC-7). */
export const isOnSchedule = (returnedOn: BusinessDate, approvedReturnOn: BusinessDate): boolean =>
  returnedOn === approvedReturnOn;

/**
 * Whether the person may be recorded back (`US-03-03` AC-7, AC-8): from the day the leave began to today. On the approved day no
 * document is needed; on any other day, earlier or later, a new basis is.
 */
export function confirmReturnRefusal(facts: ConfirmReturnFacts): LeaveRefusal | null {
  if (facts.status !== 'ACTIVE') return { code: 'NOT_ACTIVE' };
  if (facts.returnedOn < facts.startedOn) return { code: 'RETURN_DATE_INVALID', details: { reason: 'BEFORE_START' } };
  if (facts.returnedOn > facts.today) return { code: 'RETURN_DATE_INVALID', details: { reason: 'IN_FUTURE' } };

  return isOnSchedule(facts.returnedOn, facts.approvedReturnOn) ? null : leaveGroundsRefusal(facts.grounds);
}

/** A leave past the day it was due back is only to be reminded about; the state of the person never moves by the calendar (`AC-4`). */
export const isReturnOverdue = (
  leave: { status: 'ACTIVE' | 'ENDED'; approvedReturnOn: BusinessDate },
  today: BusinessDate,
): boolean => leave.status === 'ACTIVE' && leave.approvedReturnOn < today;

/**
 * What becomes of a person whose handover for leaving was cancelled (`US-03-04` AC-26): back on leave when the day they were due
 * back has not come yet, working when it has.
 */
export const stateAfterCancelledDeparture = (
  endedLeave: { approvedReturnOn: BusinessDate } | null,
  today: BusinessDate,
): 'ON_LONG_LEAVE' | 'WORKING' => (endedLeave && endedLeave.approvedReturnOn > today ? 'ON_LONG_LEAVE' : 'WORKING');
