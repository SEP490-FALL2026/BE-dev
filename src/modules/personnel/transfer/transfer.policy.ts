import { type BusinessDate } from '../../../core/business-date';
import { placementReasons } from '../../organization/public/employee-placement.policy';
import { groundsNoteRefusal } from '../personnel-grounds.policy';
import { successorCandidateRefusal, type SuccessorFacts } from '../personnel-successor.policy';

/**
 * What the policy of a transfer refuses, as a semantic code (`DEPARTMENT_TRANSFER.<code>` on the wire) and the facts a person
 * needs to put it right. The first thing that is wrong wins, in the order a person would fix it.
 */
export interface TransferRefusal {
  code: string;
  details?: Record<string, unknown>;
}

export interface NewTransferFacts {
  today: BusinessDate;
  effectiveOn: BusinessDate;
  employee: { status: 'ACTIVE' | 'TERMINATED'; workState: 'WORKING' | 'ON_LONG_LEAVE' | 'HANDING_OVER' | 'LEFT' };
  /** The placement in force: where the person is, and since when. */
  current: { departmentId: string; validFrom: BusinessDate };
  /** Where the person is to be; what the caller did not name stays as it is. */
  target: { departmentId: string };
  /** The department the person is to join: whether it exists and takes people. Its Cost Center is not asked (`QĐ-87d`(3)). */
  destinationDepartment: { active: boolean; effectiveFrom: BusinessDate } | null;
  groundsNote: string | undefined;
  pending: { effectiveOn: BusinessDate } | null;
  /** Another waiting transfer names this person to follow the head of its department: they stay until it is settled. */
  namedAsSuccessor: boolean;
  successor: SuccessorFacts;
}

/**
 * What the database says when it refuses a placement in a department that is retired, which a lock cannot hold for the policy:
 * the same refusal the policy gives when it sees the department retired.
 */
export function retiredDestinationRefusal(): TransferRefusal {
  const [reason] = placementReasons({ department: { named: true, found: { active: false } } });

  return { code: reason.code, details: { subject: reason.subject } };
}

/** The basis of a change of the day or a cancellation, which also needs a reason (`US-03-01` AC-19, AC-20). */
function reasonAndGrounds(reason: string, groundsNote: string | undefined): TransferRefusal | null {
  if (reason.trim() === '') return { code: 'REASON_REQUIRED' };
  const refused = groundsNoteRefusal(groundsNote);

  return refused ? { code: refused.reason } : null;
}

/**
 * Who the head of the old department is to be, or that nobody is (`US-03-01` AC-8, `QĐ-66a`). A transfer still lets a head choose that
 * nobody follows; `QĐ-110h` withdraws that choice for it too, and the transfer then judges with `successorRequiredRefusal` of the shared
 * policy (`MF3-A.2`), which the departure uses already.
 */
export function successorRefusal(successor: SuccessorFacts): TransferRefusal | null {
  if (!successor.required) return null;
  if (successor.chosen === undefined) return { code: 'HEAD_SUCCESSOR_REQUIRED' };
  if (successor.chosen.kind === 'NONE') return null;

  return successorCandidateRefusal(successor.candidate);
}

/** The day a change takes effect must be today or later and after the first day of the placement it ends. */
function dateRefusal(today: BusinessDate, day: BusinessDate, periodStart: BusinessDate): TransferRefusal | null {
  if (day < today) return { code: 'EFFECTIVE_DATE_IN_PAST', details: { today } };
  if (day <= periodStart)
    return { code: 'EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD', details: { currentPeriodFrom: periodStart } };

  return null;
}

/** The destination takes effect after the day of the change: a department made for next year takes nobody in before 1 January (`QĐ-104e(3)`). */
export function notYetEffectiveRefusal(effectiveFrom: BusinessDate | null, day: BusinessDate): TransferRefusal | null {
  return effectiveFrom !== null && day < effectiveFrom
    ? { code: 'DEPARTMENT_NOT_YET_EFFECTIVE', details: { effectiveFrom } }
    : null;
}

/**
 * What is wrong with the department a person is to join: it takes effect after the day of the change (a department made for next
 * year takes nobody in before 1 January, `QĐ-104e(3)`), or the shared placement policy finds it unknown or retired. A transfer is a
 * change of place, not a charge: a department with no Cost Center takes people like any other (`QĐ-87d`(3)).
 * The code the shared policy gives is the code on the wire (`DEPARTMENT_TRANSFER.<code>`): this file writes none of its own for it.
 */
function destinationRefusal(
  destination: NewTransferFacts['destinationDepartment'],
  effectiveOn: BusinessDate,
): TransferRefusal | null {
  const early = notYetEffectiveRefusal(destination?.effectiveFrom ?? null, effectiveOn);
  if (early) return early;
  const [reason] = placementReasons({ department: { named: true, found: destination } });

  return reason ? { code: reason.code, details: { subject: reason.subject } } : null;
}

/**
 * Whether a transfer may be recorded (`US-03-01` AC-14 -> AC-18, AC-21, AC-22): the person works for the organization and has no
 * other event waiting, the department changes, the day is today or later, the destination can take people, the basis is whole,
 * nobody else has to act in their place, and the head of the department they leave is provided for.
 */
export function newTransferRefusal(facts: NewTransferFacts): TransferRefusal | null {
  const { employee, current, target } = facts;
  if (employee.status === 'TERMINATED' || employee.workState === 'LEFT') return { code: 'EMPLOYEE_LEFT' };
  if (target.departmentId === current.departmentId) return { code: 'NO_CHANGE' };
  const late = dateRefusal(facts.today, facts.effectiveOn, current.validFrom);
  if (late) return late;

  const destination = destinationRefusal(facts.destinationDepartment, facts.effectiveOn);
  if (destination) return destination;
  const grounds = groundsNoteRefusal(facts.groundsNote);
  if (grounds) return { code: grounds.reason };

  if (facts.pending)
    return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'TRANSFER', effectiveOn: facts.pending.effectiveOn } };
  if (facts.namedAsSuccessor) return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'HEAD_HANDOVER' } };
  if (employee.workState === 'HANDING_OVER') return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'OFFBOARDING' } };

  return successorRefusal(facts.successor);
}

export interface PendingTransferFacts {
  status: 'PENDING' | 'EFFECTIVE' | 'CANCELLED';
  effectiveOn: BusinessDate;
  today: BusinessDate;
  /** The first day of the placement the transfer ends. */
  periodStart: BusinessDate;
  reason: string;
  groundsNote: string | undefined;
}

/** A transfer can be moved or cancelled only while it has not taken effect (`US-03-01` AC-19, AC-20). */
function notPendingRefusal(facts: PendingTransferFacts): TransferRefusal | null {
  if (facts.status === 'CANCELLED') return { code: 'ALREADY_CANCELLED' };
  if (facts.status === 'EFFECTIVE' || facts.effectiveOn <= facts.today) return { code: 'ALREADY_EFFECTIVE' };

  return null;
}

/** Whether a waiting transfer may be moved to `newEffectiveOn`; the successor is judged again by the caller on the new day. */
export function rescheduleRefusal(
  facts: PendingTransferFacts & {
    newEffectiveOn: BusinessDate;
    successor: SuccessorFacts;
    /** The day the destination department takes effect. */
    destinationEffectiveFrom: BusinessDate | null;
  },
): TransferRefusal | null {
  const settled = notPendingRefusal(facts);
  if (settled) return settled;
  const detail = reasonAndGrounds(facts.reason, facts.groundsNote);
  if (detail) return detail;
  if (facts.newEffectiveOn === facts.effectiveOn) return { code: 'NO_CHANGE' };
  const late = dateRefusal(facts.today, facts.newEffectiveOn, facts.periodStart);
  if (late) return late;
  const early = notYetEffectiveRefusal(facts.destinationEffectiveFrom, facts.newEffectiveOn);
  if (early) return early;

  return successorRefusal(facts.successor);
}

/** Whether a waiting transfer may be cancelled. */
export function cancelRefusal(facts: PendingTransferFacts): TransferRefusal | null {
  const settled = notPendingRefusal(facts);
  if (settled) return settled;
  return reasonAndGrounds(facts.reason, facts.groundsNote);
}

/** Whether a change of department may start at all, judged on what the person is before the locks: unknown, or gone. */
export function subjectRefusal(seen: { status: string } | null): 'EMPLOYEE_NOT_FOUND' | 'EMPLOYEE_LEFT' | null {
  if (!seen) return 'EMPLOYEE_NOT_FOUND';

  return seen.status === 'TERMINATED' ? 'EMPLOYEE_LEFT' : null;
}

/** Whether, once the locks are taken, the placement in force is still the one seen before them (none, or another, is a change by someone else). */
export function placementHeld<P extends { placementId: string }>(
  current: P | null,
  seenPlacementId: string,
): current is P {
  return current !== null && current.placementId === seenPlacementId;
}

/** The successor a head hands over to as the record and its audit name it: `NONE` when nobody takes over, null when the person did not head. */
export function headSuccessorLabel(handover: { successorEmployeeId: string | null } | null): string | null {
  return handover ? (handover.successorEmployeeId ?? 'NONE') : null;
}

/**
 * Who followed the head before the move, so a move that names nobody keeps the choice (`US-03-01` AC-19, `US-03-04` AC-22): the person
 * chosen, or nobody; nothing to keep when the person did not head the department.
 */
export function previousSuccessorChoice(
  handover: { successorEmployeeId: string | null } | null,
): { kind: 'EMPLOYEE'; employeeId: string } | { kind: 'NONE' } | undefined {
  if (!handover) return undefined;

  return handover.successorEmployeeId
    ? { kind: 'EMPLOYEE', employeeId: handover.successorEmployeeId }
    : { kind: 'NONE' };
}
