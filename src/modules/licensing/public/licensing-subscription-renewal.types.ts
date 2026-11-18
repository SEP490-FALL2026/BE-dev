import type { BusinessDate } from '../../../core/business-date';

/** The period a renewal is decided on, as the module that owns budgets and costs reads it to build the snapshot of the decider. */
export interface RenewalFinancialSubject {
  subscriptionId: string;
  ownerDepartmentId: string;
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
