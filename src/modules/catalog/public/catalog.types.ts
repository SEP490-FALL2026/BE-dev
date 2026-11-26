import type { BusinessDate } from '../../../core/business-date';

/** What a seat is held against: a subscription of a paid plan (optionally naming the line and serving day), or an internal plan that has no subscription. */
export type SeatTargetRef =
  | { subscriptionId: string; planId?: string; servingOn?: BusinessDate }
  | { licenseLotId: string; planId?: string }
  | { planId: string };

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
  /** The lot id when targeting a K4 license lot; null/undefined otherwise. */
  licenseLotId?: string | null;
  /** The subscription line serving `servingOn` for K2 targets; null for PLAN, K1, K4, or when no line serves that day. */
  subscriptionLineId?: string | null;
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  applicationKind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  /** How a K4 plan is bound once bought (to an account, to a machine by a key, or bundled with the machine); null for every other kind. */
  keyBinding: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED' | null;
  /** Reference commitment months on a K1/K2 plan (`1 | 12`), or null when unset or for other kinds. */
  referenceCommitmentMonths?: 1 | 12 | null;
  /** Plan reference monthly unit price in minor units of dong (`QĐ-113a`), or null when unset. */
  monthlyUnitPriceMinor?: bigint | null;
  /** Whether the application of the plan is still in the catalog; a retired one takes no seat. */
  applicationStatus: 'APPROVED' | 'RETIRED';
  /** The state of the subscription; null for a plan that has none. A draft takes no seat (`US-04-03` AC-6). */
  status: 'ACTIVE' | 'DRAFT' | null;
  /** What a draft still lacks, as the catalog names it; empty when the subscription is complete or there is none. */
  missing: string[];
  /** The seats bought; null while the subscription has no quantity, and always null for a plan with no subscription. */
  purchasedQuantity: number | null;
  /** How seats are counted for K2 subscriptions (`FIXED` vs `MEMBERS`). */
  seatCounting?: 'FIXED' | 'MEMBERS';
  /** Whether the subscription can be cut mid-term (a flexible plan); false for a plan that has none (`QĐ-98`, R-15). */
  allowsMidTermReduction: boolean;
}

/** A subscription a seat can be taken from today, with the seats bought; a draft takes no seat (`US-04-03` AC-6). */
export interface PoolSubscription {
  subscriptionId: string;
  /** The line of the plan on this period for K2; undefined/null for K1, K4, or legacy periods without lines. */
  subscriptionLineId?: string | null;
  /** Creation time of the line (used for deterministic line selection ordering). */
  lineCreatedAt?: Date;
  purchasedQuantity: number | null;
  /** The subscription that prices the plan (`Q-04`): the one a grant that names no subscription takes first. */
  isPrimaryForPlan: boolean;
}

/**
 * A plan that gives out seats (K2) or keys (K4), with what they sit on today: for a K2 plan the subscriptions of the shared pool of the plan, as a grant
 * reads it (`PoolSubscription`); for a K4 plan its lots, each as an entry whose `subscriptionId` is the id of the lot and whose `purchasedQuantity` is its
 * licenses (a lot born from a perpetual purchase has the id of that subscription). What the stock summary of the IT Admin counts the plan over (`QĐ-111n`).
 */
export interface StockPlan {
  planId: string;
  planName: string;
  provisioningType: 'K2' | 'K4';
  /** How a K4 plan is bound once bought; null for a plan of another kind. A key that goes on a machine is counted by licenses, not by keys. */
  keyBinding: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED' | null;
  applicationId: string;
  applicationName: string;
  /** The https link the IT Admin pasted for the logo of the application, never checked, or null. */
  applicationLogoUrl: string | null;
  subscriptions: { subscriptionId: string; purchasedQuantity: number | null }[];
}

/** A page of plans by application then plan, and how many there are in all for the same filter. */
export interface StockPlanPage {
  items: StockPlan[];
  total: number;
}

/** Which plans a stock summary lists: those with a subscription a seat can be taken from on `today`, of this IT Admin only when named (`QĐ-111n`). */
export interface StockPlanFilter {
  today: BusinessDate;
  /** Only the subscriptions this IT Admin answers for, and the plans that have one. */
  responsibleItAdminEmployeeId?: string;
  planId?: string;
  skip: number;
  take: number;
}

/** What one subscription is bought at: the price a seat granted from it would have cost (`QĐ-106e`). */
export interface SubscriptionPrice {
  kind: 'RECURRING' | 'ONE_TIME';
  unitPrice: { amountMinor: bigint; currency: string };
  /** The unit price converted to the reporting currency when it was recorded; null when it was not converted. */
  reportingUnitPrice: { amountMinor: bigint; currency: string } | null;
  /** The monthly unit price per seat in dong from `monthly_unit_price_minor`; null for perpetual purchases or when unset. */
  monthlyPriceMinor: bigint | null;
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
  /** The https link to the logo image the IT Admin pasted, or null. */
  applicationLogoUrl: string | null;
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

/** What the catalog holds of one application for a person who asks for software: the application and up to twenty of its plans by name (`planTotal` says how many there are). */
export interface CatalogEntry {
  applicationId: string;
  name: string;
  status: 'APPROVED' | 'RETIRED';
  vendor: { id: string; name: string } | null;
  plans: { planId: string; name: string; provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5' }[];
  planTotal: number;
  /** The plan of the application that has the name asked for (names compared ignoring case, accents and blanks); null when there is none or none was asked. */
  planNamed: { planId: string; name: string } | null;
}

/** The entry of the catalog that is the same software as a declaration, and what made it the same: the name or a domain (`QĐ-111b`). */
export interface CatalogEntryMatch {
  by: 'NAME' | 'DOMAIN';
  entry: CatalogEntry;
}

/** A plan and the application it belongs to, by name, for the views that list seats. */
export interface PlanSummary {
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
}

/** A plan summary with the logo of its application: the https link the IT Admin pasted, never checked, or null (`CT-1`). */
export interface PlanSummaryWithLogo extends PlanSummary {
  applicationLogoUrl: string | null;
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
  /** The workspace the duty is held in: the plan above is the one it is known by. */
  workspace?: {
    id: string;
    name: string;
    vendorId: string;
    responsibleItAdminEmployeeId: string | null;
    members: ReadonlyArray<{ employeeId: string; role: 'OWNER' | 'ADMIN' }>;
  };
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
  /** The monthly price per seat in dong from `monthly_unit_price_minor`; null when unset. */
  monthlyPriceMinor: bigint | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null;
  startDate: string | null;
  endDate: string | null;
  /** The day it renews by itself, when it does. */
  renewalDate: string | null;
  /** A later period of this purchase was recorded (`renewedFromId` points here): the year to come is that period's. */
  hasSuccessor: boolean;
}
