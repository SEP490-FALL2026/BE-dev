import { addDays, type BusinessDate } from '../../../core/business-date';
import { addWorkingDays, type NonWorkingDates } from '../../../core/working-days';
import { groundsRefusal, type GroundsInput } from '../personnel-grounds.policy';
import type { AccessBlockMode, OffboardingState } from './offboarding.types';

/** What the policy refuses, as a semantic code (`OFFBOARDING_CASE.<code>` on the wire) and the facts a person needs to put it right. */
export interface OffboardingRefusal {
  code: string;
  details?: Record<string, unknown>;
}

/**
 * The first day the person is no longer a member of the department (and no longer its head). A planned handover ends the day after
 * the last working day; a departure blocked now never ends a placement on its first day (`US-03-04` AC-18), and one whose last
 * working day is past is not written into the past (the day it is recorded at the earliest).
 */
export function departureEffectiveOn(facts: {
  lastWorkingDay: BusinessDate;
  blockNow: boolean;
  today: BusinessDate;
  placementFrom: BusinessDate | null;
}): BusinessDate {
  const after = addDays(facts.lastWorkingDay, 1);
  if (!facts.blockNow) return after;
  const floors = [after, facts.today, ...(facts.placementFrom ? [addDays(facts.placementFrom, 1)] : [])];

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
  placementFrom: BusinessDate | null;
}

/** Whether `day` can be the last working day of a planned handover (`AC-2`): there is one, and it is neither before the person came nor already past. */
function plannedDayRefusal(day: BusinessDate | undefined, facts: LastDayFacts): OffboardingRefusal | null {
  if (day === undefined || day.trim() === '') return { code: 'LAST_WORKING_DAY_REQUIRED' };
  if (day < facts.hireDate) return { code: 'LAST_WORKING_DAY_INVALID', details: { reason: 'BEFORE_HIRE_DATE' } };
  if (facts.placementFrom !== null && day < facts.placementFrom)
    return {
      code: 'LAST_WORKING_DAY_INVALID',
      details: { reason: 'BEFORE_PLACEMENT_START', placementFrom: facts.placementFrom },
    };
  if (day < facts.today)
    return { code: 'LAST_WORKING_DAY_INVALID', details: { reason: 'IN_PAST', today: facts.today } };

  return null;
}

/** A departure blocked now: its last working day may be past, today or ahead (`Q-04` B), but not before the person came. */
function blockNowDayRefusal(day: BusinessDate | undefined, facts: LastDayFacts): OffboardingRefusal | null {
  if (day === undefined || day.trim() === '') return { code: 'LAST_WORKING_DAY_REQUIRED' };
  if (day < facts.hireDate) return { code: 'LAST_WORKING_DAY_INVALID', details: { reason: 'BEFORE_HIRE_DATE' } };
  if (facts.placementFrom !== null && day < facts.placementFrom)
    return {
      code: 'LAST_WORKING_DAY_INVALID',
      details: { reason: 'BEFORE_PLACEMENT_START', placementFrom: facts.placementFrom },
    };

  return null;
}

export interface RecordFacts extends LastDayFacts {
  lastWorkingDay: BusinessDate | undefined;
  accessBlockMode: AccessBlockMode;
  employee: { status: 'ACTIVE' | 'TERMINATED'; workState: 'WORKING' | 'ON_LONG_LEAVE' | 'HANDING_OVER' | 'LEFT' };
  grounds: GroundsInput | undefined;
  /** The transfer of the person that waits, if any. */
  pendingTransfer: { effectiveOn: BusinessDate } | null;
  /** The Super Admin confirmed that the transfer that waits is cancelled with the departure. */
  cancelPendingTransfer: boolean;
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
  const day =
    facts.accessBlockMode === 'BLOCK_NOW'
      ? blockNowDayRefusal(facts.lastWorkingDay, facts)
      : plannedDayRefusal(facts.lastWorkingDay, facts);
  if (day) return day;
  const grounds = groundsRefusal(facts.grounds);
  if (grounds)
    return { code: grounds.reason, details: 'missing' in grounds ? { missing: grounds.missing } : undefined };

  const transfer = pendingTransferRefusal(
    facts.pendingTransfer,
    facts.lastWorkingDay as BusinessDate,
    facts.cancelPendingTransfer,
  );
  if (transfer) return transfer;
  if (facts.namedAsSuccessor) return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'HEAD_HANDOVER' } };

  return facts.successor;
}

/**
 * The transfer of the person that waits: when the last working day falls before it takes effect the transfer never happens, and the
 * caller confirms it is cancelled (the reason is the standard one); on or after that day the transfer wins and the departure is refused.
 */
export function pendingTransferRefusal(
  pending: { effectiveOn: BusinessDate } | null,
  lastWorkingDay: BusinessDate,
  cancelRequested: boolean,
): OffboardingRefusal | null {
  if (!pending) return null;
  if (lastWorkingDay >= pending.effectiveOn)
    return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'TRANSFER', effectiveOn: pending.effectiveOn } };

  return cancelRequested ? null : { code: 'TRANSFER_CANCELLATION_REQUIRED' };
}

/** The basis as a refusal of the departure flow: a part missing, or the code of a notice. Null when it is whole. */
function groundsFault(grounds: GroundsInput | undefined | null): OffboardingRefusal | null {
  const found = groundsRefusal(grounds);
  if (!found) return null;

  return { code: found.reason, ...('missing' in found ? { details: { missing: found.missing } } : {}) };
}

export interface ChangeLastDayFacts extends LastDayFacts {
  state: OffboardingState;
  grounds?: GroundsInput | undefined;
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
  const basis = groundsFault(facts.grounds);
  if (basis) return basis;
  const day = plannedDayRefusal(facts.newLastWorkingDay, facts);
  if (day) return day;
  if (facts.newLastWorkingDay === facts.currentLastWorkingDay) return { code: 'NO_CHANGE' };

  return facts.successor;
}

/** Whether a handover under way may be cancelled (`US-03-04` AC-15, `S-10`): a reason and a basis. */
export function cancelRefusal(facts: {
  state: OffboardingState;
  reason: string;
  grounds?: GroundsInput | undefined;
}): OffboardingRefusal | null {
  const state = notHandingOverRefusal(facts.state);
  if (state) return state;
  if (facts.reason.trim() === '') return { code: 'REASON_REQUIRED' };

  return groundsFault(facts.grounds);
}

/**
 * Whether the handover may become the departure (`US-03-04` AC-3, AC-10, `Q-04` B): on the last working day or after it, never before.
 * To leave sooner, move the last working day (`QĐ-48a`). The person left on the last working day, whenever it is marked.
 */
export function markLeftRefusal(facts: {
  state: OffboardingState;
  today: BusinessDate;
  lastWorkingDay: BusinessDate;
}): OffboardingRefusal | null {
  const state = notHandingOverRefusal(facts.state);
  if (state) return state;
  if (facts.today < facts.lastWorkingDay)
    return { code: 'LAST_WORKING_DAY_AHEAD', details: { lastWorkingDay: facts.lastWorkingDay } };

  return null;
}

/** Whether the departure is `LEFT` the moment it is recorded: blocked now, with a last working day that is today or past (`US-03-04` AC-18). */
export function leavesAtOnce(facts: {
  accessBlockMode: AccessBlockMode;
  lastWorkingDay: BusinessDate;
  today: BusinessDate;
}): boolean {
  return facts.accessBlockMode === 'BLOCK_NOW' && facts.lastWorkingDay <= facts.today;
}

/** The block the departure put on the access of the person (`employee_access_blocks`), as far as the cases need it. */
export interface DepartureBlock {
  blockedFrom: BusinessDate;
  /** The case that wrote the block; a block of another case is not this case's to show. */
  sourceCaseId?: string | null;
}

/** The block this case wrote, or null: the block of the person may belong to an earlier case (a cancelled one kept it in force). */
export function ownBlock(block: DepartureBlock | null | undefined, caseId: string): DepartureBlock | null {
  return block && block.sourceCaseId === caseId ? block : null;
}

/**
 * Whether the sign-in of the person is refused on `today` by their departure (QĐ-100q, S-11): they have left, or the block of the
 * handover is in force (the day after the last working day, or the day it was recorded for a departure blocked now). The IT Admin
 * does not wait for the state `LEFT` once this holds.
 */
export function isBlocked(
  facts: { state: OffboardingState },
  block: DepartureBlock | null,
  today: BusinessDate,
): boolean {
  return facts.state === 'LEFT' || (facts.state === 'HANDING_OVER' && block !== null && block.blockedFrom <= today);
}

/**
 * The first day the departure refuses the person, or null when it does not. A departed person is refused from the day they left
 * or from the block, whichever was first. A cancelled case refuses nobody: the block it left in force belongs to the account (it is lifted
 * with an unlock), not to the case.
 */
export function accessBlockedFrom(
  facts: { state: OffboardingState; leftOn: BusinessDate | null },
  block: DepartureBlock | null,
): BusinessDate | null {
  if (facts.state === 'CANCELLED') return null;
  const days = [block?.blockedFrom, facts.state === 'LEFT' ? facts.leftOn : null].filter(
    (day): day is BusinessDate => typeof day === 'string',
  );

  return days.length === 0 ? null : days.reduce((first, day) => (day < first ? day : first));
}

/** Whether the lock of the account may be written (`US-03-04` AC-20, `QĐ-77i`): the person is blocked and it was not written yet. */
export function accountLockRefusal(facts: { blocked: boolean; locked: boolean }): OffboardingRefusal | null {
  if (!facts.blocked) return { code: 'CASE_NOT_BLOCKED' };

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
  /** The person is blocked on the day of the act ({@link isBlocked}). */
  blocked: boolean;
  closed: boolean;
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
  if (!facts.blocked) return none({ code: 'CASE_NOT_BLOCKED' });
  if (facts.closed) return none({ code: 'CASE_CLOSED' });

  let selected: string[];
  if (facts.named === undefined) {
    selected = facts.rights.filter((right) => !right.hasTask && right.revocable).map((right) => right.assignmentId);
  } else {
    selected = [...new Set(facts.named)];
    const named = namedRightsRefusal(selected, facts.rights);
    if (named) return none(named);
  }
  if (selected.length === 0) return none({ code: 'NOTHING_TO_REVOKE' });
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
  blockNow: boolean;
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
 * lock of the company account (urgent when the departure is blocked now, and it comes before or with the first revocation), the removal
 * of the rights (a K1 whose access runs on to the end of the paid period is not done), and the seats given back, which is written only
 * for a seat whose task completed (`QĐ-62i`).
 */
export function checklistOf(facts: ChecklistFacts): Checklist {
  const revoked = facts.heldRights - facts.withoutTask;
  const revoking: StepState =
    facts.heldRights === 0 ? 'DONE' : revoked > 0 || facts.accessRunsOn > 0 ? 'IN_PROGRESS' : 'PENDING';

  return {
    dataHandover: { state: facts.pendingDuties === 0 ? 'DONE' : 'PENDING', pendingDuties: facts.pendingDuties },
    accountLock: { state: facts.lockRecorded ? 'DONE' : 'PENDING', urgent: facts.blockNow && !facts.lockRecorded },
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
