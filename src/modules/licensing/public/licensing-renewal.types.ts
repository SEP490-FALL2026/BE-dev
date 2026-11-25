import type { BusinessDate } from '../../../core/business-date';
import type { AssignmentKind, AssignmentSource } from './licensing.types';

/** The seat a renewal is asked for, as it is when it is read under its lock: what the renewal depends on and nothing else. */
export interface AssignmentFacts {
  assignmentId: string;
  employeeId: string;
  planId: string;
  subscriptionId: string | null;
  kind: AssignmentKind;
  source: AssignmentSource;
  effectiveFrom: BusinessDate;
  validUntil: BusinessDate | null;
  expectedEndDate: BusinessDate | null;
  /** Personal commitment months (`1 | 12`) for subscription-free K1 rights; null otherwise. */
  personalCommitmentMonths?: 1 | 12 | null;
  /** Billing anchor date (`YYYY-MM-DD`) for subscription-free K1 rights; null otherwise. */
  billingAnchorOn?: BusinessDate | null;
  /** Not ended, not failed and not cancelled. */
  open: boolean;
  /** The first day of the records that follow one another without a break up to this one (itself when it follows none). */
  chainStartsOn: BusinessDate;
  /** What the grant it was made for is: none (a baseline row), done, or still to be done or failed. */
  grant: 'NONE' | 'COMPLETED' | 'NOT_COMPLETED';
  /** The request the grant of the seat answered for; null for a seat no grant made. */
  grantRequestId: string | null;
  /** A revocation of it is under way (not closed as failed, not cancelled). */
  revocationLive: boolean;
  /** Another record already follows it. */
  hasSuccessor: boolean;
}

/** What a renewal asks licensing to write: the seat, the end it must still have, the new end, and the request it is done for. */
export interface RenewAssignmentInput {
  assignmentId: string;
  requestId: string;
  /** The end the request was made against: a seat whose end changed since is not renewed. */
  previousExpectedEndDate: BusinessDate;
  /** The last day of the new period; null for a right that goes on with no end (_Dùng lâu dài_, `QĐ-111l`). */
  newExpectedEndDate: BusinessDate | null;
  now: Date;
}

/** The renewal that was written: the old record ended on `endsOn`, and the new one begins that day. */
export interface RenewedAssignment {
  previousAssignmentId: string;
  successorAssignmentId: string;
  endsOn: BusinessDate;
}

/** The request for a renewal that has not been decided, as the queue of the rights that have ended shows it. */
export interface PendingRenewal {
  requestId: string;
  /** The state of the request, as the module of requests names it. */
  state: string;
  /** The request was approved and the IT Admin has still to extend the right: the end it moves to is not written yet (R-27). */
  approved: boolean;
}

/** The period a renewal is decided on, as the module that owns budgets and costs reads it to build the snapshot of the decider. */
export interface RenewalFinancialSubject {
  subscriptionId: string;
  /** The day the next period would begin (the renewal date, else the day after the end): its fiscal year is the one shown. */
  renewalOn: BusinessDate | null;
  purchasedQuantity: number | null;
  /** In minor units of its currency, as the catalog keeps it. */
  unitPrice: { amountMinor: bigint; currency: string } | null;
}

/**
 * What the decider sees of money when deciding a renewal (`US-11-02` AC-4, AC-5): the budget of the Cost Center of the owner
 * department for the fiscal year of the renewal day, read as figures of the effective cost, and the effective cost of the period.
 * Amounts are decimal strings of the currency named; a figure that the source cannot give is null, never 0. Frozen with the
 * decision, so a later change of a budget leaves what the decider saw as it was.
 */
export interface RenewalFinancialSnapshot {
  status: 'BUDGET' | 'NO_BUDGET' | 'NO_COST_CENTER';
  costCenterId: string | null;
  fiscalYear: number | null;
  currency: string | null;
  budget: string | null;
  spent: string | null;
  committed: string | null;
  remaining: string | null;
  pendingRequests: string | null;
  /** The effective cost of the next period and the deductible tax beside it, never added to it. */
  periodEffectiveCost: string | null;
  periodDeductibleTax: string | null;
  asOf: string;
}

/** Supplied by the module that owns budgets and costs; licensing never reads their tables. */
export interface RenewalFinancialReader {
  snapshotOf(subject: RenewalFinancialSubject): Promise<RenewalFinancialSnapshot>;
}

/** What the evidence of use says of one seat, when a source of it exists (G7): the last activity seen and whether a rule flagged it. */
export interface RenewalSeatUsage {
  lastActivityOn: BusinessDate | null;
  /** A waste rule (`G3`/`G4`) has an open recommendation for this seat. */
  flagged: boolean;
}

/** Supplied by the owner of usage evidence once it exists; with none, the renewal says the usage cannot be judged. */
export interface RenewalUsageReader {
  seatUsageOf(assignmentIds: readonly string[]): Promise<Map<string, RenewalSeatUsage>>;
}
