import type { BusinessDate } from '../../../core/business-date';

export type ReviewStatus = 'OPEN' | 'COMPLETED' | 'SUPERSEDED';

/** What the head of the department may decide about a tool; `PENDING` is the state before a decision. */
export type ReviewDecision = 'PENDING' | 'STILL_NEEDED' | 'NOT_NEEDED' | 'NEEDS_NEW_TOOL';
export type HeadDecision = Exclude<ReviewDecision, 'PENDING'>;

/** Why nobody can decide a review yet: the department it was opened for has no head today. */
export type WaitingReason = 'NO_HEAD';

/**
 * Where a review came from: the transfer of the person to another department, or the closing of the seat baseline at the setup, when
 * a person holds a seat on a subscription another department owns (F21). Both are decided by the head of the department of the person
 * today; only the source of the revocation a decision opens differs.
 */
export type ReviewOrigin = 'TRANSFER' | 'POST_SETUP';

export interface ReviewRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  transferId: string | null;
  placementId: string;
  departmentId: string;
  effectiveOn: BusinessDate;
  dueOn: BusinessDate;
  status: ReviewStatus;
  openedAt: Date;
  completedAt: Date | null;
  overdueNoticedAt: Date | null;
}

/** A review with the number of its lines that still wait for a decision and the number of all of them. */
export interface ReviewSummaryRecord extends ReviewRecord {
  pendingItems: number;
  totalItems: number;
}

export interface ReviewItemRecord {
  reviewId: string;
  assignmentId: string;
  planId: string;
  position: number;
  grantReason: string | null;
  decision: ReviewDecision;
  decidedByEmployeeId: string | null;
  decidedAt: Date | null;
  newToolNote: string | null;
  revocationTaskId: string | null;
}

/** A line the review is opened with: a personal right the person holds, whatever kind and whatever any list says (`QĐ-89b`). */
export interface NewReviewItem {
  assignmentId: string;
  planId: string;
  grantReason: string | null;
}

export interface NewReview {
  organizationId: string;
  employeeId: string;
  transferId: string | null;
  placementId: string;
  departmentId: string;
  effectiveOn: BusinessDate;
  dueOn: BusinessDate;
  items: NewReviewItem[];
}

/** Who sees which reviews: the IT Admin all of them, a head those of the department they head today, anyone else none. */
export type ReviewScope = { kind: 'ALL' } | { kind: 'DEPARTMENT'; departmentId: string } | { kind: 'NONE' };

export interface ReviewListFilter {
  scope: ReviewScope;
  status?: ReviewStatus;
  departmentId?: string;
  employeeId?: string;
  /** Only the open reviews past their deadline on `today`. */
  overdue?: boolean;
  today: BusinessDate;
  page: number;
  pageSize: number;
}

export interface ReviewListQuery {
  status?: ReviewStatus;
  departmentId?: string;
  employeeId?: string;
  overdue?: boolean;
  page: number;
  pageSize: number;
}

/** A line a head said is still needed (`STILL_NEEDED`, T-6): the old seat waits for the new Request of the department of the person. */
export interface StillNeededLine {
  reviewId: string;
  organizationId: string;
  departmentId: string;
  employeeId: string;
  /** Null for a review that did not follow a transfer (the post-setup review). */
  transferId: string | null;
  assignmentId: string;
  planId: string;
  decidedByEmployeeId: string;
}

export interface DecisionInput {
  assignmentId: string;
  decision: HeadDecision;
  newToolNote?: string;
}
