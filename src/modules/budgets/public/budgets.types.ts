import type { BusinessDate } from '../../../core/business-date';

/** The current budget of a Cost Center and a year, as the check of a request reads it (`US-06-12`). */
export interface YearBudgetFacts {
  versionId: string;
  currency: string;
  totalMinor: bigint;
  /** What the commitments attached to the budget hold now. */
  heldMinor: bigint;
  /** What has become an expense in the year. */
  spentMinor: bigint;
  /** A line is high value when it is over this share of what is left, in whole percent. */
  highValuePercent: number;
  /** Or when it is over this amount, whatever is left; null when the version sets none. */
  highValueAmountMinor: bigint | null;
}

/** A line of the plan a request is attached to, as the check reads it. */
export interface PlanLineFacts {
  costCenterId: string;
  year: number;
  /** The version the line is read from: the current one of its Cost Center and year, whichever version the request named. */
  versionId: string;
  windowFrom: BusinessDate;
  windowTo: BusinessDate;
}

/** A line of the current plan of a Cost Center and a year, as the head reads it to attach a request to it (`US-05-04` AC-12). */
export interface PlanLineSummary {
  position: number;
  description: string;
  planId: string | null;
  amountMinor: bigint;
  windowFrom: BusinessDate;
  windowTo: BusinessDate;
}

/** What a request holds against the budget of a Cost Center: one amount for each year its binding payments fall in. */
export interface CommitmentHoldInput {
  organizationId: string;
  requestId: string;
  costCenterId: string;
  /** The check the decision kept: the snapshot the commitments are made on. */
  snapshotCheckId: string;
  currency: string;
  now: Date;
  /** The cost that falls on the company in each year, in the reporting currency; none for a year that is only a forecast. */
  items: readonly { year: number; amountMinor: bigint }[];
}

/** A commitment as it was made: attached to the current budget of its year, or waiting for one. */
export interface HeldCommitment {
  id: string;
  year: number;
  amountMinor: bigint;
  attachedVersionId: string | null;
}

/** Why money held for a request goes back to the budget (`US-06-06`). Finance letting a remainder go has its own route. */
export type CommitmentReleaseReason =
  'REQUEST_CANCELLED' | 'REQUEST_WITHDRAWN' | 'GRANT_FAILED' | 'PARTICIPANT_WITHDRAWN';

/** What goes back to the budget when a request ends or a share of it is withdrawn. */
export interface CommitmentReleaseInput {
  requestId: string;
  reason: CommitmentReleaseReason;
  /**
   * Absent: everything still held goes back, and the part that already became an expense stays. Present: these amounts go
   * back, one for each year named, which is how a share, or what is not yet spent, is released.
   */
  amounts?: readonly { year: number; amountMinor: bigint }[];
  now: Date;
}

/** A commitment after money went back: what was released now, what it still holds, and whether none is left. */
export interface ReleasedCommitment {
  id: string;
  year: number;
  releasedMinor: bigint;
  heldMinor: bigint;
  released: boolean;
}
