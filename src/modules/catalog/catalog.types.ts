import type { BusinessDate } from '../../core/business-date';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
/** What a seat is held against: a subscription of a paid plan, or an internal plan that has no subscription. */
export type SeatTargetRef = { subscriptionId: string } | { planId: string };

/** What holds a set of plans: a bounded list of assignments and the counts that are not bounded. */
export interface OpenSeatHoldings {
  items: OpenSeatHolding[];
  total: number;
  byPlan: { planId: string; count: number }[];
}

/** An assignment that holds, or will hold, a seat: the facts a screen or a rule needs to name it. */
export interface OpenSeatHolding {
  assignmentId: string;
  employeeId: string;
  planId: string;
  subscriptionId: string | null;
}

/**
 * What the catalog needs to know of the seats that licensing holds, without importing it (ADR-0013 item 4): `licensing`
 * hands it over when its module starts. An assignment holds a seat from the day it is made until it ends or fails; one
 * that has not ended counts, a future start included.
 */
export interface SeatOccupancyReader {
  /** The assignments of the subscription that have not ended and have not failed as of `day`. */
  occupiedBySubscription(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<number>;
  /** How many different people hold an assignment on these plans that has not ended and has not failed. */
  openHolderCount(planIds: readonly string[], day: BusinessDate): Promise<number>;
  /**
   * The first `limit` assignments on these plans that have not ended and have not failed, how many there are in all and
   * how many per plan (`LD-06`: never every seat); with `tx`, read in the caller's transaction.
   */
  openAssignmentsOfPlans(
    planIds: readonly string[],
    day: BusinessDate,
    limit: number,
    tx?: DbTx,
  ): Promise<OpenSeatHoldings>;
}

/** The facts about a seat target that the assignments of seats (licensing) read. */
export interface SeatTarget {
  kind: 'SUBSCRIPTION' | 'PLAN';
  subscriptionId: string | null;
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  applicationKind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  /** Whether the application of the plan is still in the catalog; a retired one takes no seat. */
  applicationStatus: 'APPROVED' | 'RETIRED';
  /** The state of the subscription; null for a plan that has none. A draft takes no seat (`US-04-03` AC-6). */
  status: 'ACTIVE' | 'DRAFT' | null;
  /** What a draft still lacks, as the catalog names it; empty when the subscription is complete or there is none. */
  missing: string[];
  /** The seats bought; null while the subscription has no quantity, and always null for a plan with no subscription. */
  purchasedQuantity: number | null;
}

/** How much of the catalog exists, for the onboarding checklist: judged from the data, not from how it was entered. */
export interface CatalogOnboardingFacts {
  applications: number;
  plans: number;
  subscriptions: number;
  /** The department and job title pairs that have a standard toolset (US-04-10). */
  standardToolsets: number;
}

/**
 * What an empty main list says instead of a blank page (`US-02-04` AC-3, `FR-9.6`): that nothing of its kind exists at
 * all, and the step of the installation checklist that fills it. A list that is empty only because of a filter has none.
 */
export interface EmptyState {
  reason: 'NO_APPLICATIONS' | 'NO_SUBSCRIPTIONS';
  nextStep: { step: 2 | 3; key: 'APPLICATIONS' | 'CONTRACTS_AND_SUBSCRIPTIONS' };
}

/** A plan and the application it belongs to, by name, for the views that list seats. */
export interface PlanSummary {
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
}
