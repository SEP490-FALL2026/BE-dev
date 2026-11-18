/**
 * The facts a history list of requests can be narrowed to beyond its state: sent through the one-step route, or with the reserve of the
 * budget confirmed by the head. The two are said on the row as `routing.mode` and `reserveUsed`, never as a figure.
 */
export const REQUEST_HISTORY_FLAGS = ['ONE_STEP', 'RESERVE_USED'] as const;
export type RequestHistoryFlag = (typeof REQUEST_HISTORY_FLAGS)[number];

/** The flags the Super Admin reads on the audit report: today only a request that no head approved the need of. */
export const REQUEST_AUDIT_FLAGS = ['NO_NEED_APPROVER'] as const;
export type RequestAuditFlag = (typeof REQUEST_AUDIT_FLAGS)[number];

/** The roles that read the history of the whole organization through `accessRequestList`, each within what its role reaches. */
export const OVERSIGHT_ROLES = ['IT_ADMIN', 'SPENDING_APPROVER', 'FINANCE'] as const;

/** A request flagged for the audit report, as the repository reads it: no price, no budget, no evidence, no reason the requester wrote. */
export interface AuditFlagRow {
  id: string;
  submittedAt: Date;
  state: string;
  requesterEmployeeId: string;
  departmentId: string;
  planId: string | null;
  oneStepReason: string | null;
}

/** The kinds of entry of the history of one request, each from one or more audit actions (`request-events.policy.ts`). */
export const REQUEST_EVENT_KINDS = [
  'SUBMITTED',
  'RESUBMITTED',
  'NEED_APPROVED',
  'NEED_REJECTED',
  'LINE_NEED_DECIDED',
  'RESERVE_CONFIRMED',
  'SPEND_APPROVED',
  'SPEND_REJECTED',
  'LINE_SPEND_DECIDED',
  'RETURNED_TO_REQUESTER',
  'ASSESSMENT_COMPLETED',
  'ASSESSMENT_REJECTED',
  'GRANT_STARTED',
  'GRANT_COMPLETED',
  'GRANT_FAILED',
  'WITHDRAWAL_REQUESTED',
  'WITHDRAWN',
  'CANCELLED',
  'RENEWAL_APPLIED',
] as const;
export type RequestEventKind = (typeof REQUEST_EVENT_KINDS)[number];
