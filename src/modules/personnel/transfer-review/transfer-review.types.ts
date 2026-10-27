import type { BusinessDate } from '../../../core/business-date';

export type ReviewStatus = 'OPEN' | 'COMPLETED' | 'SUPERSEDED';

/** What the head of the department may decide about a tool; `PENDING` is the state before a decision. */
export type ReviewDecision = 'PENDING' | 'STILL_NEEDED' | 'NOT_NEEDED' | 'NEEDS_NEW_TOOL';
export type HeadDecision = Exclude<ReviewDecision, 'PENDING'>;

/** Why nobody can decide a review yet: the department it was opened for has no head today. */
export type WaitingReason = 'NO_HEAD';

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

/** A line the review is opened with: a tool the person holds that is outside the standard toolset. */
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

export interface DecisionInput {
  assignmentId: string;
  decision: HeadDecision;
  newToolNote?: string;
}
