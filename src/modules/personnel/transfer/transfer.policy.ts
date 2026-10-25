import { type BusinessDate } from '../../../core/business-date';
import { placementReasons } from '../../organization/employee-placement.policy';
import { groundsRefusal, type GroundsInput } from '../grounds/grounds.policy';
import { type SelfActionMode } from '../personnel-self-action.policy';

/**
 * What the policy of a transfer refuses, as a semantic code (`DEPARTMENT_TRANSFER.<code>` on the wire) and the facts a person
 * needs to put it right. The first thing that is wrong wins, in the order a person would fix it.
 */
export interface TransferRefusal {
  code: string;
  details?: Record<string, unknown>;
}

export interface SuccessorFacts {
  /** The person leaves a department they head across the day before it takes effect, and the department changes. */
  required: boolean;
  /** What the caller chose; undefined when nothing was said. */
  chosen: { kind: 'EMPLOYEE'; employeeId: string } | { kind: 'NONE' } | undefined;
  /** For a chosen employee: how they stand on the day. Read only when one is chosen. */
  candidate: {
    isTransferee: boolean;
    memberOfOldDepartmentOnDay: boolean;
    stillWorking: boolean;
    holdsSuperAdmin: boolean;
    /** Their own transfer waits: they would leave the department the head is handed to. */
    hasPendingTransfer: boolean;
  } | null;
}

export interface NewTransferFacts {
  today: BusinessDate;
  effectiveOn: BusinessDate;
  employee: { status: 'ACTIVE' | 'TERMINATED'; workState: 'WORKING' | 'ON_LONG_LEAVE' | 'HANDING_OVER' | 'LEFT' };
  /** The placement in force: where the person is, and since when. */
  current: { departmentId: string; jobTitleId: string; validFrom: BusinessDate };
  /** Where the person is to be; what the caller did not name stays as it is. */
  target: { departmentId: string; jobTitleId: string };
  destinationDepartment: { active: boolean; costCenterActive: boolean } | null;
  destinationJobTitle: { active: boolean } | null;
  grounds: GroundsInput | undefined;
  pending: { effectiveOn: BusinessDate } | null;
  /** Another waiting transfer names this person to follow the head of its department: they stay until it is settled. */
  namedAsSuccessor: boolean;
  selfMode: SelfActionMode;
  successor: SuccessorFacts;
}

/**
 * What the database says when it refuses a placement in a department that is retired, which a lock cannot hold for the policy:
 * the same refusal the policy gives when it sees the department retired.
 */
export function retiredDestinationRefusal(): TransferRefusal {
  const [reason] = placementReasons({
    department: { named: true, found: { active: false, costCenterActive: true } },
    jobTitle: { named: true, found: { active: true } },
  });

  return { code: reason.code, details: { subject: reason.subject } };
}

const SELF_REFUSAL: TransferRefusal = { code: 'SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN' };

/** The basis of a change of the day or a cancellation, which also needs a reason (`US-03-01` AC-19, AC-20). */
function reasonAndGrounds(reason: string, grounds: GroundsInput | undefined): TransferRefusal | null {
  if (reason.trim() === '') return { code: 'REASON_REQUIRED' };
  const refused = groundsRefusal(grounds);

  return refused
    ? { code: refused.reason, details: 'missing' in refused ? { missing: refused.missing } : undefined }
    : null;
}

/** Who the head of the old department is to be, or that nobody is (`US-03-01` AC-8, `QĐ-66a`). */
export function successorRefusal(successor: SuccessorFacts): TransferRefusal | null {
  if (!successor.required) return null;
  if (successor.chosen === undefined) return { code: 'HEAD_SUCCESSOR_REQUIRED' };
  if (successor.chosen.kind === 'NONE') return null;
  const candidate = successor.candidate;
  const refuse = (reason: string): TransferRefusal => ({ code: 'SUCCESSOR_NOT_A_MEMBER_ON_DATE', details: { reason } });
  if (candidate === null || !candidate.memberOfOldDepartmentOnDay) return refuse('NOT_A_MEMBER_ON_DATE');
  if (candidate.isTransferee) return refuse('SAME_PERSON');
  if (candidate.hasPendingTransfer) return refuse('HAS_PENDING_TRANSFER');
  if (!candidate.stillWorking) return refuse('EMPLOYEE_NOT_ACTIVE');
  if (candidate.holdsSuperAdmin) return refuse('SUPER_ADMIN_CANNOT_HEAD');

  return null;
}

/** The day a change takes effect must be today or later and after the first day of the placement it ends. */
function dateRefusal(today: BusinessDate, day: BusinessDate, periodStart: BusinessDate): TransferRefusal | null {
  if (day < today) return { code: 'EFFECTIVE_DATE_IN_PAST', details: { today } };
  if (day <= periodStart)
    return { code: 'EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD', details: { currentPeriodFrom: periodStart } };

  return null;
}

/**
 * Whether a transfer may be recorded (`US-03-01` AC-14 -> AC-18, AC-21, AC-22): the person works for the organization and has no
 * other event waiting, something changes, the day is today or later, the destination can take people and the title can be
 * given, the basis is whole, nobody else has to act in their place, and the head of the department they leave is provided for.
 */
export function newTransferRefusal(facts: NewTransferFacts): TransferRefusal | null {
  const { employee, current, target } = facts;
  if (employee.status === 'TERMINATED' || employee.workState === 'LEFT') return { code: 'EMPLOYEE_LEFT' };
  const departmentChanges = target.departmentId !== current.departmentId;
  const titleChanges = target.jobTitleId !== current.jobTitleId;
  if (!departmentChanges && !titleChanges) return { code: 'NO_CHANGE' };
  const late = dateRefusal(facts.today, facts.effectiveOn, current.validFrom);
  if (late) return late;

  const reasons = placementReasons({
    department: {
      named: true,
      found: departmentChanges ? facts.destinationDepartment : { active: true, costCenterActive: true },
    },
    jobTitle: { named: true, found: titleChanges ? facts.destinationJobTitle : { active: true } },
  });
  const reason = reasons[0];
  // The code the shared policy gives is the code on the wire (`DEPARTMENT_TRANSFER.<code>`): this file writes none of them.
  if (reason) return { code: reason.code, details: { subject: reason.subject } };
  const grounds = groundsRefusal(facts.grounds);
  if (grounds)
    return { code: grounds.reason, details: 'missing' in grounds ? { missing: grounds.missing } : undefined };

  if (facts.pending)
    return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'TRANSFER', effectiveOn: facts.pending.effectiveOn } };
  if (facts.namedAsSuccessor) return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'HEAD_HANDOVER' } };
  if (employee.workState === 'HANDING_OVER') return { code: 'PENDING_EVENT_EXISTS', details: { kind: 'OFFBOARDING' } };
  if (facts.selfMode === 'NEEDS_ANOTHER_IT_ADMIN') return SELF_REFUSAL;

  return successorRefusal(facts.successor);
}

export interface PendingTransferFacts {
  status: 'PENDING' | 'EFFECTIVE' | 'CANCELLED';
  effectiveOn: BusinessDate;
  today: BusinessDate;
  /** The first day of the placement the transfer ends. */
  periodStart: BusinessDate;
  reason: string;
  grounds: GroundsInput | undefined;
  selfMode: SelfActionMode;
}

/** A transfer can be moved or cancelled only while it has not taken effect (`US-03-01` AC-19, AC-20). */
function notPendingRefusal(facts: PendingTransferFacts): TransferRefusal | null {
  if (facts.status === 'CANCELLED') return { code: 'ALREADY_CANCELLED' };
  if (facts.status === 'EFFECTIVE' || facts.effectiveOn <= facts.today) return { code: 'ALREADY_EFFECTIVE' };

  return null;
}

/** Whether a waiting transfer may be moved to `newEffectiveOn`; the successor is judged again by the caller on the new day. */
export function rescheduleRefusal(
  facts: PendingTransferFacts & { newEffectiveOn: BusinessDate; successor: SuccessorFacts },
): TransferRefusal | null {
  const settled = notPendingRefusal(facts);
  if (settled) return settled;
  const detail = reasonAndGrounds(facts.reason, facts.grounds);
  if (detail) return detail;
  if (facts.newEffectiveOn === facts.effectiveOn) return { code: 'NO_CHANGE' };
  const late = dateRefusal(facts.today, facts.newEffectiveOn, facts.periodStart);
  if (late) return late;
  if (facts.selfMode === 'NEEDS_ANOTHER_IT_ADMIN') return SELF_REFUSAL;

  return successorRefusal(facts.successor);
}

/** Whether a waiting transfer may be cancelled. */
export function cancelRefusal(facts: PendingTransferFacts): TransferRefusal | null {
  const settled = notPendingRefusal(facts);
  if (settled) return settled;
  const detail = reasonAndGrounds(facts.reason, facts.grounds);
  if (detail) return detail;

  return facts.selfMode === 'NEEDS_ANOTHER_IT_ADMIN' ? SELF_REFUSAL : null;
}
