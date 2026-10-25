export type EmailTemplate = 'ACCOUNT_INVITATION' | 'PASSWORD_RESET' | 'PASSWORD_CHANGED_NOTICE';
export type EmailOutboxStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface EnqueueEmailInput {
  organizationId: string;
  recipient: string;
  template: EmailTemplate;
  locale: string;
  /**
   * Identifies the action token behind the link; at most one mail per token. A value, not a foreign key.
   * Null for a message that carries no link (the password-changed notice), which is sent without any
   * token check.
   */
  actionTokenHash: string | null;
  /** Sealed before it is stored. May hold the token itself, so it never appears in a log or an audit row. */
  payload: Record<string, unknown>;
}

export interface DeliveryState {
  status: EmailOutboxStatus;
  attempts: number;
  lastErrorCode: string | null;
  sentAt: Date | null;
}

export interface ClaimedEmail {
  id: string;
  recipient: string;
  template: string;
  locale: string;
  actionTokenHash: string | null;
  attempts: number;
  payloadCiphertext: Buffer | null;
  payloadKeyId: string | null;
}

/** Answers whether the link in a mail would still work; supplied by the module that owns the token. */
export type TokenUsability = (actionTokenHash: string) => Promise<boolean>;

/**
 * The closed table of what an in-app notice can say (`FR-3.11`). A code is source, not data: an item that has a new notice adds
 * its code here, and its parameter keys to `PARAM_KEYS_BY_CODE` of `inbox/inbox.policy.ts`, in the same change. The first group
 * belongs to the notices of the status of a request (`g5-request-status-notifications`), the second to the reminders of a step
 * (`g5-step-sla-and-alerts`), the third to the alert of a step that waits (`g5-step-reassignment-and-controlled-wait`), the last
 * to the notices of the requests of return and renewal and the verdict on a service account.
 */
export const IN_APP_NOTIFICATION_CODES = [
  'REQUEST_SUBMITTED',
  'REQUEST_NEED_APPROVED',
  'REQUEST_REJECTED',
  'REQUEST_IT_REJECTED',
  'REQUEST_SPEND_APPROVED',
  'REQUEST_GRANTED',
  'REQUEST_FAILED',
  'REQUEST_WITHDRAWN',
  'REQUEST_WITHDRAWAL_PENDING',
  'REQUEST_CANCELLED',
  'REQUEST_WAITING_CONTROLLED',
  'REQUEST_WAITING_ENDED',
  'STEP_ASSIGNED',
  'STEP_CLOSED_BY_WITHDRAWAL',
  'WITHDRAWAL_AWAITING_IT_CLOSE',
  'COMMITMENT_RELEASED_BY_WITHDRAWAL',
  'GRANT_TASK_CANCELLED',
  'STEP_SLA_REMINDER',
  'STEP_SLA_ESCALATION',
  'STEP_SLA_NO_SUPERIOR',
  'SPEND_QUEUE_REMINDER',
  'FINANCE_QUESTION_REMINDER',
  'STEP_BACKLOG_ALERT',
  'CONTROLLED_WAIT_ALERT',
  'SERVICE_ACCOUNT_BOUNDARY_ACCEPTED',
  'RETURN_REQUESTED',
  'RETURN_COMPLETED',
  'RETURN_FAILED',
  'REQUEST_RENEWAL_APPLIED',
  'REQUEST_RENEWAL_NOT_APPLIED',
] as const;

export type InAppNotificationCode = (typeof IN_APP_NOTIFICATION_CODES)[number];

/** A parameter of a notice: flat, so the interface can put it into a sentence and no structure can smuggle in a record. */
export type InAppParamValue = string | number | boolean | null;

export interface InAppNotificationInput {
  organizationId: string;
  /** An employee, not an account: the notice outlives the account. */
  recipientEmployeeId: string;
  code: InAppNotificationCode;
  /** What the notice is about, by id (`ACCESS_REQUEST`, `RETURN_REQUEST`); null for a notice that is about nothing in particular. */
  subject: { type: string; id: string } | null;
  params: Record<string, InAppParamValue>;
  /** Makes the notice once for the recipient: the same recipient and key again writes nothing. At most 200 characters. */
  eventKey: string;
}

/** A notice as its recipient reads it. */
export interface InAppNotificationRecord {
  id: string;
  code: string;
  subjectType: string | null;
  subjectId: string | null;
  params: Record<string, InAppParamValue>;
  createdAt: Date;
  readAt: Date | null;
}

/** Why a notice is refused before it is written (a programming error of the caller, never data for a reader). */
export type InAppNotificationRefusal =
  | { reason: 'UNKNOWN_CODE' }
  | { reason: 'EVENT_KEY_INVALID' }
  | { reason: 'SUBJECT_INVALID' }
  | { reason: 'PARAM_KEY_FORBIDDEN'; key: string }
  | { reason: 'PARAM_KEY_NOT_ALLOWED'; key: string }
  | { reason: 'PARAM_VALUE_INVALID'; key: string }
  | { reason: 'PARAMS_TOO_LARGE' };
