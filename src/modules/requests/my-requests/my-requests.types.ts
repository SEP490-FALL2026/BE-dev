import type { AccessRequestKind, AccessRequestState, NeedStepState } from '../access-request/access-request.types';
import type { AccessRequestBranchCode } from '../access-request/access-request.policy';
import type { WaitingReason } from '../access-request/routing.policy';
import type { CheckRecord } from '../spend/budget-check.repo';
import type { FinanceReviewRecord } from '../spend/finance-review.repo';

/** The state of a request that was sent: every state but `DRAFT`, which is not a request until it is sent. */
export type SentState = Exclude<AccessRequestState, 'DRAFT'>;

/** The two groups a person tells apart in "my requests": what is still going on and what is over (completed, refused, withdrawn...). */
export const MY_REQUEST_VIEWS = ['open', 'ended'] as const;
export type MyRequestView = (typeof MY_REQUEST_VIEWS)[number];

/** The kinds of request the list can be narrowed to, the same as the `type` of a request. */
export const MY_REQUEST_TYPES = [
  'GRANT',
  'SERVICE_ACCOUNT',
  'RENEWAL',
  'GROUP_GRANT',
] as const satisfies readonly AccessRequestKind[];

/** What the list is narrowed by; never by person: the person is the caller. */
export interface MyRequestFilter {
  requesterEmployeeId: string;
  /** Every state a row may have: a request that was sent, never a draft, narrowed by `view` and `state`. */
  states: readonly SentState[];
  type?: AccessRequestKind;
  /** The window of `submittedAt`: includes `from`, excludes `to`. */
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}

/** The first need step still held or waiting, else the first need step: where the request waits for the person who decides the need. */
export interface MyRequestNeedStep {
  state: NeedStepState;
  assigneeEmployeeId: string | null;
  waitingReason: WaitingReason | null;
}

/** A request of the caller as the repository reads it for a row of the list: no price, no check, no commitment, no reason. */
export interface MyRequestRow {
  id: string;
  type: AccessRequestKind;
  branch: AccessRequestBranchCode;
  state: SentState;
  planId: string | null;
  termMonths: number;
  submittedAt: Date;
  updatedAt: Date;
  /** Whether the chain of the request has a spend step: only then is there a stage on the way to the spending approver. */
  hasSpendStep: boolean;
  /** The one person it is for; null for a request for a group, whose people are read as lines. */
  beneficiaryEmployeeId: string | null;
  lineCount: number;
  needStepId: string;
  needStep: MyRequestNeedStep;
  withdrawal: { withdrawnAt: Date | null } | null;
}

/** The newest budget check of a request, as far as the stage of a request in the queue of its head needs it: no figure of a budget. */
export type QueuedCheck = Pick<CheckRecord, 'route' | 'staleCostEvidence' | 'ranAt'>;

/** The newest review of Finance of a request: how it ended and when. The note Finance wrote stays in the detail. */
export type QueuedReview = Pick<FinanceReviewRecord, 'outcome' | 'decidedAt'>;

/** What decides the stage of the requests of one page, read once for the page. */
export interface SpendStageFacts {
  checks: ReadonlyMap<string, QueuedCheck>;
  reviews: ReadonlyMap<string, QueuedReview>;
  /** The requests that hold an open Finance review step, and those that hold an open spend step. */
  openFinanceReview: ReadonlySet<string>;
  openSpendApproval: ReadonlySet<string>;
  /** The requests whose newest spend decision refused them, with what the approver wrote. */
  spendRefusals: ReadonlyMap<string, { reason: string | null }>;
}

/** The reasons a request that did not go on gives, read once for the page. */
export interface OutcomeFacts {
  /** What the person who decided the need wrote, by the id of the need step. */
  needRefusals: ReadonlyMap<string, string | null>;
  /** What the IT Admin wrote when they refused the software at the gate, by request. */
  assessmentRefusals: ReadonlyMap<string, string>;
}
