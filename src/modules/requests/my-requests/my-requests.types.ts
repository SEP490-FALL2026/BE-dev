import type { BusinessDate } from '../../../core/business-date';
import type {
  AccessRequestKind,
  AccessRequestState,
  NeedStepState,
  ReadableNeedWaitingReason,
} from '../access-request/access-request.types';
import type { AccessRequestBranchCode } from '../access-request/access-request.policy';
import type { CheckRecord } from '../spend/budget-check.repo';

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

/** Which requests of the caller "my requests" lists: those they sent (the default), those they are one of the people for, or both. */
export const MY_REQUEST_INVOLVEMENTS = ['SENT', 'FOR_ME', 'ALL'] as const;
export type MyRequestInvolvement = (typeof MY_REQUEST_INVOLVEMENTS)[number];

/**
 * Whose requests a page is read from. The first three are the caller's own; `DEPARTMENT` is every request sent from one department;
 * `OVERSIGHT` is what a role that watches the whole organization reads: every request, or those a spend step was opened on, or those
 * whose spend was approved (the union of what the roles of the caller give).
 */
export type RequestScope =
  | { kind: 'SENT_BY' | 'FOR' | 'SENT_BY_OR_FOR'; employeeId: string }
  | { kind: 'DEPARTMENT'; departmentId: string }
  | { kind: 'OVERSIGHT'; all: boolean; spendStepOpened: boolean; spendApproved: boolean };

/** What a page is narrowed by within its scope; only the routes of the people who oversee requests name a person or a department. */
export interface MyRequestFilter {
  scope: RequestScope;
  /** Sent by or for this person. */
  employeeId?: string;
  departmentId?: string;
  /** Requests sent through the one-step route. */
  oneStep?: boolean;
  /** Requests for which the head confirmed the reserve of the budget. */
  reserveUsed?: boolean;
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
  waitingReason: ReadableNeedWaitingReason | null;
}

/** A request of the caller as the repository reads it for a row of the list: no price, no check, no commitment, no reason. */
export interface MyRequestRow {
  routing?: import('../access-request/routing.policy').RequestRouting;
  id: string;
  type: AccessRequestKind;
  branch: AccessRequestBranchCode;
  state: SentState;
  requesterEmployeeId: string;
  departmentId: string;
  planId: string | null;
  termMonths: number | null;
  expectedEndDate: BusinessDate | null;
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

/** The newest budget check of a request, as far as the stage of a request in the queue of its head needs it: no figure of what is left. */
export type QueuedCheck = Pick<
  CheckRecord,
  'outcome' | 'route' | 'blockReasons' | 'staleCostEvidence' | 'overBaseByMinor' | 'overByMinor' | 'currency'
>;

/** What decides the stage of the requests of one page, read once for the page. */
export interface SpendStageFacts {
  checks: ReadonlyMap<string, QueuedCheck>;
  /** The requests that hold an open spend step. */
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

/** The line of the caller in a request for a group: its state and why it ended without a grant, if it did. */
export interface MyLine {
  state: import('../access-request/group-request.types').LineState;
  outcomeReason: string | null;
}
