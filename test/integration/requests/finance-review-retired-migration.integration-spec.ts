import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { stopCliProcesses } from '../../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

const OUTCOMES = migrationEndingWith('_budget_check_outcomes');
const RETIRED = migrationEndingWith('_finance_review_retired');
const CHECK = '23514';

interface Seed {
  orgId: string;
  deptId: string;
  costCenterId: string;
  empId: string;
  appUserId: string;
  planId: string;
}

/**
 * The two migrations of the check of the budget with three outcomes (BR-MF1-06g, Q-26): the first only adds (columns, the confirmation of the
 * reserve), the second sends what waited for Finance back to the queue of its head with a data migration that judges nothing, and refuses
 * what is retired from then on. Over a history that stops before each of them, with the rows an older database holds.
 */
describe('the migrations of the three outcomes and of the retired review of Finance (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;

  afterEach(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  async function startThrough(migration: string): Promise<Seed> {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: migration });
    expect(before.code).toBe(0);

    const seed: Seed = {
      orgId: randomUUID(),
      deptId: randomUUID(),
      costCenterId: randomUUID(),
      empId: randomUUID(),
      appUserId: randomUUID(),
      planId: randomUUID(),
    };
    const appId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme Corp', 'Asia/Ho_Chi_Minh', 'VND')`,
      [seed.orgId],
    );
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'DEPT-1', 'Engineering', now())`,
      [seed.deptId, seed.orgId],
    );
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at) VALUES ($1, $2, 'CC-01', 'Engineering CC', 'UNIT', 'ACTIVE', $3, now())`,
      [seed.costCenterId, seed.orgId, seed.deptId],
    );
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, employment_type, hire_date, updated_at) VALUES ($1, $2, 'EMP-001', 'Test Person', 'emp1@corp.test', 'STAFF'::"EmploymentType", now()::date, now())`,
      [seed.empId, seed.orgId],
    );
    await sql.query(
      `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, updated_at) VALUES ($1, $2, $3, 'user@acme.test', 'user@acme.test', 'ACTIVE', now())`,
      [seed.appUserId, seed.orgId, seed.empId],
    );
    await sql.query(
      `INSERT INTO applications (
        id, organization_id, kind, name, normalized_name,
        business_owner_employee_id, data_sensitivity,
        comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox,
        is_communication_service
      ) VALUES ($1, $2, 'INTERNAL', 'Internal App', 'internal app', $3, 'LOW', false, false, false, false)`,
      [appId, seed.orgId, seed.empId],
    );
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type)
       VALUES ($1, $2, $3, 'Internal Plan', 'internal plan', 'K5')`,
      [seed.planId, seed.orgId, appId],
    );

    return seed;
  }

  async function insertRequest(seed: Seed, state: string): Promise<string> {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO access_requests (
        id, organization_id, branch, state, plan_id, requester_employee_id,
        department_id, cost_center_id, business_reason, term_months, policy,
        created_by_app_user_id, submitted_at
      ) VALUES ($1, $2, 'INTERNAL_FREE', $3::"AccessRequestState", $4, $5, $6, $7, 'Testing', 6, '{"version": 1}'::jsonb, $8, now())`,
      [id, seed.orgId, state, seed.planId, seed.empId, seed.deptId, seed.costCenterId, seed.appUserId],
    );

    return id;
  }

  async function insertStep(
    requestId: string,
    seed: Seed,
    kind: 'NEED' | 'FINANCE_REVIEW',
    state: 'PENDING' | 'WAITING',
    sequence: number,
  ): Promise<string> {
    const id = randomUUID();
    const held = state === 'PENDING';
    await sql.query(
      `INSERT INTO access_request_steps
         (id, request_id, kind, sequence, state, assignee_employee_id, routing_row, waiting_reason, sla_working_days, assigned_at)
       VALUES ($1, $2, $3::"AccessRequestStepKind", $4, $5::"AccessRequestStepState", $6, 9, $7, 2, $8)`,
      [
        id,
        requestId,
        kind,
        sequence,
        state,
        held ? seed.empId : null,
        held ? null : kind === 'NEED' ? 'NO_DEPARTMENT_HEAD' : 'NO_FINANCE_REVIEWER',
        held ? new Date() : null,
      ],
    );

    return id;
  }

  const stateOf = async (id: string) =>
    (await sql.query<{ state: string }>(`SELECT state FROM access_requests WHERE id = $1`, [id])).rows[0].state;
  const sqlState = async (text: string, values: unknown[] = []): Promise<string | null> => {
    try {
      await sql.query(text, values);

      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    }
  };

  it(
    'BR-MF1-06g: adds the outcome, the reasons, the Cost Center and the levels, and keeps a check made before as it was, with no outcome',
    async () => {
      const seed = await startThrough(migrationBefore(OUTCOMES));
      const requestId = await insertRequest(seed, 'PENDING');
      const legacy = randomUUID();
      await sql.query(
        `INSERT INTO request_budget_checks (id, organization_id, request_id, number, trigger, route, stale_cost_evidence, plan_line_overdue, period_closed, off_plan, currency, binding_total_minor)
         VALUES ($1, $2, $3, 1, 'SUBMISSION'::"BudgetCheckTrigger", 'FINANCE_REVIEW'::"BudgetCheckRoute", false, true, false, false, 'VND', 10)`,
        [legacy, seed.orgId, requestId],
      );

      const deploy = await deployMigrations(database, { through: OUTCOMES });
      expect(deploy.code).toBe(0);

      const old = await sql.query(
        `SELECT outcome, block_reasons, over_base_by_minor, over_by_minor, cost_center_id, route::text AS route FROM request_budget_checks WHERE id = $1`,
        [legacy],
      );
      expect(old.rows).toEqual([
        {
          outcome: null,
          block_reasons: [],
          over_base_by_minor: null,
          over_by_minor: null,
          cost_center_id: null,
          route: 'FINANCE_REVIEW',
        },
      ]);
      const columns = await sql.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'request_budget_check_years'
          AND column_name IN ('base_minor', 'reserve_minor', 'remaining_base_minor', 'remaining_with_reserve_minor')`,
      );
      expect(columns.rowCount).toBe(4);
      const table = await sql.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'request_reserve_confirmations'`,
      );
      expect(table.rowCount).toBe(1);
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  it(
    'BR-MF1-06g: refuses a new check with no outcome or going to Finance, and takes one that fits its outcome',
    async () => {
      const seed = await startThrough(OUTCOMES);
      const requestId = await insertRequest(seed, 'PENDING');
      const insert = (
        number: number,
        over: { route?: string; outcome?: string | null; reasons?: string[]; overBy?: number | null },
      ) =>
        sqlState(
          `INSERT INTO request_budget_checks (id, organization_id, request_id, number, trigger, route, outcome, block_reasons, over_by_minor, stale_cost_evidence, plan_line_overdue, period_closed, off_plan, currency, binding_total_minor)
           VALUES (gen_random_uuid(), $1, $2, $3, 'SUBMISSION'::"BudgetCheckTrigger", $4::"BudgetCheckRoute", $5::"BudgetCheckOutcome", $6::text[], $7, false, false, false, false, 'VND', 10)`,
          [
            seed.orgId,
            requestId,
            number,
            over.route ?? 'SPEND_APPROVAL',
            over.outcome === undefined ? 'WITHIN_BASE' : over.outcome,
            over.reasons ?? [],
            over.overBy ?? null,
          ],
        );

      expect(await insert(1, {})).toBeNull();
      expect(
        await insert(2, { route: 'BLOCKED', outcome: 'BLOCKED', reasons: ['OVER_RESERVE'], overBy: 4 }),
      ).toBeNull();
      expect(await insert(3, { outcome: null })).toBe(CHECK);
      expect(await insert(4, { route: 'FINANCE_REVIEW' })).toBe(CHECK);
      expect(await insert(5, { route: 'BLOCKED', outcome: 'BLOCKED', reasons: ['OVER_RESERVE'] })).toBe(CHECK);
      expect(await insert(6, { reasons: ['NO_APPROVED_BUDGET'] })).toBe(CHECK);
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  it(
    'Q-26: sends what waited for Finance or a budget back to the queue of its head, closes the review and the question, and touches nothing else',
    async () => {
      const seed = await startThrough(OUTCOMES);
      const reviewed = await insertRequest(seed, 'AWAITING_FINANCE_REVIEW');
      const reviewStep = await insertStep(reviewed, seed, 'FINANCE_REVIEW', 'PENDING', 1);
      const question = randomUUID();
      await sql.query(
        `INSERT INTO budget_information_requests (id, request_id, step_id, asked_by_employee_id, question, asked_at)
         VALUES ($1, $2, $3, $4, 'Is there room?', now())`,
        [question, reviewed, reviewStep, seed.empId],
      );
      const awaiting = await insertRequest(seed, 'AWAITING_BUDGET');
      const parked = await insertRequest(seed, 'WAITING_CONTROLLED');
      const parkedStep = await insertStep(parked, seed, 'FINANCE_REVIEW', 'WAITING', 1);
      const headless = await insertRequest(seed, 'WAITING_CONTROLLED');
      const needStep = await insertStep(headless, seed, 'NEED', 'WAITING', 1);
      const pending = await insertRequest(seed, 'PENDING');

      const deploy = await deployMigrations(database, { through: RETIRED });
      expect(deploy.code).toBe(0);

      expect(await Promise.all([reviewed, awaiting, parked].map(stateOf))).toEqual([
        'AWAITING_SPEND_SUBMISSION',
        'AWAITING_SPEND_SUBMISSION',
        'AWAITING_SPEND_SUBMISSION',
      ]);
      // A request that waits for something else is left alone.
      expect(await Promise.all([headless, pending].map(stateOf))).toEqual(['WAITING_CONTROLLED', 'PENDING']);
      const steps = await sql.query<{ id: string; state: string; waiting_reason: string | null; decided: boolean }>(
        `SELECT id, state::text, waiting_reason, decided_at IS NOT NULL AS decided FROM access_request_steps WHERE id = ANY($1::uuid[])`,
        [[reviewStep, parkedStep, needStep]],
      );
      const byId = new Map(steps.rows.map((row) => [row.id, row]));
      expect(byId.get(reviewStep)).toMatchObject({ state: 'CLOSED', waiting_reason: null, decided: true });
      expect(byId.get(parkedStep)).toMatchObject({ state: 'CLOSED', waiting_reason: null, decided: true });
      expect(byId.get(needStep)).toMatchObject({ state: 'WAITING', waiting_reason: 'NO_DEPARTMENT_HEAD' });
      const closed = await sql.query(
        `SELECT state::text, close_reason::text, closed_at IS NOT NULL AS closed FROM budget_information_requests WHERE id = $1`,
        [question],
      );
      expect(closed.rows).toEqual([{ state: 'CLOSED', close_reason: 'STEP_CLOSED', closed: true }]);
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  it(
    'QĐ-97c: refuses from then on a request that waits for Finance, a new review step, a new review, a new question and an override',
    async () => {
      const seed = await startThrough(RETIRED);
      const id = await insertRequest(seed, 'PENDING');

      expect(await sqlState(`UPDATE access_requests SET state = 'AWAITING_FINANCE_REVIEW' WHERE id = $1`, [id])).toBe(
        CHECK,
      );
      expect(await sqlState(`UPDATE access_requests SET state = 'AWAITING_BUDGET' WHERE id = $1`, [id])).toBe(CHECK);
      expect(
        await sqlState(`UPDATE access_requests SET state = 'AWAITING_SPEND_SUBMISSION' WHERE id = $1`, [id]),
      ).toBeNull();
      await expect(insertStep(id, seed, 'FINANCE_REVIEW', 'PENDING', 1)).rejects.toMatchObject({ code: CHECK });
      expect(await insertStep(id, seed, 'NEED', 'PENDING', 2)).toEqual(expect.any(String));
      expect(
        await sqlState(
          `INSERT INTO request_budget_checks (id, organization_id, request_id, number, trigger, route, outcome, currency, binding_total_minor, stale_cost_evidence, plan_line_overdue, period_closed, off_plan)
           VALUES (gen_random_uuid(), $1, $2, 1, 'PLAN_LINE_MOVED'::"BudgetCheckTrigger", 'SPEND_APPROVAL'::"BudgetCheckRoute", 'WITHIN_BASE'::"BudgetCheckOutcome", 'VND', 1, false, false, false, false)`,
          [seed.orgId, id],
        ),
      ).toBe(CHECK);
      expect(
        await sqlState(
          `INSERT INTO request_budget_checks (id, organization_id, request_id, number, trigger, route, outcome, currency, binding_total_minor, stale_cost_evidence, plan_line_overdue, period_closed, off_plan)
           VALUES (gen_random_uuid(), $1, $2, 2, 'RESERVE_CONFIRMATION'::"BudgetCheckTrigger", 'SPEND_APPROVAL'::"BudgetCheckRoute", 'WITHIN_BASE'::"BudgetCheckOutcome", 'VND', 1, false, false, false, false)`,
          [seed.orgId, id],
        ),
      ).toBeNull();
      const role = await sql.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'SlaReminderRole' AND e.enumlabel = 'REQUESTER'`,
      );
      expect(role.rowCount).toBe(1);
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
