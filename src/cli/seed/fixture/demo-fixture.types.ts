/**
 * The shape of a demo dataset of `pnpm ops:seed`. A fixture is data only: who exists, what the catalog and the shared pool hold,
 * which budgets stand and which business scenarios to bring to which state. Every write goes through the HTTP API as the actor
 * the business rules name (and the demo accounts through the demo account contract), so a fixture can never say "put this row in
 * that state". Every date is an offset from the business day the dataset is applied on (`ctx.today`).
 */

export type DemoRole = 'EMPLOYEE' | 'IT_ADMIN' | 'FINANCE' | 'MANAGER';

export interface DemoDepartment {
  code: string;
  name: string;
  function: string;
  /** The person who heads it from the day the dataset is applied; none leaves the department without a head on purpose. */
  head: string | null;
  /** The IT Admin in charge; none leaves the department without one on purpose. */
  itAdmin: string | null;
  /** The Unit Cost Center Finance creates for it; none leaves its finance configuration incomplete on purpose. */
  costCenter: { code: string; name: string } | null;
}

export interface DemoPerson {
  code: string;
  fullName: string;
  /** The local part of the work email; the domain is the fixture's. */
  email: string;
  department: string;
  employmentType: 'STAFF' | 'CONTRACTOR' | 'FREELANCER' | 'INTERN';
  /** The one direct role of the person's sign-in account; null: no account (the Super Admin can create one to test). */
  account: DemoRole | null;
}

export interface DemoPlan {
  key: string;
  name: string;
  provisioningType: 'K1' | 'K2' | 'K4' | 'K5';
  pricingModel?: 'PER_SEAT';
  controlLevel?: 'FULL' | 'PARTIAL';
  dataLossOnRemoval: boolean;
  revocationNote?: string;
  sharingPolicy?: 'NOT_ALLOWED';
}

export interface DemoApplication {
  key: string;
  name: string;
  kind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  vendorName?: string;
  dataSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  plans: DemoPlan[];
}

/** The one subscription of a (application, plan): the stock the shared pool draws seats from (`QĐ-103d`). It belongs to no department. */
export interface DemoSubscription {
  key: string;
  plan: string;
  kind: 'TERM' | 'PERPETUAL';
  /** The price of one seat for one billing period, major units of `currency`. */
  unitPrice: { amount: string; currency: string };
  billingCycle: 'MONTHLY' | 'ANNUAL';
  /** The commitment of the period: 1 month for a monthly plan, 12 for an annual one. */
  termMonths: 1 | 12;
  /** An annual subscription renews this many days from today; none: the term of the current year. */
  renewalInDays?: number;
  noticePeriodDays?: number;
  /** The IT Admin who answers for it (a person code). */
  responsible: string;
  /** Seats bought on top of the baseline ones: the free seats of the pool the demo can grant from. */
  freeAfterBaseline: number;
  /** A K1 purchase must name the department it is bought for (`SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE` otherwise); the other plans name none. */
  ownerDepartment?: string;
  /** Seats bought when no baseline file gives the number (K1, K4, K5). */
  quantity?: number;
}

/** A seat the baseline file puts in the pool before the dataset starts, granted in the past. */
export interface DemoSeat {
  subscription: string;
  /** A person code, or a service account answered for by a person. */
  holder: string | { serviceAccount: string; responsible: string; reason: string };
  /** Days before today the seat was granted; the default is 130, past the 90-day tier of the optimization rules. */
  grantedDaysAgo?: number;
  /** The seat ends this many days from today. */
  endInDays?: number;
}

export interface DemoBudgetLine {
  description: string;
  plan: string;
  seats: number;
  amount: string;
  /** What kind of purchase the line is (`QĐ-101n`); the order of the lines in the fixture is their priority rank, from 1. */
  lineType: 'RENEW' | 'CHANGE' | 'NEW' | 'CANCEL';
  /** The reduced zero-based-budget explanation, required of a `NEW` line (`QĐ-94l`). */
  zbb?: { purpose: string; alternatives: string; consequenceIfNot: string; usageIndicator: string };
  note?: string;
}

/**
 * The budget cycle of a year (`QĐ-103i`): the annual ceiling of the software budget, the shared-pool reserve and what each department
 * may ask for. Without `ceilings` the rest is divided evenly among the departments. The sum must stay within the annual ceiling.
 */
export interface DemoCycle {
  annualCeiling: string;
  sharedPoolReserve: string;
  /** Days before the first of January of the year that the proposals and the decisions fall due. */
  submissionDaysBefore: number;
  decisionDaysBefore: number;
  /** Ceiling of each department by code; a department of the installation that is not named gets 0. */
  ceilings?: Record<string, string>;
}

/** The approved budget of the current year of a department: through the head's proposal, or from the baseline when it has no head. */
export interface DemoBudget {
  department: string;
  /** The base of the year; the reserve is the default share of it (10 %) the server works out. */
  base: string;
  origin: 'PROPOSAL' | 'BASELINE';
  lines: DemoBudgetLine[];
}

/** Where the budget of the next year of a department is left for the demo to carry on from. */
export interface DemoNextYear {
  department: string;
  lines: DemoBudgetLine[];
  /** The proposal waits for Finance; a version is sent and waits for the spending approver; or the approver asked for changes. */
  stage: 'PROPOSAL_SUBMITTED' | 'VERSION_SENT' | 'CHANGES_REQUESTED';
  base: string;
  /** The reason of the request for changes. */
  reason?: string;
}

/** The states a scenario request is brought to, each by the actions of the people the routing names. */
export type DemoRequestTarget =
  | 'PENDING'
  | 'WAITING_CONTROLLED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'AWAITING_SPEND_SUBMISSION'
  | 'AWAITING_SPEND_DECISION'
  | 'AWAITING_EXECUTION'
  | 'AWAITING_IT_ASSESSMENT'
  | 'RESERVE_UNCONFIRMED'
  | 'BLOCKED'
  | 'COMPLETED';

/** How the request ends: no end date, the last day of the month of today, or a number of days from today. */
export type DemoRequestEnd = 'NONE' | 'EOM' | { inDays: number };

export interface DemoRequestScenario {
  key: string;
  requester: string;
  /** For a group request: the people it is for (the head sends it, not among them). */
  beneficiaries?: string[];
  /** A plan of the catalog, or a proposal of software that is not in it. */
  plan?: string;
  proposal?: { softwareName: string; homepageUrl: string; dataDescription: string; expectedUsers: number };
  end: DemoRequestEnd;
  target: DemoRequestTarget;
  /** The head confirms the use of the reserve with the batch, so the request goes on to the spending approver. */
  confirmReserve?: boolean;
  /** For COMPLETED or AWAITING_EXECUTION, how IT grants the seat: from the pool, buying a seat (or a key), or a free key of the key store. */
  grant?: 'POOL' | 'PURCHASE' | 'KEY';
  /** The IT Admin does the grant (default: the one in charge of the requester's department). */
  grantedBy?: string;
  summary: string;
}

export interface DemoKeys {
  /** The K4 subscription the keys are imported into. */
  subscription: string;
  /** How many keys the store holds; their values are written by the seed, never shared. */
  count: number;
}

/** One report file of usage the IT Admin in charge of the application imports for a source (`SBF-04a`). */
export interface DemoUsageSource {
  key: string;
  application: string;
  name: string;
  /** The IT Admin who declares the source and imports the files. */
  importer: string;
  activityDefinition: string;
  /** The first day of the window the file covers, days before today, and the last one. */
  windowFromDaysAgo: number;
  windowToDaysAgo: number;
  /** One row per person: the days before today of the last activity; null: a member with no activity date. */
  rows: { identifier: string; lastActivityDaysAgo: number | null }[];
  /** Whether the holders were already told of the tracking (a first report needs one of the two notices). */
  notice: 'CONFIRMED_DELIVERED' | 'SYSTEM_SENT';
}

/** What the head decides about a recommendation of the seed's own run of the rules. */
export interface DemoGhostDecision {
  /** The holder of the seat. */
  holder: string;
  /** The application the seat is of (the key of the fixture's application). */
  application: string;
  choice: 'KEEP' | 'RECLAIM' | 'EXEMPT';
  reason: string;
  /** For EXEMPT: days from today the exemption lasts. */
  exemptDays?: number;
}

export type DemoPersonnelEvent =
  { kind: 'LONG_LEAVE'; employee: string; returnInDays: number } | { kind: 'OFFBOARDING'; employee: string };

export interface DemoFixture {
  id: string;
  /** The prefix of every code and the tag written into free text, so a person can tell demo data from the rest. */
  marker: string;
  emailDomain: string;
  /** Every amount of the fixture is in this currency, which must be the reporting currency of the installation. */
  currency: string;
  departments: DemoDepartment[];
  people: DemoPerson[];
  /** The one approval role left, the spending approver (a role grant, `QĐ-93b`). */
  approvalRoles: { SPENDING_APPROVER: string };
  applications: DemoApplication[];
  subscriptions: DemoSubscription[];
  seats: DemoSeat[];
  /** The exchange rate of a foreign currency to the reporting one, recorded by Finance for today. */
  exchangeRates: { currency: string; rate: string }[];
  /** A Finance-declared tax profile for the vendor of one application. */
  taxProfile: {
    application: string;
    group: 'T2';
    lines: { taxType: string; ratePercent: string; deductible: boolean }[];
  };
  /** The budget cycle of the year, then of the next one, opened and published before any proposal (`Q-02`). */
  cycle: DemoCycle;
  nextCycle: DemoCycle;
  /** The approved budgets of the year, one per department with a Cost Center. */
  budgets: DemoBudget[];
  /** The budgets of the next year, each left at the stage a demo carries on from. */
  nextYear: DemoNextYear[];
  requests: DemoRequestScenario[];
  keys: DemoKeys[];
  usageSources: DemoUsageSource[];
  ghostDecisions: DemoGhostDecision[];
  personnel: DemoPersonnelEvent[];
  /** A draft that is saved and never sent (its department has no Cost Center, so it cannot be sent). */
  draft: { requester: string; plan: string; end: DemoRequestEnd };
  /** A report of an error in the seat the request of this key granted. */
  saasIssue: { request: string; description: string };
  /** A notice (BM-09) a head sends; it changes nothing until the Super Admin handles it. */
  notice: { sender: string; employee: string; kind: 'LONG_LEAVE'; proposedInDays: number; note: string };
}
