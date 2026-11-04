import type { DemoAccountRole } from '../../identity-access/public/identity-access.types';

/** One demo account the shared demo dataset wants: the employee it belongs to, its sign-in email and its one direct role. */
export interface DemoAccountSpec {
  employeeCode: string;
  loginEmail: string;
  role: DemoAccountRole;
  allowedExtraRoles?: readonly ('MANAGER' | 'SPENDING_APPROVER')[];
}

/** What `pnpm ops:demo-dataset` checks before it touches anything: which installation the database holds. */
export interface DemoInstallationFacts {
  organizationId: string;
  organizationName: string;
  /** Every amount of a fixture must be in this currency (the installation converts nothing for the dataset). */
  reportingCurrency: string;
  /** Today in the organization's time zone (`YYYY-MM-DD`): every relative date of the dataset counts from it. */
  today: string;
  /** The organization's IANA time zone, to date past events in its business calendar. */
  timeZone: string;
  /** The holder of the Super Admin role, to prove the API the command talks to serves this very database. */
  superAdmin: { appUserId: string; employeeId: string; loginEmail: string } | null;
}

export type DemoAccountPlanState = 'present' | 'absent' | 'conflict' | 'no-employee';

export interface DemoAccountPlanItem {
  employeeCode: string;
  state: DemoAccountPlanState;
  /** Why an account conflicts with what exists (never a value of the account). */
  reason?: string;
  employeeId: string | null;
  appUserId: string | null;
}

/** How the accounts the dataset creates are attributed in the Audit Trail (`actorKind: OPERATOR`). */
export interface DemoAccountsAttribution {
  /** `DEMO_DATASET:<fixture>:<operator reference>`, kept as the operator reference of every event. */
  operatorReference: string;
  environment: 'SHARED' | 'LOCAL_TEST';
}
