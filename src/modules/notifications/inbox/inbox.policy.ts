import {
  IN_APP_NOTIFICATION_CODES,
  type InAppNotificationCode,
  type InAppNotificationInput,
  type InAppNotificationRefusal,
} from '../notifications.types';

/**
 * Keys that never reach an inbox: the secrets the Audit Trail refuses, whatever the code says (`FR-3.11`, `INF-06`). A key that
 * matches is refused even if a table below allowed it, so one slip in the table cannot put a secret in front of a reader.
 */
export const FORBIDDEN_PARAM_KEY = /password|hash|token|secret|cookie|credential|authorization|pepper/i;

/** The words that say a figure of money or a finding of the budget; no key of any code carries one (`INF-06`, `US-05-18` AC-3). */
export const FIGURE_WORDS = /amount|budget|remaining|override|evidence|lastError|opinion/i;

export const MAX_PARAMS_BYTES = 4096;
export const MAX_EVENT_KEY_LENGTH = 200;

const STEP = ['requestId', 'stepKind'] as const;
const REMINDER_NUMBERS = ['reminderNumber', 'ageWorkingDays', 'overdueWorkingDays'] as const;

/**
 * The parameter keys each code may carry: the whole of what a notice says besides its code and its subject. A notice with a
 * key that is not in the list of its code is refused, so what an inbox shows is decided here and nowhere else. Values are
 * ids, codes and the reasons the people concerned already read on the request; the interface turns them into words.
 */
export const PARAM_KEYS_BY_CODE: Readonly<Record<InAppNotificationCode, readonly string[]>> = {
  REQUEST_SUBMITTED: ['requestId', 'stage'],
  REQUEST_NEED_APPROVED: ['requestId', 'next'],
  REQUEST_REJECTED: ['requestId', 'by', 'reason', 'suggestedPlanId'],
  REQUEST_IT_REJECTED: ['requestId', 'kind', 'reason', 'alternativePlanId', 'alternativeNote', 'noAlternative'],
  REQUEST_SPEND_APPROVED: ['requestId'],
  REQUEST_GRANTED: ['requestId', 'accessGuide', 'homepageUrl'],
  REQUEST_FAILED: ['requestId', 'contact'],
  REQUEST_WITHDRAWN: ['requestId', 'byRequester', 'reason'],
  REQUEST_WITHDRAWAL_PENDING: ['requestId'],
  REQUEST_CANCELLED: ['requestId', 'reasonKind'],
  REQUEST_WAITING_CONTROLLED: STEP,
  REQUEST_WAITING_ENDED: STEP,
  STEP_ASSIGNED: ['requestId', 'stepKind', 'cause'],
  STEP_CLOSED_BY_WITHDRAWAL: STEP,
  WITHDRAWAL_AWAITING_IT_CLOSE: ['requestId', 'taskId'],
  COMMITMENT_RELEASED_BY_WITHDRAWAL: ['requestId'],
  GRANT_TASK_CANCELLED: ['requestId', 'taskId'],
  // The reminders of a late step and of the queue of the head, and the alert of a backlog (`g5-step-sla-and-alerts`): ids, the kind
  // of step, how many reminders, how old and how late in working days, and the cause when the Super Admin is told. No figure of money.
  STEP_SLA_REMINDER: [...STEP, ...REMINDER_NUMBERS],
  STEP_SLA_ESCALATION: [...STEP, ...REMINDER_NUMBERS, 'holderEmployeeId'],
  STEP_SLA_NO_SUPERIOR: [...STEP, ...REMINDER_NUMBERS, 'holderEmployeeId', 'cause'],
  SPEND_QUEUE_REMINDER: ['requestId', ...REMINDER_NUMBERS, 'cause'],
  FINANCE_QUESTION_REMINDER: [...STEP, 'questionId', ...REMINDER_NUMBERS],
  STEP_BACKLOG_ALERT: ['holderEmployeeId', 'openCount', 'threshold', 'oldestAgeWorkingDays'],
  CONTROLLED_WAIT_ALERT: ['requestId', 'stepKind', 'waitingReason', 'configurationHint'],
  SERVICE_ACCOUNT_BOUNDARY_ACCEPTED: ['requestId'],
  RETURN_REQUESTED: ['returnRequestId', 'planId', 'source', 'handoverRequired', 'handoverDueOn'],
  RETURN_COMPLETED: ['returnRequestId', 'handoverFlagged'],
  RETURN_FAILED: ['returnRequestId'],
  REQUEST_RENEWAL_APPLIED: ['requestId', 'newExpectedEndDate'],
  REQUEST_RENEWAL_NOT_APPLIED: ['requestId', 'problem'],
  // Organization and personnel (F17, F24): who it is about, where, what kind of event and from when; the ids of the notice or task.
  EMPLOYEE_PROFILE_CREATED: ['employeeId', 'departmentId'],
  EMPLOYEE_PROFILE_UPDATED: ['employeeId', 'departmentId'],
  PERSONNEL_EVENT_RECORDED: ['employeeId', 'departmentId', 'eventKind', 'effectiveOn'],
  PERSONNEL_NOTICE_RECEIVED: ['noticeId', 'employeeId', 'departmentId', 'eventKind'],
  PERSONNEL_NOTICE_OVERDUE: ['noticeId', 'employeeId', 'departmentId', 'eventKind'],
  ABRUPT_DEPARTURE_RECORDED: ['employeeId', 'departmentId', 'effectiveOn'],
  ROLE_HOLDER_LEAVING: ['employeeId', 'departmentId', 'roleFlag', 'effectiveOn'],
  TRANSFER_REVIEW_DUE: ['employeeId', 'departmentId', 'dueOn'],
  IT_ADMIN_SELF_EXECUTED: ['taskId', 'employeeId'],
  // The budget loops (F67): ids, the fiscal year, the decision and the reason already shown on the version or the request.
  // No key says a figure (the words of FIGURE_WORDS are refused for every code).
  BUDGET_VERSION_AWAITING_DECISION: ['versionId', 'costCenterId', 'year'],
  BUDGET_PROPOSAL_SUBMITTED: ['proposalId', 'costCenterId', 'year'],
  BUDGET_PROPOSAL_RETURNED: ['proposalId', 'costCenterId', 'year', 'reason'],
  BUDGET_VERSION_DECIDED: ['versionId', 'costCenterId', 'year', 'decision', 'reason'],
  REQUEST_FINANCE_REVIEW_OPENED: ['requestId', 'stepKind'],
  REQUEST_RETURNED_BY_FINANCE: ['requestId', 'reason'],
  REQUEST_AWAITING_BUDGET: ['requestId', 'costCenterId', 'year'],
  REQUEST_BUDGET_VERSION_ENDED: ['requestId', 'versionId', 'costCenterId', 'year', 'decision'],
  BUDGET_VERSION_CLOSED_UNAPPROVED: ['versionId', 'costCenterId', 'year'],
  BUDGET_PROPOSAL_CLOSED_YEAR_END: ['proposalId', 'costCenterId', 'year'],
  BUDGET_PROPOSAL_TASK_ASSIGNED: ['costCenterId', 'departmentId', 'year'],
  BUDGET_PROPOSAL_TASK_WAITING: ['proposalId', 'costCenterId', 'year'],
};

/** Whether the code is one of the closed table. */
export function isKnownCode(code: string): code is InAppNotificationCode {
  return (IN_APP_NOTIFICATION_CODES as readonly string[]).includes(code);
}

/**
 * Judges a notice before it is written: a code of the table, a key of one to two hundred characters, a subject with both its
 * type and its id or neither, and parameters that are flat (a string, a finite number, a boolean or empty), that only use the
 * keys of the code, that carry no key of the forbidden words and that fit in 4 096 bytes. The first fault found is returned.
 */
export function refuseInAppNotification(input: InAppNotificationInput): InAppNotificationRefusal | null {
  if (!isKnownCode(input.code)) return { reason: 'UNKNOWN_CODE' };
  if (input.eventKey.length < 1 || input.eventKey.length > MAX_EVENT_KEY_LENGTH) return { reason: 'EVENT_KEY_INVALID' };
  if (input.subject !== null && (input.subject.type.trim() === '' || input.subject.id === '')) {
    return { reason: 'SUBJECT_INVALID' };
  }

  const allowed = PARAM_KEYS_BY_CODE[input.code];
  for (const [key, value] of Object.entries(input.params)) {
    if (FORBIDDEN_PARAM_KEY.test(key)) return { reason: 'PARAM_KEY_FORBIDDEN', key };
    if (!allowed.includes(key)) return { reason: 'PARAM_KEY_NOT_ALLOWED', key };
    const flat =
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value));
    if (!flat) return { reason: 'PARAM_VALUE_INVALID', key };
  }
  if (Buffer.byteLength(JSON.stringify(input.params), 'utf8') > MAX_PARAMS_BYTES) return { reason: 'PARAMS_TOO_LARGE' };

  return null;
}
