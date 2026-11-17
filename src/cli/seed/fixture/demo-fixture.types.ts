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
  /** The department code the person is placed in; null: the dataset leaves them unplaced (`QĐ-93g`), the Super Admin places them later. */
  department: string | null;
  employmentType: 'STAFF' | 'CONTRACTOR' | 'FREELANCER' | 'INTERN';
  /** The one direct role of the person's sign-in account; null: no account (the Super Admin can create one to test). */
  account: DemoRole | null;
  /**
   * A person with a term (not `STAFF`): the contract ends this many days from today. The Super Admin writes it on the employee (D-21) and a
   * request, which names months, is cut there (`QĐ-111i`, R-38); a staff member has none (the API refuses one).
   */
  contractEndInDays?: number;
}

/** A line of a people file the Super Admin imports (`SBF-01a`): the department is a code that may be wrong on purpose. */
export interface DemoImportRow {
  code: string;
  fullName: string;
  /** The local part of the work email, or the person of the fixture whose email the line repeats (a refusal on purpose). */
  email: string | { sameAsPerson: string };
  employmentType: DemoPerson['employmentType'];
  department: string;
  jobTitle?: string;
}

/** One people file: confirmed (the people exist after it) or only previewed (kept as the screen with lines to fix). */
export interface DemoEmployeeImport {
  key: string;
  fileName: string;
  confirm: boolean;
  /** For a confirmed import, the key of its confirmation (the API answers a second one with the first). */
  idempotencyKey: string;
  rows: DemoImportRow[];
  /** The codes the preview must give the lines it refuses, in the order of the lines. */
  expectedErrors: string[];
}

export interface DemoPlan {
  key: string;
  name: string;
  provisioningType: 'K1' | 'K2' | 'K4' | 'K5';
  controlLevel?: 'FULL' | 'PARTIAL';
  dataLossOnRemoval: boolean;
  revocationNote?: string;
  sharingPolicy?: 'NOT_ALLOWED';
  /** K4 only: the plan has an admin console at the vendor, so like a K2 plan it needs a workspace profile of two IT Admins (`QĐ-110k`, R-53). */
  hasAdminConsole?: boolean;
  /** The IT Admin who administers the plan at the vendor beside the one responsible for its subscription (default: the first other IT Admin). */
  vendorAdmin?: string;
  /** The workspace profile names no company account that owns the workspace: the subscription carries the flag `ownerAccountEmailMissing` (`QĐ-110u`). */
  withoutOwnerAccountEmail?: true;
}

export interface DemoApplication {
  key: string;
  name: string;
  /** What the application becomes: the system works it out from the plan (K5 internal, the others `SAAS`), the fixture only says what it expects. */
  kind: 'SAAS' | 'INTERNAL';
  vendorName?: string;
  dataSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  /** The functional group the application stands in, by the name of one of the seven groups the installation writes (C-O5). */
  functionalGroup: string;
  plans: DemoPlan[];
}

/** The one subscription of a (application, plan): the stock the shared pool draws seats from (`QĐ-103d`). It belongs to no department. */
export interface DemoSubscription {
  key: string;
  plan: string;
  kind: 'TERM' | 'PERPETUAL';
  /** The price of one seat for one billing period, in dong (`QĐ-111an`: a price is written in the currency of the company only). */
  unitPrice: { amount: string; currency: 'VND' };
  /** The price the vendor quotes, when it is not in dong: kept beside `unitPrice` (FX-1), never used to work anything out. */
  originalPrice?: { amount: string; currency: string };
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
  /** A person code: the baseline import takes personal seats only (`QĐ-110m`), a machine account is flagged after the grant. */
  holder: string;
  /** Days before today the seat was granted; the default is 130, past the 90-day tier of the optimization rules. */
  grantedDaysAgo?: number;
  /** The seat ends this many days from today. */
  endInDays?: number;
}

/**
 * The budget cycle of a year (`QĐ-111z`): the annual ceiling of the software budget and the shared-pool reserve (there is no ceiling per
 * department any more). The submission deadline is `submissionOffsetDays` after the day the seed runs (0 = that very day: the cycle is open
 * on that day and locked from the next); the decision deadline `decisionOffsetDays` after it. `open: false` leaves the cycle a draft.
 */
export interface DemoCycle {
  annualCeiling: string;
  sharedPoolReserve: string;
  submissionOffsetDays: number;
  decisionOffsetDays: number;
  open: boolean;
}

/** The approved budget of the current year of a department: `BM-10` of its head (one amount, one file), then Finance's version. */
export interface DemoBudget {
  department: string;
  /** The amount of `BM-10` and the base of the version; the reserve is the default share of it (10 %) the server works out. */
  base: string;
  note?: string;
}

/** A line of `BM-10`: software a department expects to need in the year, for how many people, at what price and for how many months. */
export interface DemoBudgetLine {
  software: string;
  plan: string;
  seats: number;
  /** VND a seat a month, before tax. */
  monthlyPrice: number;
  months: number;
  reason: string;
}

/** Where the budget of the next year of a department is left for the demo to carry on from. */
export interface DemoNextYear {
  department: string;
  /** The amount the head asks in `BM-10`. */
  requestedAmount: string;
  note?: string;
  /**
   * The proposal waits for Finance; a version is sent and waits for the spending approver; the approver returned it to Finance with a
   * reason (`RETURN`); or the version is approved.
   */
  stage: 'PROPOSAL_SUBMITTED' | 'VERSION_SENT' | 'VERSION_RETURNED' | 'APPROVED';
  base: string;
  /** The reason of the return. */
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

export interface DemoRequestScenario {
  key: string;
  requester: string;
  /** For a group request: the people it is for (the head sends it, not among them). */
  beneficiaries?: string[];
  /** A plan of the catalog, or a proposal of software that is not in it. */
  plan?: string;
  /**
   * A proposal of software outside the catalog (case B). With `existingApplication` (the key of an application of the catalog) and
   * `plannedPlanName` it is the short case B: the application is known, the plan is not (DEMO-1).
   */
  proposal?: {
    softwareName: string;
    homepageUrl: string;
    dataDescription: string;
    expectedUsers: number;
    existingApplication?: string;
    plannedPlanName?: string;
  };
  /**
   * The time of use the request asks for, in whole months (`QĐ-111i`, RQ-2): `K1` 1 to 9, `K2`/`K5` 1 to 12 (a person with a term must give
   * months), null for a right with no end (`K2`/`K5` of a staff member) and for `K4`, which asks for none. The end date follows from it.
   */
  termMonths: number | null;
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

/**
 * An event of a person the Super Admin records with its basis: a long leave from today; a departure that blocks access today, or one with a
 * last working day this many working days from today (`WITH_LAST_DAY`); a transfer to another department that takes effect this many days
 * from today (a person placed today can be moved from tomorrow at the earliest, `EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD`).
 */
export type DemoPersonnelEvent =
  | { kind: 'LONG_LEAVE'; employee: string; returnInDays: number }
  | { kind: 'OFFBOARDING'; employee: string; lastDayInWorkingDays?: number }
  | { kind: 'TRANSFER'; employee: string; toDepartment: string; effectiveInDays: number };

/** The software list of a department (`QĐ-111c`): what its people are shown first when they ask for software, written by its IT Admin. */
export interface DemoDepartmentSoftware {
  department: string;
  /** An application of the fixture, alone or with one of its plans, and a note for the people who read the list. */
  items: { application: string; plan?: string; note?: string }[];
}

/** A proposal the head of a department makes to add a place of the catalog to its list, left waiting or rejected by its IT Admin with a reason. */
export interface DemoSoftwareProposal {
  key: string;
  department: string;
  application: string;
  plan?: string;
  reason: string;
  outcome: 'PENDING' | 'REJECTED';
  rejectionReason?: string;
}

export interface DemoFixture {
  id: string;
  /** The prefix of every code and the tag written into free text, so a person can tell demo data from the rest. */
  marker: string;
  emailDomain: string;
  /** Every amount of the fixture is in this currency, which must be the reporting currency of the installation. */
  currency: string;
  departments: DemoDepartment[];
  people: DemoPerson[];
  /** The people files of the Super Admin: one is confirmed, one is left as a preview with lines to fix (`SBF-01a`). */
  employeeImports: DemoEmployeeImport[];
  /** The one approval role left, the spending approver (a role grant, `QĐ-93b`). */
  approvalRoles: { SPENDING_APPROVER: string };
  applications: DemoApplication[];
  subscriptions: DemoSubscription[];
  seats: DemoSeat[];
  /** A Finance-declared tax profile for the vendor of one application. */
  taxProfile: {
    application: string;
    group: 'T2';
    lines: { taxType: string; ratePercent: string; deductible: boolean }[];
  };
  /** The budget cycle of the year, then of the next one, each opened before any proposal (`QĐ-111z`); the year after stays a draft. */
  cycle: DemoCycle;
  nextCycle: DemoCycle;
  draftCycle: DemoCycle;
  /** The approved budgets of the year, one per department with a Cost Center. */
  budgets: DemoBudget[];
  /** The budgets of the next year, each left at the stage a demo carries on from. */
  nextYear: DemoNextYear[];
  /** The lines of the `BM-10` file of each department (by code), this year and next; what they leave short of the amount asked is one balancing line. */
  budgetLines: Record<string, DemoBudgetLine[]>;
  requests: DemoRequestScenario[];
  keys: DemoKeys[];
  usageSources: DemoUsageSource[];
  ghostDecisions: DemoGhostDecision[];
  personnel: DemoPersonnelEvent[];
  departmentSoftware: DemoDepartmentSoftware[];
  softwareProposals: DemoSoftwareProposal[];
  /** A draft that is saved and never sent (its department has no Cost Center, so it cannot be sent). */
  draft: { requester: string; plan: string; termMonths: number | null };
  /** A report of an error in the seat the request of this key granted. */
  saasIssue: { request: string; description: string };
  /** A notice (BM-09) a head sends; it changes nothing until the Super Admin handles it. */
  notice: { sender: string; employee: string; kind: 'LONG_LEAVE'; proposedInDays: number; note: string };
}
