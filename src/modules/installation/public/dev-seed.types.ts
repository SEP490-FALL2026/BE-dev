import type { DemoAccountRole } from '../../identity-access/public/identity-access.types';
import type { LocalSeedRefusal } from '../dev-seed/local-seed.policy';

export type SeedItemKind = 'DEPARTMENT' | 'COST_CENTER' | 'EMPLOYEE' | 'ACCOUNT';

/** A fixture item that exists under its stable key but differs, and how. */
export type SeedConflict =
  | 'COST_CENTER_NAME_DIFFERS'
  | 'COST_CENTER_NOT_UNIT'
  | 'COST_CENTER_INACTIVE'
  | 'COST_CENTER_IN_USE'
  | 'COST_CENTER_UNLINKED'
  | 'DEPARTMENT_NAME_DIFFERS'
  | 'DEPARTMENT_INACTIVE'
  | 'DEPARTMENT_COST_CENTER_DIFFERS'
  | 'EMPLOYEE_DIFFERS'
  | 'WORK_EMAIL_TAKEN'
  | 'ACCOUNT_DIFFERS'
  | 'LOGIN_EMAIL_TAKEN'
  | 'FINANCE_HELD_ELSEWHERE';

/** One fixture item, as planned before writing: create it, it is already there, or it conflicts with real data. */
export type PlannedItem = {
  kind: SeedItemKind;
  key: string;
} & ({ action: 'create' } | { action: 'present' } | { action: 'conflict'; reason: SeedConflict });

/** What the plan needs to write: the ids of what exists, and what each account needs. */
export interface SeedPlan {
  organizationId: string;
  costCenterId: string | null;
  departmentId: string | null;
  employeeIds: ReadonlyMap<string, string>;
  items: PlannedItem[];
}

export type SeedOutcome = 'CREATED' | 'ALREADY_PRESENT' | 'REFUSED';
export type SeedRefusal = LocalSeedRefusal | 'NOT_INSTALLED' | 'CONFLICT' | 'STATE_CHANGED' | 'UNIQUE_KEY_TAKEN';

/** One line of the report. `password` is set only on an account this run created, and is printed once. */
export interface SeedReportItem {
  kind: SeedItemKind;
  key: string;
  state: 'created' | 'already-present' | 'conflict';
  reason?: SeedConflict;
  initialRole?: DemoAccountRole;
  loginEmail?: string;
  password?: string;
}

export interface DevSeedResult {
  outcome: SeedOutcome;
  refusal?: SeedRefusal;
  items: SeedReportItem[];
}
