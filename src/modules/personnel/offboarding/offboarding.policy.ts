import { addDays, type BusinessDate } from '../../../core/business-date';
import { addWorkingDays, type NonWorkingDates } from '../../../core/working-days';
import { groundsRefusal, type GroundsInput } from '../personnel-grounds.policy';
import type { OffboardingState } from './offboarding.types';

/** What the policy refuses, as a semantic code (`OFFBOARDING_CASE.<code>` on the wire) and the facts a person needs to put it right. */
export interface OffboardingRefusal {
  code: string;
  details?: Record<string, unknown>;
}

/**
 * The first day the person is no longer a member of the department (and no longer its head). A planned handover ends the day after
 * the last working day; an abrupt departure is never written into the past (the day it is recorded at the earliest) and never ends
 * a placement on its first day (`US-03-04` AC-18).
 */
export function departureEffectiveOn(facts: {
  lastWorkingDay: BusinessDate;
  abrupt: boolean;
  today: BusinessDate;
  placementFrom: BusinessDate;
}): BusinessDate {
  const after = addDays(facts.lastWorkingDay, 1);
  if (!facts.abrupt) return after;
  const floors = [after, facts.today, addDays(facts.placementFrom, 1)];

  return floors.reduce((latest, day) => (day > latest ? day : latest));
}

/** The day the confirmation of the handover is due: the last working day less one working day (`OI-14c`, `US-03-04` AC-1, AC-7). */
export function handoverDueOn(lastWorkingDay: BusinessDate, nonWorkingDates: NonWorkingDates): BusinessDate {
  return addWorkingDays(lastWorkingDay, -1, nonWorkingDates);
}

export interface LastDayFacts {
  today: BusinessDate;
  hireDate: BusinessDate;
  /** The first day of the placement the person is in. */
  placementFrom: BusinessDate;
}

/** Whether `day` can be the last working day of a planned handover (`AC-2`): there is one, and it is neither before the person came nor already past. */
function plannedDayRefusal(day: BusinessDate | undefined, facts: LastDayFacts): OffboardingRefusal | null {
  if (day === undefined || day.trim() === '') return { code: 'LAST_WORKING_DAY_REQUIRED' };
  if (day < facts.hireDate) return { code: 'LAST_WORKING_DAY_INVALID', details: { reason: 'BEFORE_HIRE_DATE' } };
  if (day < facts.placementFrom)
    return {
      code: 'LAST_WORKING_DAY_INVALID',
      details: { reason: 'BEFORE_PLACEMENT_START', placementFrom: facts.placementFrom },
    };
  if (day < facts.today)
    return { code: 'LAST_WORKING_DAY_INVALID', details: { reason: 'IN_PAST', today: facts.today } };

  return null;
}

/** An abrupt departure has already happened: its last working day is today or before it. */
function abruptDayRefusal(day: BusinessDate | undefined, facts: LastDayFacts): OffboardingRefusal | null {
  if (day === undefined || day.trim() === '') return { code: 'LAST_WORKING_DAY_REQUIRED' };
  if (day < facts.hireDate) return { code: 'LAST_WORKING_DAY_INVALID', details: { reason: 'BEFORE_HIRE_DATE' } };
  if (day < facts.placementFrom)
    return {
      code: 'LAST_WORKING_DAY_INVALID',
      details: { reason: 'BEFORE_PLACEMENT_START', placementFrom: facts.placementFrom },
    };
  if (day > facts.today)
    return { code: 'LAST_WORKING_DAY_INVALID', details: { reason: 'IN_FUTURE', today: facts.today } };

  return null;
}

export interface RecordFacts extends LastDayFacts {
  lastWorkingDay: BusinessDate | undefined;
  abrupt: boolean;
  employee: { status: 'ACTIVE' | 'TERMINATED'; workState: 'WORKING' | 'ON_LONG_LEAVE' | 'HANDING_OVER' | 'LEFT' };
  grounds: GroundsInput | undefined;
  /** The transfer of the person that waits, if any. */
  pendingTransfer: { effectiveOn: BusinessDate } | null;
  /** The reason the caller gave for cancelling that transfer; undefined when none was given. */
  transferCancellationReason: string | undefined;
  /** Another waiting transfer names this person to follow the head of its department. */
  namedAsSuccessor: boolean;
  /** How the head of the department the person leaves is provided for on the day they stop being its head; null when it is fine or not needed. */
  successor: OffboardingRefusal | null;
}

/**
 * Whether a departure may be recorded (`US-03-04` AC-2, AC-8, AC-18, AC-23, AC-29, `US-03-01` AC-21), the first thing that is wrong
 * winning in the order a person would fix it: the person works for the organization and has no handover yet, the last working day,
 * the basis, the transfer that waits, and who follows the head. Who may act is the service's, not asked here.
 */
export function recordRefusal(facts: RecordFacts): OffboardingRefusal | null {
  const { employee } = facts;
  if (employee.status === 'TERMINATED' || employee.workState === 'LEFT') return { code: 'EMPLOYEE_LEFT' };
  if (employee.workState === 'HANDING_OVER') return { code: 'ALREADY_HANDING_OVER' };
  const day = facts.abrupt
    ? abruptDayRefusal(facts.lastWorkingDay, facts)
    : plannedDayRefusal(facts.lastWorkingDay, facts);
  if (day) return day;
  const grounds = groundsRefusal(facts.grounds);
  if (grounds)
    return { code: grounds.reason, details: 'missing' in grounds ? { missing: grounds.missing } : undefined };

  const transfer = pendingTransferRefusal(
    facts.pendingTransfer,
    facts.lastWorkingDay as BusinessDate,
    facts.transferCancellationReason,
  );
  if (transfer) return transfer;
  if (facts.namedAsSuccessor) return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'HEAD_HANDOVER' } };

  return facts.successor;
}

/**
 * The transfer of the person that waits: when the last working day falls before it takes effect the transfer never happens, and the
 * caller says why it is cancelled; on or after that day the transfer wins and the departure is refused.
 */
export function pendingTransferRefusal(
  pending: { effectiveOn: BusinessDate } | null,
  lastWorkingDay: BusinessDate,
  cancellationReason: string | undefined,
): OffboardingRefusal | null {
  if (!pending) return null;
  if (lastWorkingDay >= pending.effectiveOn)
    return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'TRANSFER', effectiveOn: pending.effectiveOn } };

  return (cancellationReason ?? '').trim() === '' ? { code: 'TRANSFER_CANCELLATION_REASON_REQUIRED' } : null;
}

export interface ChangeLastDayFacts extends LastDayFacts {
  state: OffboardingState;
  currentLastWorkingDay: BusinessDate;
  newLastWorkingDay: BusinessDate;
  reason: string;
  successor: OffboardingRefusal | null;
}

/** The refusal that is the same for every command that only a handover under way takes: the case is the wrong state. */
export function notHandingOverRefusal(state: OffboardingState): OffboardingRefusal | null {
  if (state === 'LEFT') return { code: 'CASE_LEFT' };
  if (state === 'CANCELLED') return { code: 'NOT_HANDING_OVER' };

  return null;
}

/**
 * Whether the last working day of a handover under way may move (`US-03-04` AC-14, AC-22, AC-29): not once today is past the old
 * one (only a cancellation or the departure itself is left), with a reason, to a day that is today or later and not before the person
 * came, and the head of the department is judged again on the new day.
 */
export function changeLastDayRefusal(facts: ChangeLastDayFacts): OffboardingRefusal | null {
  const state = notHandingOverRefusal(facts.state);
  if (state) return state;
  if (facts.today > facts.currentLastWorkingDay)
    return { code: 'LAST_DAY_ALREADY_PASSED', details: { lastWorkingDay: facts.currentLastWorkingDay } };
  if (facts.reason.trim() === '') return { code: 'REASON_REQUIRED' };
  const day = plannedDayRefusal(facts.newLastWorkingDay, facts);
  if (day) return day;
  if (facts.newLastWorkingDay === facts.currentLastWorkingDay) return { code: 'NO_CHANGE' };

  return facts.successor;
}

/** Whether a handover under way may be cancelled (`US-03-04` AC-15): a reason. */
export function cancelRefusal(facts: { state: OffboardingState; reason: string }): OffboardingRefusal | null {
  const state = notHandingOverRefusal(facts.state);
  if (state) return state;

  return facts.reason.trim() === '' ? { code: 'REASON_REQUIRED' } : null;
}

/** Whether the handover may become the departure (`US-03-04` AC-3, AC-10): any day, also after the last working day, never a day ahead. */
export function markLeftRefusal(facts: {
  state: OffboardingState;
  today: BusinessDate;
  departedOn: BusinessDate | undefined;
  recordedOn: BusinessDate;
}): OffboardingRefusal | null {
  const state = notHandingOverRefusal(facts.state);
  if (state) return state;
  const day = facts.departedOn;
  if (day !== undefined && (day > facts.today || day < facts.recordedOn))
    return { code: 'DEPARTED_ON_INVALID', details: { today: facts.today, recordedOn: facts.recordedOn } };

  return null;
}

/** Whether the lock of the account may be written (`US-03-04` AC-20, `QĐ-77i`): the person has left and it was not written yet. */
export function accountLockRefusal(facts: { state: OffboardingState; locked: boolean }): OffboardingRefusal | null {
  if (facts.state !== 'LEFT') return { code: 'CASE_NOT_LEFT' };

  return facts.locked ? { code: 'ALREADY_RECORDED' } : null;
}

/** K1, K2 and K5 have a revocation; K3 and K4 do not (yet), so a task cannot be made for them. */
export const isRevocableType = (provisioningType: string): boolean =>
  provisioningType === 'K1' || provisioningType === 'K2' || provisioningType === 'K5';

/** What a revocation of the rights is taken from: the seats the person holds, and which of them can be taken away by a task. */
export interface RightFacts {
  assignmentId: string;
  /** A task of the queue already works on it. */
  hasTask: boolean;
  /** K1, K2 and K5 have a revocation; K3 and K4 do not (yet). */
  revocable: boolean;
  provisioningType: string;
}

export interface RevocationFacts {
  state: OffboardingState;
  closed: boolean;
  reason: string;
  count: number;
  /** The seats the caller named; undefined means every right that has no task and that a task can take away. */
  named: readonly string[] | undefined;
  rights: readonly RightFacts[];
  lockRecorded: boolean;
  lockGiven: boolean;
}

/** The first right named that is not there or already has a task, or has no revocation (K3, K4), in the order named; null when all can be taken. */
export function namedRightsRefusal(named: readonly string[], rights: readonly RightFacts[]): OffboardingRefusal | null {
  const byId = new Map(rights.map((right) => [right.assignmentId, right]));
  for (const id of named) {
    const right = byId.get(id);
    if (!right || right.hasTask) return { code: 'ASSIGNMENT_NOT_AVAILABLE', details: { assignmentId: id } };
    if (!right.revocable)
      return {
        code: 'REVOCATION_NOT_SUPPORTED',
        details: { assignmentId: id, provisioningType: right.provisioningType },
      };
  }

  return null;
}

/** The rights a command selects, and the refusal when it cannot; `selected` is meaningful only without a refusal. */
export function revocationSelection(facts: RevocationFacts): {
  refusal: OffboardingRefusal | null;
  selected: string[];
} {
  const none = (refusal: OffboardingRefusal) => ({ refusal, selected: [] as string[] });
  if (facts.state !== 'LEFT') return none({ code: 'CASE_NOT_LEFT' });
  if (facts.closed) return none({ code: 'CASE_CLOSED' });
  if (facts.reason.trim() === '') return none({ code: 'REASON_REQUIRED' });

  let selected: string[];
  if (facts.named === undefined) {
    selected = facts.rights.filter((right) => !right.hasTask && right.revocable).map((right) => right.assignmentId);
  } else {
    selected = [...new Set(facts.named)];
    const named = namedRightsRefusal(selected, facts.rights);
    if (named) return none(named);
  }
  if (facts.count !== selected.length) return none({ code: 'COUNT_MISMATCH', details: { expected: selected.length } });
  if (!facts.lockRecorded && !facts.lockGiven) return none({ code: 'ACCOUNT_LOCK_NOT_RECORDED' });
  if (facts.lockRecorded && facts.lockGiven) return none({ code: 'ALREADY_RECORDED' });

  return { refusal: null, selected: selected.sort() };
}

export interface BlockerFacts {
  state: OffboardingState;
  closed: boolean;
  lockRecorded: boolean;
  /** Personal seats still held that nothing says are running on to the end of a paid period. */
  openRights: number;
  /** Seats whose renewal is cancelled and whose access runs on to the end of the paid period. */
  accessRunsOn: number;
  /** What the flows that come after register, each with how many things it still waits on. */
  registered: Readonly<Record<string, number>>;
}

/** What still keeps a departure open, by code with how many (`US-03-04` AC-20, `QĐ-62i`, `QĐ-75e`); empty when it may be closed. */
export function blockersOf(facts: BlockerFacts): Record<string, number> {
  if (facts.state !== 'LEFT' || facts.closed) return {};
  const blockers: Record<string, number> = {};
  if (!facts.lockRecorded) blockers.ACCOUNT_LOCK_NOT_RECORDED = 1;
  if (facts.openRights > 0) blockers.PERSONAL_RIGHTS_OPEN = facts.openRights;
  if (facts.accessRunsOn > 0) blockers.ACCESS_RUNS_ON = facts.accessRunsOn;
  for (const [code, count] of Object.entries(facts.registered)) if (count > 0) blockers[code] = count;

  return blockers;
}

/** Whether the case may be closed now: it is not the state, a closed one, or one with a blocker. */
export function closeRefusal(facts: BlockerFacts): OffboardingRefusal | null {
  if (facts.state !== 'LEFT') return { code: 'CASE_NOT_LEFT' };
  if (facts.closed) return { code: 'CASE_NOT_CLOSEABLE', details: { blockers: ['ALREADY_CLOSED'] } };
  const blockers = Object.keys(blockersOf(facts));

  return blockers.length > 0 ? { code: 'CASE_NOT_CLOSEABLE', details: { blockers } } : null;
}

export type StepState = 'PENDING' | 'IN_PROGRESS' | 'DONE';

export interface Checklist {
  dataHandover: { state: StepState; pendingDuties: number };
  accountLock: { state: StepState; urgent: boolean };
  revokeAccess: { state: StepState; heldRights: number; withoutTask: number; accessRunsOn: number };
  seatsReleased: { state: StepState; opened: number; released: number };
}

export interface ChecklistFacts {
  abrupt: boolean;
  lockRecorded: boolean;
  /** Duties that wait for a confirmation and that nobody has gone on without (`AC-7`). */
  pendingDuties: number;
  heldRights: number;
  withoutTask: number;
  accessRunsOn: number;
  /** The seats this case asked to have revoked, and how many of them the person no longer holds. */
  opened: number;
  released: number;
}

/**
 * The four steps of the checklist `BM-08` in the order they are done (`US-03-04` AC-20): the handover of the data of each tool, the
 * lock of the company account (urgent when nobody planned the departure, and it comes before or with the first revocation), the removal
 * of the rights (a K1 whose access runs on to the end of the paid period is not done), and the seats given back, which is written only
 * for a seat whose task completed (`QĐ-62i`).
 */
export function checklistOf(facts: ChecklistFacts): Checklist {
  const revoked = facts.heldRights - facts.withoutTask;
  const revoking: StepState =
    facts.heldRights === 0 ? 'DONE' : revoked > 0 || facts.accessRunsOn > 0 ? 'IN_PROGRESS' : 'PENDING';

  return {
    dataHandover: { state: facts.pendingDuties === 0 ? 'DONE' : 'PENDING', pendingDuties: facts.pendingDuties },
    accountLock: { state: facts.lockRecorded ? 'DONE' : 'PENDING', urgent: facts.abrupt && !facts.lockRecorded },
    revokeAccess: {
      state: revoking,
      heldRights: facts.heldRights,
      withoutTask: facts.withoutTask,
      accessRunsOn: facts.accessRunsOn,
    },
    seatsReleased: {
      state: facts.heldRights === 0 ? 'DONE' : facts.released > 0 ? 'IN_PROGRESS' : 'PENDING',
      opened: facts.opened,
      released: facts.released,
    },
  };
}

/** Whether the case is in a handover that has passed its last working day (`US-03-04` AC-10): still working, listed for the IT Admin. */
export function isPastLastDay(state: OffboardingState, lastWorkingDay: BusinessDate, today: BusinessDate): boolean {
  return state === 'HANDING_OVER' && lastWorkingDay < today;
}

/**
 * What the person is now, read before the locks: refused at once when unknown, gone, already handing over or given no last working
 * day, in that order (the first that holds is the answer). A person on long leave is judged later, by the policy of the record.
 */
export function subjectRefusal(
  seen: { status: string; workState: string } | null,
  lastWorkingDay: BusinessDate | undefined,
): 'EMPLOYEE_NOT_FOUND' | 'EMPLOYEE_LEFT' | 'ALREADY_HANDING_OVER' | 'LAST_WORKING_DAY_REQUIRED' | null {
  if (!seen) return 'EMPLOYEE_NOT_FOUND';
  if (seen.status === 'TERMINATED' || seen.workState === 'LEFT') return 'EMPLOYEE_LEFT';
  if (seen.workState === 'HANDING_OVER') return 'ALREADY_HANDING_OVER';
  if (lastWorkingDay === undefined) return 'LAST_WORKING_DAY_REQUIRED';

  return null;
}

/** The day the department is left with no head: only when a head hands over to nobody. */
export function departmentWithoutHeadFrom(
  handover: { successorEmployeeId: string | null } | null,
  endsOn: BusinessDate,
): BusinessDate | null {
  return handover && handover.successorEmployeeId === null ? endsOn : null;
}
