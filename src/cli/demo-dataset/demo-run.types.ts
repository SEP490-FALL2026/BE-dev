import type { DemoAccountPlanItem, DemoAccountSpec } from '../../modules/installation/public/demo-accounts.types';
import type { DemoApiClient } from './demo-api-client';
import type { DemoFixture } from './fixture/demo-fixture.types';

/**
 * - `present`: already as the fixture wants it, nothing written.
 * - `done`: this run wrote it (apply).
 * - `planned`: absent or behind, apply would write it (plan).
 * - `waiting`: cannot be judged yet, a step it needs is planned (plan).
 * - `conflict`: something not of the dataset holds the place, or the data went another way: nothing written, never forced.
 * - `blocked`: a step it needs ended in conflict or failed (apply).
 * - `failed`: an unexpected answer or an unreachable API stopped the run here.
 */
export type StepStatus = 'present' | 'done' | 'planned' | 'waiting' | 'conflict' | 'blocked' | 'failed';

export interface StepReport {
  key: string;
  title: string;
  status: StepStatus;
  /** Why, in words; never a password, a token or a value of a private file. */
  detail?: string;
}

export interface StepOutcome {
  status: Extract<StepStatus, 'present' | 'done' | 'planned' | 'conflict'>;
  detail?: string;
}

/** The in-process part: the demo accounts and the employee lookup, through the installation module. */
export interface DemoAccountsPort {
  findEmployees(codes: readonly string[]): Promise<Map<string, { id: string; status: string }>>;
  describe(specs: readonly DemoAccountSpec[]): Promise<DemoAccountPlanItem[]>;
  create(specs: readonly DemoAccountSpec[]): Promise<DemoAccountPlanItem[]>;
}

/** The ids the steps find or create, by the fixture's keys and codes. */
export interface DemoIds {
  departments: Map<string, string>;
  employees: Map<string, string>;
  appUsers: Map<string, string>;
  applications: Map<string, string>;
  vendors: Map<string, string>;
  plans: Map<string, string>;
  subscriptions: Map<string, string>;
  costCenters: Map<string, string>;
  requests: Map<string, string>;
}

export interface DemoRunContext {
  mode: 'plan' | 'apply';
  fixture: DemoFixture;
  api: DemoApiClient;
  /** Today in the organization's time zone (`YYYY-MM-DD`). */
  today: string;
  superAdminEmail: string;
  /** The password the operator chose for every demo account (stdin only). */
  demoPassword: string;
  accounts: DemoAccountsPort;
  ids: DemoIds;
}

export interface DemoStep {
  key: string;
  title: string;
  /** Steps that must be `present` or `done` first. */
  needs: readonly string[];
  run(ctx: DemoRunContext): Promise<StepOutcome>;
}

export function emptyIds(): DemoIds {
  return {
    departments: new Map(),
    employees: new Map(),
    appUsers: new Map(),
    applications: new Map(),
    vendors: new Map(),
    plans: new Map(),
    subscriptions: new Map(),
    costCenters: new Map(),
    requests: new Map(),
  };
}
