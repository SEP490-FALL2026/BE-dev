/**
 * The shape of a demo dataset of `pnpm ops:demo-dataset`. A fixture is data only: who exists, what the catalog holds and
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

export interface DemoBudget {
  department: string;
  lines: DemoBudgetLine[];
  base: string;
  reserve: string;
  highValuePercent: number;
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
  /** How the head approves a request that costs money: the line of the plan of the budget, or outside the plan. */
  planLine?: number;
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
  /** The budgets of the year, one per department that has one; a department left out has none (R9 counts on it). */
  budgets: DemoBudget[];
  requests: DemoRequestScenario[];
  /** A draft that is saved and never sent. */
  draft: { requester: string; plan: string; termMonths: number };
  /** A report of an error in the seat the request of this key granted. */
  saasIssue: { request: string; description: string };
  /** A notice (BM-09) a head sends; it changes nothing until the Super Admin handles it. */
  notice: { sender: string; employee: string; kind: 'LONG_LEAVE'; proposedInDays: number; note: string };
}
