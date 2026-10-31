import type { Money } from '../../../core/money/money';
import type { BusinessDate } from '../../../core/business-date';
import type { AccessRequestBranchCode, RequestPolicy } from './access-request.policy';
import type { BillingCycleCode, MissingPriceReason, PaymentPeriod } from './pricing.policy';
import type { WaitingReason } from './routing.policy';
import type { LineRecord, ReadableCancelCause } from './group-request.types';

/** The shapes the repository of requests reads and writes; the repository re-exports them, so importers do not change. */

/**
 * `DRAFT` is a paid request saved before the finance gates: it has no Cost Center, no moment it was sent, no step, no check
 * and no commitment. It is neither listed nor readable as a request (`AccessRequestRepo.findById` and every other read filter it out and
 * no wire of a request carries it): only `RequestDraftRepo` and the four draft operations see it.
 */
export type AccessRequestState =
  | 'DRAFT'
  | 'PENDING'
  | 'WAITING_CONTROLLED'
  | 'AWAITING_EXECUTION'
  | 'AWAITING_IT_ASSESSMENT'
  | 'AWAITING_SPEND_SUBMISSION'
  | 'AWAITING_FINANCE_REVIEW'
  | 'AWAITING_BUDGET'
  | 'AWAITING_SPEND_DECISION'
  | 'REJECTED'
  | 'IT_REJECTED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'AWAITING_IT_CLOSE'
  | 'WITHDRAWN'
  | 'CANCELLED';
/** A need step is held or waiting, then decided, or closed because the request ended without a decision (`US-05-08`). */
export type NeedStepState = 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED' | 'CLOSED';
export type DeciderRole = 'MANAGER' | 'SPENDING_APPROVER' | 'FALLBACK_APPROVER' | 'CONFLICT_SUBSTITUTE';

/** What the request costs: nothing for internal software, a priced amount and its payments, or a missing price. */
export interface PricingRecord {
  status: 'NOT_APPLICABLE' | 'PRICED' | 'MISSING';
  missingReason: MissingPriceReason | null;
  expectedSpendOn: BusinessDate | null;
  budgetYear: number | null;
  amount: Money | null;
  unitPrice: Money | null;
  billingCycle: BillingCycleCode | null;
  schedule: PaymentPeriod[] | null;
}

/** What the request of a service account adds to a request (`US-05-21`); neither a password nor a key is kept. */
export interface ServiceAccountRecord {
  purpose: string;
  /** The sender's guess of the identifier at the vendor; the one that counts is entered by the IT Admin when granting. */
  expectedIdentifier: string;
  /** The person who answers for the account: the sender. */
  responsibleEmployeeId: string;
  boundaryState: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  boundaryReason: string | null;
  boundaryDecidedByEmployeeId: string | null;
  boundaryDecidedAt: Date | null;
  /** The IT Admin who decided answers for the account themselves and no other usable IT Admin could (`QĐ-77m`). */
  boundarySelfExecuted: boolean;
}

/** What a request for the renewal of a right adds (`US-05-14`): the right it renews, the ends, and what approval wrote. */
export interface RenewalRecord {
  assignmentId: string;
  previousExpectedEndDate: BusinessDate;
  newExpectedEndDate: BusinessDate;
  /** The months the right would run on without a break once renewed; over twelve needs the confirmation of the head. */
  consecutiveMonths: number;
  /** The record that follows the old one, written when the request was approved; null until then. */
  successorAssignmentId: string | null;
  appliedAt: Date | null;
}

export type AccessRequestKind = 'GRANT' | 'SERVICE_ACCOUNT' | 'RENEWAL' | 'GROUP_GRANT';

export interface NewAccessRequest {
  /** A request for a service account also gets its row of detail, written in the same transaction by its own repository. */
  type?: AccessRequestKind;
  organizationId: string;
  branch: AccessRequestBranchCode;
  state: AccessRequestState;
  /** Null for a proposal of software that is not in the catalog yet. */
  planId: string | null;
  requesterEmployeeId: string;
  /** The people it is for, in order: one today. */
  beneficiaryEmployeeIds: readonly string[];
  departmentId: string;
  /** Null only for a free internal request of a department that has no Cost Center in use (`QĐ-87g(2)`). */
  costCenterId: string | null;
  businessReason: string;
  termMonths: number;
  projectLabel: string | null;
  pricing: PricingRecord;
  policy: RequestPolicy;
  delegatedBatchId?: string | null;
  expectedEndDate?: BusinessDate | null;
  createdByAppUserId: string;
  now: Date;
  needStep: NewNeedStep;
  /**
   * The draft this request is made from: the row of the draft becomes the request, so it is the same request from the
   * day it was saved. Absent for a request written new. The caller holds the lock of the draft (`RequestDraftRepo.lock`).
   */
  draftId?: string | null;
}

/** A need step as it is written: the first one with the request, the others after it (`addNeedStep`). */
export interface NewNeedStep {
  state: NeedStepState;
  assigneeEmployeeId: string | null;
  routingRow: number;
  waitingReason: WaitingReason | null;
  samePersonAsSpend: boolean;
  slaWorkingDays: number;
}

export interface NeedStepRecord {
  id: string;
  state: NeedStepState;
  assigneeEmployeeId: string | null;
  routingRow: number;
  waitingReason: WaitingReason | null;
  samePersonAsSpend: boolean;
  slaWorkingDays: number;
  createdAt: Date;
  assignedAt: Date | null;
  decidedAt: Date | null;
}

/** A need step with the record of the decision that was taken on it, for a request that has more than one. */
export interface NeedStepWithDecision extends NeedStepRecord {
  decision: ApprovalRecordRecord | null;
}

/** The electronic approval record of a decision (never changed once written). */
export interface ApprovalRecordRecord {
  decision: 'APPROVED' | 'REJECTED';
  decidedByEmployeeId: string;
  deciderRole: DeciderRole;
  reason: string | null;
  termConfirmationReason: string | null;
  decidedAt: Date;
}

export interface NewNeedDecision {
  organizationId: string;
  requestId: string;
  stepId: string;
  requestState: AccessRequestState;
  departmentId: string;
  record: ApprovalRecordRecord;
}

/** The withdrawal of a request: who asked, when, why, and when it ended (null while the IT Admin has still to close the task). */
export interface WithdrawalRecord {
  requestedAt: Date;
  requestedByEmployeeId: string;
  reason: string | null;
  withdrawnAt: Date | null;
}

/** The closing of a request whose beneficiary left: who closed it, when, why and the note they gave (`US-03-04` AC-25). */
export interface CancellationRecord {
  cancelledAt: Date;
  cancelledByEmployeeId: string;
  cause: ReadableCancelCause;
  note: string | null;
}

export interface AccessRequestRecord {
  id: string;
  organizationId: string;
  type: AccessRequestKind;
  branch: AccessRequestBranchCode;
  state: AccessRequestState;
  planId: string | null;
  requesterEmployeeId: string;
  departmentId: string;
  /** Null only for a free internal request of a department that has no Cost Center in use (`QĐ-87g(2)`): nothing is charged. */
  costCenterId: string | null;
  businessReason: string;
  termMonths: number;
  projectLabel: string | null;
  pricing: PricingRecord;
  /** The line of the plan of the budget it is attached to; null when it is attached to none. */
  planLine: { versionId: string; position: number; confirmed: boolean } | null;
  /** The head chose "outside the plan": a flag for Finance and the approver, never an exception. */
  offPlan: boolean;
  delegatedBatchId: string | null;
  expectedEndDate: BusinessDate | null;
  policy: RequestPolicy;
  submittedAt: Date;
  /** Null unless the request was withdrawn or is waiting for the IT Admin to close the task of its grant. */
  withdrawal: WithdrawalRecord | null;
  /** Null unless the IT Admin cancelled the request because its beneficiary left. */
  cancellation: CancellationRecord | null;
  /** Set for a request for a service account and for no other. */
  serviceAccount: ServiceAccountRecord | null;
  /** Set for a request for the renewal of a right and for no other. */
  renewal: RenewalRecord | null;
  beneficiaryEmployeeIds: string[];
  /** The first need step: the only one of a request for one person, and the one the single-person routes decide. */
  needStep: NeedStepRecord;
  /** Every need step in order; one for any request but a request for a group, which has one for the others and one for the head. */
  needSteps: NeedStepWithDecision[];
  needDecision: ApprovalRecordRecord | null;
  /** The people of a request for a group, in the order they were named, each with their own state; empty for any other request. */
  lines: LineRecord[];
}

/** What the person already holds of the plan: the seat that makes asking for it again pointless (`US-05-01` AC-2). */
export interface HeldAccess {
  assignmentId: string;
  effectiveFrom: BusinessDate;
  validUntil: BusinessDate | null;
}

/**
 * Why the IT Admin may not close a request because its beneficiary left (`US-03-04` AC-25). The checks run in this order, so a request
 * has one answer; the task of the grant is judged by licensing, in the transaction (`EVIDENCE_REQUIRED` is its answer).
 */
export type CancellationRefusal =
  /** Refused, rejected, completed, failed, withdrawn or already cancelled: nothing is left to close. */
  | 'ALREADY_ENDED'
  /** The requester withdrew and the request waits for the IT Admin to close the task of its grant: that has its own way. */
  | 'WITHDRAWAL_PENDING'
  /**
   * A request for a group with more than one person still live: one of them leaving is not the end of the request, so the IT Admin
   * removes each person who left from their own line. A request whose last live line is the leaver's is that removal.
   */
  | 'GROUP_REQUEST_UNSUPPORTED'
  /** The person it is for still works, handing over included: the request is only listed until they have left. */
  | 'BENEFICIARY_NOT_LEFT'
  /**
   * The request is closed because its beneficiary was transferred, and they are not: they still sit in the department the request was
   * sent from, left the company, or the request is not a request of one person for access.
   */
  | 'BENEFICIARY_NOT_TRANSFERRED';

/** The states a request ends in: nothing is left to do for anybody (not `DRAFT`, which is not a request yet). */
export const ENDED_STATES: readonly AccessRequestState[] = [
  'REJECTED',
  'IT_REJECTED',
  'COMPLETED',
  'FAILED',
  'WITHDRAWN',
  'CANCELLED',
];

/**
 * The states of a request that is not open for the person it is for who left: at an end of its own, or waiting for the IT Admin to close
 * the task of a withdrawal (that has its own way).
 */
export const NOT_OPEN_FOR_LEAVER: readonly AccessRequestState[] = [...ENDED_STATES, 'AWAITING_IT_CLOSE'];

export type DelegationRefusal =
  /** The caller does not head the department they belong to today (`AC-11`). */
  | 'NOT_HEAD'
  /** The person is not in the department of the head: the request is refused at once, with no request for them (`US-05-03` row 7, `AC-5`). */
  | 'OUTSIDE_DEPARTMENT'
  /** The person has no work email yet (`AC-3`). */
  | 'EMAIL_REQUIRED'
  /** The person has left the company. */
  | 'BENEFICIARY_NOT_ACTIVE'
  /** A contractor, freelancer or intern needs the day the access ends (`AC-10`). */
  | 'END_DATE_REQUIRED'
  /** The day the access ends is before the day it can begin. */
  | 'END_DATE_TOO_EARLY'
  /** A long term is confirmed in so many words by whoever confirms the need (`OI-07a`). */
  | 'TERM_CONFIRMATION_REQUIRED';

/**
 * Where a request that costs money stands on its way to the spending approver, as the people with a part in it read it
 * (`US-06-14` AC-9, AC-13). It says what is waiting and, for a request that stopped, why: and it is never a figure of a
 * budget, a code of the check that is not a problem with the head's own data, or what is left (`QĐ-82m` `INF-06`).
 */
export type SpendStage =
  | 'NOT_SUBMITTED'
  | 'BLOCKED'
  | 'RETURNED_BY_FINANCE'
  | 'WAITING_FINANCE_REVIEW'
  | 'WAITING_BUDGET'
  | 'WAITING_SPEND_DECISION'
  /** The spending approver refused it, with the reason (`US-06-01` AC-4). */
  | 'REFUSED';
