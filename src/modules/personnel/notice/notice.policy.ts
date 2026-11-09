import type { BusinessDate } from '../../../core/business-date';
import { groundsRefusal, type GroundsInput } from '../personnel-grounds.policy';
import {
  TRANSFER_KINDS,
  type NoticeEventField,
  type NoticeEventInput,
  type NoticeEventKind,
  type NoticeKind,
  type NoticeStatus,
  type VerificationInput,
} from '../personnel-notice.types';

/** A refusal the notice rules give: the semantic code and what a person needs to put it right. */
export interface NoticeRefusal {
  code: string;
  details?: Record<string, unknown>;
}

const refusal = (code: string, details?: Record<string, unknown>): NoticeRefusal => ({
  code,
  ...(details ? { details } : {}),
});

const isTransfer = (kind: NoticeKind): boolean => TRANSFER_KINDS.includes(kind);

export interface SendFacts {
  kind: NoticeKind;
  senderEmployeeId: string;
  employeeId: string;
  /** Null when the person does not exist. */
  employee: { status: string; workState: string; departmentId: string | null } | null;
  targetDepartmentId: string | undefined;
  /** Whether the department named exists and can take people; meaningful only when one is named. */
  targetUsable: boolean;
  /** The department the sender heads today, if any. */
  senderHeadOf: string | null;
  /** The code of the notice of the same kind about the same person that waits, if there is one. */
  pendingCode: string | null;
}

/**
 * Who may send which notice (`US-03-10` AC-3 to AC-5, AC-7, AC-9), in the order the answers are given: the person exists and has not
 * left, a head does not send about themselves, a transfer names the department, the sender is the head of the department the person
 * belongs to (for a transfer to their department: of the one it names), and one of the same kind does not wait already. Null when
 * the notice may be sent.
 */
export function sendRefusal(facts: SendFacts): NoticeRefusal | null {
  if (!facts.employee) return refusal('EMPLOYEE_NOT_FOUND');
  if (facts.employee.status === 'TERMINATED' || facts.employee.workState === 'LEFT') return refusal('EMPLOYEE_LEFT');
  if (facts.senderEmployeeId === facts.employeeId) return refusal('SELF_NOTICE');
  if (isTransfer(facts.kind) && !facts.targetDepartmentId) return refusal('TARGET_DEPARTMENT_REQUIRED');
  if (!isTransfer(facts.kind) && facts.targetDepartmentId) return refusal('TARGET_DEPARTMENT_INVALID');
  if (facts.targetDepartmentId && !facts.targetUsable) return refusal('TARGET_DEPARTMENT_INVALID');

  if (facts.kind === 'DEPARTMENT_TRANSFER_IN') {
    // The head of the department that receives the person; the person is in another one.
    if (facts.senderHeadOf !== facts.targetDepartmentId) return refusal('NOT_DEPARTMENT_HEAD');
    if (facts.employee.departmentId === facts.targetDepartmentId) return refusal('KIND_NOT_ALLOWED');
  } else {
    if (facts.senderHeadOf === null || facts.senderHeadOf !== facts.employee.departmentId)
      return refusal('NOT_DEPARTMENT_HEAD');
    if (facts.targetDepartmentId && facts.targetDepartmentId === facts.employee.departmentId)
      return refusal('TARGET_DEPARTMENT_INVALID');
  }
  if (facts.pendingCode) return refusal('DUPLICATE_PENDING', { pendingCode: facts.pendingCode });

  return null;
}

/** Only a notice that still waits is withdrawn, rejected, recorded or linked (`US-03-10` AC-8). */
export function pendingRefusal(status: NoticeStatus): NoticeRefusal | null {
  return status === 'PENDING_VERIFICATION' ? null : refusal('NOT_PENDING');
}

/** The reason an IT Admin gives for rejecting a notice: it is required, and nothing is kept without it (`US-03-11` AC-2). */
export function rejectReasonRefusal(reason: string | undefined | null): NoticeRefusal | null {
  return typeof reason === 'string' && reason.trim() !== '' ? null : refusal('REASON_REQUIRED');
}

/** How the notice was checked: the method is a closed set, the reference is what was checked against (`QĐ-77b`). */
export function verificationRefusal(verification: VerificationInput | undefined | null): NoticeRefusal | null {
  if (!verification || typeof verification.reference !== 'string' || verification.reference.trim() === '')
    return refusal('VERIFICATION_REQUIRED');

  return null;
}

/**
 * The basis outside the notice that the event rests on (`US-03-11` AC-9): whole, and never the code of a notice, of this one or of
 * another. The judgement is the shared one of the personnel flows; only the code the wire names is the notice's own.
 */
export function noticeGroundsRefusal(grounds: GroundsInput | undefined | null): NoticeRefusal | null {
  const found = groundsRefusal(grounds);
  if (!found) return null;

  return found.reason === 'GROUNDS_INCOMPLETE'
    ? refusal('GROUNDS_INCOMPLETE', { missing: found.missing })
    : refusal(found.reason);
}

interface EventShape {
  required: readonly NoticeEventField[];
  allowed: readonly NoticeEventField[];
}

const SHAPES: Readonly<Record<NoticeKind, EventShape>> = {
  DEPARTMENT_TRANSFER_OUT: {
    required: ['effectiveOn'],
    allowed: ['effectiveOn', 'toDepartmentId', 'successor'],
  },
  DEPARTMENT_TRANSFER_IN: {
    required: ['effectiveOn'],
    allowed: ['effectiveOn', 'toDepartmentId', 'successor'],
  },
  // Retired (`QĐ-87e`): one that was sent before can still be read and rejected; recording it has no department to go to.
  JOB_TITLE_CHANGE: { required: ['effectiveOn'], allowed: ['effectiveOn'] },
  DEPARTURE: {
    required: ['lastWorkingDay', 'accessBlockMode'],
    allowed: ['lastWorkingDay', 'accessBlockMode', 'successor', 'cancelPendingTransfer'],
  },
  ABRUPT_DEPARTURE: {
    required: ['lastWorkingDay', 'accessBlockMode'],
    allowed: ['lastWorkingDay', 'accessBlockMode', 'successor', 'cancelPendingTransfer'],
  },
  LONG_LEAVE: { required: ['startedOn', 'approvedReturnOn'], allowed: ['startedOn', 'approvedReturnOn'] },
};

/** The event a notice is recorded as must carry what its kind needs and nothing of another kind (`US-03-11` AC-1, AC-7). */
export function eventShapeRefusal(kind: NoticeKind, event: NoticeEventInput): NoticeRefusal | null {
  const shape = SHAPES[kind];
  const given = (Object.keys(event) as NoticeEventField[]).filter((field) => event[field] !== undefined);
  const missing = shape.required.filter((field) => !given.includes(field));
  const notAllowed = given.filter((field) => !shape.allowed.includes(field));
  if (missing.length === 0 && notAllowed.length === 0) return null;

  return refusal('EVENT_INVALID', { missing, notAllowed });
}

/** Which official event a notice leads to. */
export function eventKindOf(kind: NoticeKind): NoticeEventKind {
  if (kind === 'LONG_LEAVE') return 'LONG_LEAVE';

  return kind === 'DEPARTURE' || kind === 'ABRUPT_DEPARTURE' ? 'OFFBOARDING_CASE' : 'DEPARTMENT_TRANSFER';
}

/** A notice that tells of a sudden departure is the one the IT Admin and the Super Admin are warned of first (`US-03-10` AC-6). */
export const isPriorityKind = (kind: NoticeKind): boolean => kind === 'ABRUPT_DEPARTURE';

/** The day an IT Admin has passed without handling a notice that waits; only told, never acted on (`US-03-11` AC-5). */
export function isNoticeOverdue(notice: { status: NoticeStatus; dueOn: BusinessDate }, today: BusinessDate): boolean {
  return notice.status === 'PENDING_VERIFICATION' && notice.dueOn < today;
}
