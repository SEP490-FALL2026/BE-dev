import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { activateCostCenterLink, firstFinalMigration, lastCompatibilityMigration } from '../support/compat-release';
import { stopCliProcesses } from '../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { expansionWorld, ExpansionWorld } from '../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, spec L.3, L.4, L.10, L.11 (F02, F01, F03, F41): the migrations of the final release
 * that cannot be undone each begin with a block that raises BEFORE anything is written, naming ids only, when the data is not
 * ready (`pnpm ops:preflight` is `BLOCKED` for the same reasons, earlier). The history is deployed through the migration before the
 * guard, the one bad row is put in, and the guard migration is deployed alone: it fails with the ids, and the rows of every table it
 * could touch are byte for byte what they were before.
 */
const FINGERPRINTED = [
  'subscriptions',
  'subscription_owner_assignments',
  'audit_events',
  'cost_centers',
  'departments',
  'personnel_notices',
  'department_transfers',
  'license_assignments',
  'employee_placements',
] as const;

async function fingerprint(sql: Client): Promise<string> {
  const parts: string[] = [];
  for (const table of FINGERPRINTED) {
    const { rows } = await sql.query<{ sum: string }>(
      `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS sum FROM ${table} t`,
    );
    parts.push(`${table}=${rows[0].sum}`);
  }

  return parts.join(';');
}

interface Prepared {
  database: DisposableDatabase;
  sql: Client;
  world: ExpansionWorld;
}

/** A database with the compatibility history, the world around the subscriptions, and the operator steps asked for. */
async function prepare(options: { assignEverything: boolean; activate: boolean }): Promise<Prepared> {
  const database = await provisionDisposableDatabase();
  const sql = new Client({ connectionString: database.url });
  await sql.connect();
  const before = await deployMigrations(database, { through: lastCompatibilityMigration() });
  if (before.code !== 0) throw new Error(`Deploying the compatibility history failed: ${before.stdout}`);
  const world = await expansionWorld(sql);
  const subscription = randomUUID();
  await sql.query(
    `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, auto_renew, allows_mid_term_reduction)
     VALUES ($1, $2, $3, 'TERM', 'DRAFT', false, false)`,
    [subscription, world.organizationId, world.planId],
  );
  if (options.assignEverything) {
    await sql.query(
      `INSERT INTO subscription_owner_assignments
         (id, organization_id, subscription_id, department_id, basis_reference, operator_ref, environment)
       VALUES (gen_random_uuid(), $1, $2, $3, 'PO-2026-17', 'ops-1', 'LOCAL_TEST')`,
      [world.organizationId, subscription, world.departments.eng],
    );
  }
  if (options.activate) await activateCostCenterLink(sql, world.organizationId);

  return { database, sql, world };
}

/** Deploys through the migration before `guard`, runs `engineer`, and expects the deploy of `guard` alone to fail untouched. */
async function expectGuard(
  prepared: Prepared,
  guard: string,
  engineer: (prepared: Prepared) => Promise<string>,
): Promise<void> {
  const { database, sql } = prepared;
  const through = await deployMigrations(database, { through: migrationBefore(guard) });
  if (through.code !== 0) throw new Error(`Deploying through ${migrationBefore(guard)} failed: ${through.stdout}`);
  const badId = await engineer(prepared);
  const before = await fingerprint(sql);

  const attempt = await deployMigrations(database, { through: guard });

  expect(attempt.code).not.toBe(0);
  expect(`${attempt.stdout}\n${attempt.stderr}`).toContain(badId);
  expect(await fingerprint(sql)).toBe(before);
}

describe('the guards of the final release raise before they write (integration, PostgreSQL)', () => {
  const open: Prepared[] = [];
  const run = async (options: { assignEverything: boolean; activate: boolean }): Promise<Prepared> => {
    const prepared = await prepare(options);
    open.push(prepared);

    return prepared;
  };

  afterEach(async () => {
    for (const prepared of open.splice(0)) {
      await prepared.sql.end();
      await dropDisposableDatabase(prepared.database);
    }
    stopCliProcesses();
  });

  it(
    '(B): a subscription that has no recorded assignment',
    async () => {
      const prepared = await run({ assignEverything: false, activate: true });
      const first = firstFinalMigration();
      const { rows } = await prepared.sql.query<{ id: string }>(
        `SELECT id FROM subscriptions WHERE owner_department_id IS NULL`,
      );
      const before = await fingerprint(prepared.sql);

      const attempt = await deployMigrations(prepared.database, { through: first });

      expect(attempt.code).not.toBe(0);
      expect(`${attempt.stdout}\n${attempt.stderr}`).toContain(rows[0].id);
      expect(await fingerprint(prepared.sql)).toBe(before);
    },
    DEPLOY_TIMEOUT_MS * 3,
  );

  it(
    'F01: a Cost Center that no department has',
    async () => {
      const prepared = await run({ assignEverything: true, activate: true });
      await expectGuard(prepared, migrationEndingWith('_cost_center_belongs_to_department'), async ({ sql, world }) => {
        const free = randomUUID();
        await sql.query(
          `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, updated_at) VALUES ($1, $2, 'CC-FREE', 'free', 'UNIT', 'ACTIVE', now())`,
          [free, world.organizationId],
        );

        return free;
      });
    },
    DEPLOY_TIMEOUT_MS * 4,
  );

  it(
    'F01: an organization that never ran the activation step',
    async () => {
      const prepared = await run({ assignEverything: true, activate: false });
      await expectGuard(prepared, migrationEndingWith('_cost_center_belongs_to_department'), ({ world }) =>
        Promise.resolve(world.organizationId),
      );
    },
    DEPLOY_TIMEOUT_MS * 4,
  );

  it(
    'F63: a proposal given back by the old path of refusing a version that cannot be reconciled without a guess',
    async () => {
      const prepared = await run({ assignEverything: true, activate: true });
      await expectGuard(prepared, migrationEndingWith('_budget_lifecycle_structure'), async ({ sql, world }) => {
        const proposal = randomUUID();
        const version = randomUUID();
        const person = world.ownerEmployeeId;
        await sql.query(
          `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency, submitted_by_employee_id,
              submitted_at, returned_reason, returned_by_employee_id, returned_at)
           VALUES ($1, $2, $3, 2026, 'RETURNED', 1000, 'VND', $4, '2026-08-20T10:00:00Z', 'not enough', $4, '2026-09-01T10:00:00Z')`,
          [proposal, world.organizationId, world.costCenters.eng, person],
        );
        await sql.query(
          `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, proposal_id, base_minor, reserve_minor,
              total_minor, currency, high_value_percent, created_by_employee_id, sent_by_employee_id, sent_at)
           VALUES ($1, $2, $3, 2026, 1, 'INITIAL', 'REJECTED', $4, 1000, 0, 1000, 'VND', 20, $5, $5, '2026-08-20T10:00:00Z')`,
          [version, world.organizationId, world.costCenters.eng, proposal, person],
        );
        await sql.query(
          `INSERT INTO budget_version_decisions (id, organization_id, version_id, decision, reason, decided_by_employee_id, total_minor, currency, decided_at)
           VALUES (gen_random_uuid(), $1, $2, 'REJECTED', 'not enough', $3, 1000, 'VND', '2026-09-01T10:00:00Z')`,
          [world.organizationId, version, person],
        );
        // A proposal sent after the return that does not point back at it: nothing says whose it is.
        await sql.query(
          `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency, submitted_by_employee_id, submitted_at)
           VALUES (gen_random_uuid(), $1, $2, 2026, 'SUBMITTED', 1200, 'VND', $3, '2026-09-02T10:00:00Z')`,
          [world.organizationId, world.costCenters.eng, person],
        );

        return proposal;
      });
    },
    DEPLOY_TIMEOUT_MS * 4,
  );

  it(
    'F03/F41: a BM-09 notice of a change of job title that still waits',
    async () => {
      const prepared = await run({ assignEverything: true, activate: true });
      await expectGuard(prepared, migrationEndingWith('_job_title_history_names'), async ({ sql, world }) => {
        const notice = randomUUID();
        await sql.query(
          `INSERT INTO personnel_notices (id, code, organization_id, employee_id, kind, proposed_on, sender_employee_id, sender_department_id, due_on)
         VALUES ($1, 'BM09-2026-000001', $2, $3, 'JOB_TITLE_CHANGE', CURRENT_DATE, $3, $4, CURRENT_DATE)`,
          [notice, world.organizationId, world.ownerEmployeeId, world.departments.eng],
        );

        return notice;
      });
    },
    DEPLOY_TIMEOUT_MS * 4,
  );

  it(
    'F03/F41: a transfer that waits and changes the job title only',
    async () => {
      const prepared = await run({ assignEverything: true, activate: true });
      await expectGuard(prepared, migrationEndingWith('_job_title_history_names'), async ({ sql, world }) => {
        const title = randomUUID();
        const lead = randomUUID();
        const closes = randomUUID();
        const opens = randomUUID();
        const transfer = randomUUID();
        await sql.query(
          `INSERT INTO job_titles (id, organization_id, name, normalized_name, updated_at)
         VALUES ($1, $3, 'Engineer', 'engineer', now()), ($2, $3, 'Lead', 'lead', now())`,
          [title, lead, world.organizationId],
        );
        await sql.query(
          `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from, valid_to)
         VALUES ($1, $3, $4, $5, $6, '2026-01-01', CURRENT_DATE + 3),
                ($2, $3, $4, $5, $6, CURRENT_DATE + 3, NULL)`,
          [closes, opens, world.organizationId, world.ownerEmployeeId, world.departments.eng, title],
        );
        await sql.query(
          `INSERT INTO department_transfers (id, organization_id, employee_id, from_department_id, to_department_id, from_job_title_id,
            to_job_title_id, effective_on, closes_placement_id, opens_placement_id, grounds_type, grounds_reference, grounds_issuer,
            grounds_issued_on, recorded_by_app_user_id)
         VALUES ($1, $2, $3, $4, $4, $7, $8, CURRENT_DATE + 3, $5, $6, 'DECISION', 'QD-1', 'HR', CURRENT_DATE, gen_random_uuid())`,
          [transfer, world.organizationId, world.ownerEmployeeId, world.departments.eng, closes, opens, title, lead],
        );

        return transfer;
      });
    },
    DEPLOY_TIMEOUT_MS * 4,
  );
});
