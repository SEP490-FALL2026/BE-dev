/** The current budget of a Cost Center and a year, as the check of a request reads it (`US-06-12`). */
export interface YearBudgetFacts {
  versionId: string;
  currency: string;
  /** Base and reserve together. */
  totalMinor: bigint;
  /** The base of the approved version: what the department may spend without the reserve (`BR-MF1-06e`). */
  baseMinor: bigint;
  /** The reserve of the approved version: what is left to use, with the head's confirmation, once the base is gone. */
  reserveMinor: bigint;
  /** What the commitments attached to the budget hold now. */
  heldMinor: bigint;
  /** What has become an expense in the year. */
  spentMinor: bigint;
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
  /** The cost that falls on the company in the one year, in the reporting currency: exactly one entry, of the current year (`BR-MF1-07d`). */
  items: readonly { year: number; amountMinor: bigint }[];
  /**
   * What one seat costs a month in the reporting currency, rounded up: what the release by day takes from (`RV-07`, `M-10`). Null or absent
   * for a price that is not by the month (a one-time price), whose commitment is never released by day.
   */
  seatMonthlyMinor?: bigint | null;
}

/**
 * What the pass of 01/01 holds for the requests whose right goes on into the new year or that were approved and not yet granted (`FR-5.8`(6),
 * `QĐ-109a`): one commitment for each request, for the year, in the Cost Center of the department that bears it, whatever the budget says.
 */
export interface YearStartHoldInput {
  organizationId: string;
  /** The year that begins; the day it is made on is only for the record. */
  year: number;
  now: Date;
  items: readonly {
    requestId: string;
    costCenterId: string;
    /** The reporting currency: the amounts are converted by the caller, as for the commitment of an approval. */
    currency: string;
    /** The cost of the year, above nothing. */
    amountMinor: bigint;
    /** What one seat costs a month, kept for the release by day of a later slice. */
    seatMonthlyMinor: bigint;
  }[];
}

/**
 * What the pass held: the commitments it made, the requests that already held one for the year (left as they were), and those it refused
 * because the approved budget of the year is in another currency than theirs (nothing of two currencies is added together).
 */
export interface YearStartHoldResult {
  created: { requestId: string; commitmentId: string; costCenterId: string; attachedVersionId: string | null }[];
  alreadyHeld: string[];
  refused: { requestId: string; reason: 'CURRENCY_MISMATCH' }[];
}

/** A commitment as it was made: attached to the current budget of its year, or waiting for one. */
export interface HeldCommitment {
  id: string;
  year: number;
  amountMinor: bigint;
  attachedVersionId: string | null;
}

/**
 * Why money held for a request goes back to the budget (`US-06-06`). Finance letting a remainder go has its own route. `REVOKED` and
 * `LATE_GRANT` are the release by day of one seat (`RV-07`, `M-06`, `M-10`): the right was taken back, or granted after its commitment began.
 * `GRANTED_FROM_POOL`: a K4 key was given from the pool, so the price held is not spent (`QĐ-106d`).
 */
export type CommitmentReleaseReason =
  | 'REQUEST_CANCELLED'
  | 'REQUEST_WITHDRAWN'
  | 'GRANT_FAILED'
  | 'PARTICIPANT_WITHDRAWN'
  | 'REVOKED'
  | 'LATE_GRANT'
  | 'GRANTED_FROM_POOL'
  | 'TRANSFER_EFFECTIVE';

/** What goes back to the budget when a request ends or a share of it is withdrawn. */
export interface CommitmentReleaseInput {
  requestId: string;
  reason: CommitmentReleaseReason;
  /**
   * Absent: everything still held goes back, and the part that already became an expense stays. Present: these amounts go
   * back, one for each year named, which is how a share, or what is not yet spent, is released.
   */
  amounts?: readonly { year: number; amountMinor: bigint }[];
  /**
   * What caused it, kept on the release (`revocationTask:<id>`, `grantTask:<id>`): a commitment that already gave money back for the same
   * reason and reference gives nothing again, so the event is released once whatever repeats it.
   */
  reference?: string;
  now: Date;
}

/**
 * A commitment of a request as the release by day of one seat reads it (`RV-07`), with its row locked until the transaction ends: the year,
 * where it came from (the approval, or the pass of 01/01, which counts from January), what one seat costs a month in it (null when it was
 * made before that was kept, or for a one-time price) and what it still holds.
 */
export interface SeatCommitment {
  requestId: string;
  year: number;
  origin: 'APPROVAL' | 'YEAR_START';
  seatMonthlyMinor: bigint | null;
  heldMinor: bigint;
  /**
   * The references of the releases this commitment already gave the day a transfer took effect (reason `TRANSFER_EFFECTIVE`,
   * `transfer:<transferId>:assignment:<assignmentId>`), read from its ledger under the same lock: what tells the release by day of a right
   * that this commitment has given back for it already, whoever asks for the revocation (MF3-B review, D-86).
   */
  transferReleases: readonly string[];
}

/** A commitment after money went back: what was released now, what it still holds, and whether none is left. */
export interface ReleasedCommitment {
  id: string;
  year: number;
  releasedMinor: bigint;
  heldMinor: bigint;
  released: boolean;
}

/** What one commitment was made for, as another context counts it. */
export interface CommittedAmount {
  requestId: string;
  amountMinor: bigint;
  currency: string;
}

/** What a request still holds and has not spent or given back, in one currency: the part of a commitment that going back to the budget would free. */
export interface HeldAmount {
  requestId: string;
  currency: string;
  heldMinor: bigint;
}
