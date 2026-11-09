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
  /** The department that owns the subscription (`QĐ-89a`); null only for a plan that has no subscription (an internal plan, K5). */
  ownerDepartmentId: string | null;
  /** Whether the subscription can be cut mid-term (a flexible plan); false for a plan that has none (`QĐ-98`, R-15). */
  allowsMidTermReduction: boolean;
}

/** A subscription a seat can be taken from today, with the seats bought; a draft takes no seat (`US-04-03` AC-6). */
export interface PoolSubscription {
  subscriptionId: string;
  purchasedQuantity: number | null;
  /** The subscription that prices the plan (`Q-04`): the one a grant that names no subscription takes first. */
  isPrimaryForPlan: boolean;
}

/** What one subscription is bought at: the price a seat granted from it would have cost (`QĐ-106e`). */
export interface SubscriptionPrice {
  kind: 'RECURRING' | 'ONE_TIME';
  unitPrice: { amountMinor: bigint; currency: string };
  /** The unit price converted to the reporting currency when it was recorded; null when it was not converted. */
  reportingUnitPrice: { amountMinor: bigint; currency: string } | null;
  /** `OTHER` for a perpetual purchase, which has no billing cycle. */
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
}

/** How much of the catalog exists, for the onboarding checklist: judged from the data, not from how it was entered. */
export interface CatalogOnboardingFacts {
  applications: number;
  plans: number;
  subscriptions: number;
}

/**
 * What an empty main list says instead of a blank page (`US-02-04` AC-3, `FR-9.6`): that nothing of its kind exists at
 * all, and the step of the installation checklist that fills it. A list that is empty only because of a filter has none.
 */
export interface EmptyState {
  reason: 'NO_APPLICATIONS' | 'NO_SUBSCRIPTIONS';
  nextStep: { step: 2 | 3; key: 'APPLICATIONS' | 'CONTRACTS_AND_SUBSCRIPTIONS' };
}

/** How a seat of a plan is taken away: its kind of provisioning and what is said of the removal (`US-07-05`). */
export interface PlanRevocationInfo {
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
}

/** An active subscription not taken over by a later period that runs, which grants seats on a day, as the rules of wasted seats read it (`FR-4.9` gate 1). */
export interface RuleSubscription {
  subscriptionId: string;
  planId: string;
  applicationId: string;
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  /** Null while the plan has no pricing model; the rules take only `PER_SEAT`. */
  pricingModel: 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST' | null;
  /** The seats bought; null when the subscription has none. */
  purchasedQuantity: number | null;
}

/** A plan and the application it belongs to, by name, for the views that list seats. */
export interface PlanSummary {
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
}

/**
 * A workspace of a K2 plan that a person owns or administers (`QĐ-77d`, `US-03-04` AC-28): the plan and its application by name, and how
 * the person stands in it. The primary owner is named on the profile; a member is an owner or an administrator of the workspace.
 */
export interface WorkspaceDuty {
  employeeId: string;
  planId: string;
  planName: string;
  applicationName: string;
  role: 'PRIMARY_OWNER' | 'OWNER' | 'ADMIN';
  /** The plan declares an emergency account: only that it exists, never its name, its holder or any secret. */
  emergencyAccountDeclared: boolean;
}

/**
 * What the last weekly pass of the usage rules (MF-5) found of one plan priced per seat (`KPI-3`, `QĐ-109d`): of the seats it could judge
 * (`assessedSeats`), how many showed activity in the 30 days before the pass (`activeSeats`).
 */
export interface PlanUsageRate {
  planId: string;
  activeSeats: number;
  assessedSeats: number;
}

/**
 * An active subscription of the company, as the baseline of the budget reads it (`FR-5.15`): what runs, at what price, for how long. Its
 * cost follows the people who hold its seats (`QĐ-103k`), so the department that may own it is not part of it.
 */
export interface BaselineSubscription {
  subscriptionId: string;
  planId: string;
  planName: string;
  applicationName: string;
  /** `K2`/`K4` is the shared pool of the company (`QĐ-103d`): its idle seats are the pool's line of the baseline. */
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  /** The seats bought; null for a purchase that has none (perpetual, or priced another way). */
  purchasedQuantity: number | null;
  /** The unit price in the reporting currency as recorded when the price was; null when it has none. */
  unitPriceReportingMinor: bigint | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null;
  startDate: string | null;
  endDate: string | null;
  /** The day it renews by itself, when it does. */
  renewalDate: string | null;
  /** A later period of this purchase was recorded (`renewedFromId` points here): the year to come is that period's. */
  hasSuccessor: boolean;
}
