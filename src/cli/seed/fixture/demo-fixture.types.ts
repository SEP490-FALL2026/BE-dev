/**
 * The shape of a demo dataset of `pnpm ops:seed`. A fixture is data only: who exists, what the catalog holds and
 * which business scenarios to bring to which state. Every write goes through the HTTP API as the actor the business rules
 * name (and the demo accounts through the demo account contract), so a fixture can never say "put this row in that state".
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
  provisioningType: 'K1' | 'K2' | 'K5';
  pricingModel?: 'PER_SEAT';
  controlLevel?: 'FULL' | 'PARTIAL';
  dataLossOnRemoval: boolean;
  revocationNote?: string;
  sharingPolicy?: 'NOT_ALLOWED';
}

export interface DemoApplication {
  key: string;
  name: string;
  kind: 'SAAS' | 'INTERNAL';
  vendorName?: string;
  businessOwner: string;
  dataSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  plans: DemoPlan[];
}

export interface DemoSubscription {
  key: string;
  plan: string;
  ownerDepartment: string;
  quantity: number;
  /** Unit price per seat per billing period, in the reporting currency of the installation (VND), major units. */
  unitPrice: string;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  noticePeriodDays: number;
}

export interface DemoBudgetLine {
  description: string;
  plan: string;
  seats: number;
  amount: string;
}

/**
 * The budget cycle of the year and of the year after it (`QĐ-103i`): the annual ceiling of the software budget, the shared-pool
 * reserve and the rest is divided evenly among the departments of the installation (all as priority items), in the reporting currency, major units. The sum must stay
 * within the annual ceiling for every department of the dataset.
 */
export interface DemoCycle {
  annualCeiling: string;
  sharedPoolReserve: string;
  /** Days before the first of January of the year that the proposals and the decisions fall due. */
  submissionDaysBefore: number;
  decisionDaysBefore: number;
}

export interface DemoBudget {
  department: string;
  lines: DemoBudgetLine[];
  /** The base of the year; the reserve is the default share of it (10 %) the server works out (`QĐ-101`, step 11). */
  base: string;
}

/**
 * A budget proposal a head sends for a year after the current one, for a department that has no budget of that year: it stays
 * where the head's send leaves it, waiting for Finance to build a version from it.
 */
export interface DemoBudgetProposal {
  department: string;
  /** How many years after the year of today; 1 is next year. */
  yearOffset: number;
  lines: DemoBudgetLine[];
}

/**
 * An invoice Finance records against the commitment of a scenario request. Every amount is a share of what the commitment was made
 * for, so the fixture does not depend on prices: the price before tax at more than 100 is an invoice for more than the commitment
 * allowed.
 */
export interface DemoInvoice {
  key: string;
  /** The scenario request whose commitment the invoice is recorded against; it must reach COMPLETED. */
  request: string;
  /** The price before tax, in percent of the commitment. */
  netPercent: number;
  /** The tax that can be deducted, in percent of the price before tax; 0 leaves it out. */
  deductibleTaxPercent: number;
  /** The tax that cannot be deducted, in percent of the price before tax; 0 leaves it out. */
  nonDeductibleTaxPercent: number;
  /** How many days before today the invoice is dated. */
  issuedDaysAgo: number;
  note: string;
}

/** The states a scenario request is brought to, each by the actions of the people the routing names. */
export type DemoRequestTarget =
  | 'PENDING'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'AWAITING_SPEND_SUBMISSION'
  | 'AWAITING_EXECUTION'
  | 'AWAITING_SPEND_DECISION'
  | 'AWAITING_FINANCE_REVIEW'
  | 'AWAITING_IT_ASSESSMENT'
  | 'COMPLETED';

export interface DemoRequestScenario {
  key: string;
  requester: string;
  /** A plan of the catalog, or a proposal of software that is not in it. */
  plan?: string;
  proposal?: { softwareName: string; homepageUrl: string; dataDescription: string; expectedUsers: number };
  termMonths: number;
  target: DemoRequestTarget;
  /** For COMPLETED: the subscription the IT Admin grants the seat from. */
  grantFrom?: string;
  summary: string;
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
  /** The one approval role left, the spending approver (a role grant, `QĐ-93b`); the substitute and the fallback approver are gone (`QĐ-93c`). */
  approvalRoles: { SPENDING_APPROVER: string };
  applications: DemoApplication[];
  subscriptions: DemoSubscription[];
  /** A Finance-declared tax profile for the vendor of one application. */
  taxProfile: {
    application: string;
    group: 'T2';
    lines: { taxType: string; ratePercent: string; deductible: boolean }[];
  };
  /** The budget cycle opened and published for the year and the next, before any proposal (`Q-02`). */
  cycle: DemoCycle;
  /** The budgets of the year, one per department that has one; a department left out has none (R9 counts on it). */
  budgets: DemoBudget[];
  /** Proposals for a later year that wait for Finance; a department with one has no budget of that year. */
  proposals: DemoBudgetProposal[];
  requests: DemoRequestScenario[];
  /** Invoices Finance records against the commitments of scenario requests; each ends in the match its shares say. */
  invoices: DemoInvoice[];
  /** A draft that is saved and never sent. */
  draft: { requester: string; plan: string; termMonths: number };
  /** A report of an error in the seat the request of this key granted. */
  saasIssue: { request: string; description: string };
  /** A notice (BM-09) a head sends; it changes nothing until the Super Admin handles it. */
  notice: { sender: string; employee: string; kind: 'LONG_LEAVE'; proposedInDays: number; note: string };
}
