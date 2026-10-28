import type { BusinessDate } from '../../core/business-date';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';

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

/** A budget of a Cost Center and a year changed in a way a request waiting on it must hear of. */
export interface BudgetVersionEvent {
  costCenterId: string;
  year: number;
  versionId: string;
}

/** A version the spending approver did not approve: refused, or sent back to Finance to look again. */
export interface BudgetRefusalEvent extends BudgetVersionEvent {
  decision: 'REJECTED' | 'CHANGES_REQUESTED';
}

/** A purchase window of a plan line moved in place; `versionIds` are all the versions of that Cost Center and year. */
export interface PlanLineMovedEvent {
  costCenterId: string;
  year: number;
  position: number;
  /** Why Finance moved it, as written on the history of the line. */
  reason: string;
  versionIds: readonly string[];
}

/**
 * What another context does when a budget changes. It runs in the transaction of the change, so a request is never left
 * waiting on a budget that has already moved, and a failure undoes the change as well. Budgets never import the context
 * that listens (ADR-0016): the listener registers itself when its module starts.
 */
export interface BudgetChangeListener {
  /**
   * Takes, before the budget year lock, the locks of the rows this listener will change for the Cost Center and the year when a
   * version is decided or the year is closed. The order of the whole system is the row of the request first, then the year (F31): a
   * listener that locked its rows only after the year lock would wait for a writer that holds its row and waits for the year.
   */
  lockWaiting(tx: DbTx, scope: { costCenterId: string; year: number }): Promise<void>;
  versionApproved(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetVersionEvent): Promise<void>;
  /**
   * The spending approver refused a version or sent it back to Finance: the year still has no new budget. `decision` is what
   * the approver decided, so a request that waits for the version is told which of the two it was.
   */
  versionRefused(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetRefusalEvent): Promise<void>;
  /**
   * The year-end closure closed a version that never became current (`QĐ-91e`, F62): the system does it, so there is no actor.
   * A version that was current stays as the reference budget of the year and is not told here.
   */
  versionExpired(tx: DbTx, event: BudgetVersionEvent): Promise<void>;
  planLineMoved(tx: DbTx, actor: AuthenticatedPrincipal, event: PlanLineMovedEvent): Promise<void>;
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

/** A context that knows whether the request a commitment is held for has ended, so that Finance may let the remainder go. */
export interface CommitmentReleaseGuard {
  canReleaseRemainder(requestId: string): Promise<boolean>;
}
