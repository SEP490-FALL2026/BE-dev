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
 * to the notices of the requests of return and renewal and the verdict on a service account. The notices of the organization
 * and of personnel events (a profile, a recorded event, a `BM-09`, a role holder who leaves, a review that is due,
 * an IT Admin who works on their own task) and those of the budget loops (a version that waits for a decision, a proposal
 * sent or given back, a request that waits for Finance or for a version) are the last two groups.
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
  // Organization and personnel: ids and codes only.
  'EMPLOYEE_PROFILE_CREATED',
  'EMPLOYEE_PROFILE_UPDATED',
  'PERSONNEL_EVENT_RECORDED',
  'PERSONNEL_NOTICE_RECEIVED',
  'PERSONNEL_NOTICE_OVERDUE',
  'ABRUPT_DEPARTURE_RECORDED',
  'ROLE_HOLDER_LEAVING',
  'TRANSFER_REVIEW_DUE',
  'IT_ADMIN_SELF_EXECUTED',
  // The budget loops (`US-12-15` AC-24): ids, years and the reason the people concerned already read; no figure.
  'BUDGET_VERSION_AWAITING_DECISION',
  'BUDGET_PROPOSAL_SUBMITTED',
  'BUDGET_PROPOSAL_RETURNED',
  'BUDGET_VERSION_DECIDED',
  // Not given any more (Finance has no review of a request, `QĐ-97c`): the codes stay so that a notice already in an inbox still reads.
  'REQUEST_FINANCE_REVIEW_OPENED',
  'REQUEST_RETURNED_BY_FINANCE',
  'REQUEST_AWAITING_BUDGET',
  'REQUEST_BUDGET_VERSION_ENDED',
  // The check of the budget of a request (`BR-MF1-06g`, `BR-MF1-07c`): it uses the reserve and waits for the head, it is blocked, it went back at the decision.
  'REQUEST_RESERVE_CONFIRMATION_NEEDED',
  'REQUEST_BUDGET_BLOCKED',
  'REQUEST_RETURNED_AT_DECISION',
  'BUDGET_VERSION_CLOSED_UNAPPROVED',
  'BUDGET_PROPOSAL_CLOSED_YEAR_END',
  'BUDGET_PROPOSAL_TASK_ASSIGNED',
  'BUDGET_PROPOSAL_TASK_WAITING',
  'BUDGET_CYCLE_OPENED',
  'BUDGET_DEPARTMENT_CEILING_PUBLISHED',
  // The deadlines of the cycle (`QĐ-103i`, `R-I05`): a head who has not proposed, the departments nobody heads, how many departments have
  // not proposed, the versions still waiting after the decision deadline, a department with no Cost Center yet, and a head named after a
  // version was built from the baseline.
  'BUDGET_PROPOSAL_DEADLINE_REMINDER',
  'BUDGET_NO_HEAD_AT_DEADLINE',
  'BUDGET_SUBMISSION_DEADLINE_PASSED',
  'BUDGET_DECISION_DEADLINE_REMINDER',
  'BUDGET_COST_CENTER_SETUP_DUE',
  'BUDGET_BASELINE_VERSION_HEAD_ASSIGNED',
  // The alerts of the rights (`a03-license-inbox-alerts`, `FR-5.14`): a right about to end, a handover not confirmed, a service
  // account whose person leaves, a person who left and keeps a K1 access to the end of the paid period. Ids, codes and days only.
  // The codes of the handover and of the service account are read only (`QĐ-110g`, `QĐ-110m`): nothing writes one any more, a row of
  // an inbox that holds one still reads.
  'LICENSE_EXPIRY_REMINDER',
  // The window of the renewal of a right opened (BR-MF1-08a): told once to the holder and the head of their department.
  'RENEWAL_WINDOW_OPENED',
  'HANDOVER_CONFIRMATION_DUE',
  'HANDOVER_CONFIRMATION_OVERDUE',
  'SERVICE_ACCOUNT_RESPONSIBLE_DUE',
  'SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE',
  'LEAVER_K1_ACCESS_RUNS_ON',
  // A seat still held by a person who left (`G2`, `US-10-01` AC-2): told once to the IT Admin in charge.
  'GHOST_SEAT_G2_DETECTED',
  // The queue of the head of the department (`qd103-ghost-seat-manager-decision`, `FR-4.12`): new recommendations (one a week), the same told to
  // the IT Admin in charge for the action tier, a decision past due, a department with no head, a reclaim the IT Admin returned, an exemption ending.
  'GHOST_SEAT_NEW',
  'GHOST_SEAT_ACTION_TIER',
  'GHOST_SEAT_DECISION_OVERDUE',
  'GHOST_SEAT_WAITING_FOR_HEAD',
  'GHOST_SEAT_RETURNED',
  'GHOST_SEAT_EXEMPTION_ENDING',
  // The revocation of a seat that is coming, told to the person who holds it, and one that no longer applies (`BR-MF5-04`, `US-10-06` AC-2).
  'REVOCATION_UPCOMING',
  'REVOCATION_CANCELLED',
  // The renewal of a subscription (EP-11): the milestones, the quality of the contract data, the case and its deadline.
  'SUBSCRIPTION_RENEWAL_ALERT',
  'SUBSCRIPTION_RENEWAL_DATA_QUALITY',
  'SUBSCRIPTION_RENEWAL_PROPOSED',
  'SUBSCRIPTION_RENEWAL_DECIDED',
  'SUBSCRIPTION_RENEWAL_LATE',
  'SUBSCRIPTION_AUTO_RENEWAL_INCIDENT',
  'SUBSCRIPTION_EXPIRY_MARKED',
  // The usage of an application is tracked from a vendor report (`qd103-vendor-usage-import`, `US-08-05` AC-2): told to each person who holds it.
  'USAGE_TRACKING_NOTICE',
  // Every vendor report of an application is older than a week, so no seat of it can be judged unused (`qd103-ghost-seat-g3-g4`, `Q-91`): told once to the IT Admin.
  'USAGE_SOURCE_STALE',
  // MF-2 and MF-3 and what goes with them (`QĐ-110`, `QĐ-111`): a revocation past its day, a person blocked and the account not locked in
  // time, the grace of a transfer (begun, ending, the rights being taken back), a request cancelled because its beneficiary is gone, the
  // list of software of a department, the vendor admins of a plan below the minimum, a department nobody heads, seats added to a pool
  // subscription, and the handover of an IT Admin's responsibilities that waits. Ids, days and counts only.
  'REVOCATION_OVERDUE',
  'DEPARTURE_ACCESS_BLOCKED',
  'ACCOUNT_LOCK_OVERDUE',
  'TRANSFER_GRACE_STARTED',
  'TRANSFER_GRACE_ENDING',
  'TRANSFER_RIGHTS_REVOKING',
  'REQUEST_CANCELLED_BENEFICIARY_GONE',
  // The grant of a request of that person is being carried out, so the system did not close it: the IT Admin checks the vendor and closes it.
  'REQUEST_BENEFICIARY_GONE_IT_CHECK',
  'DEPARTMENT_SOFTWARE_PROPOSED',
  'DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED',
  'VENDOR_ADMINS_BELOW_MINIMUM',
  'DEPARTMENT_WITHOUT_HEAD',
  'SUBSCRIPTION_SEATS_INCREASED',
  'IT_ADMIN_HANDOVER_PENDING',
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

/**
 * A notice kept for a department that has no head yet: judged by the same table as an inbox notice, written in the
 * transaction of the event, and handed to the first head the Super Admin names.
 */
export interface HeldDepartmentNotificationInput {
  organizationId: string;
  departmentId: string;
  code: InAppNotificationCode;
  subject: { type: string; id: string } | null;
  params: Record<string, InAppParamValue>;
  /** Keeps the notice once for the event: the same key again holds nothing. At most 200 characters. */
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
