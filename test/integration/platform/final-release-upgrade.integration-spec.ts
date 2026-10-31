import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { activateCostCenterLink, lastCompatibilityMigration } from '../../support/compat-release';
import { stopCliProcesses } from '../../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { expansionWorld, ExpansionWorld, sqlState } from '../../support/expansion-world';
import { DEPLOY_TIMEOUT_MS, committedMigrations, deployMigrations } from '../../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Tasks 1.2c, 1.1, 1.3, 1.4, 1.5, 1.6 (F02, F01, F03, F04–F06, F20, F27, F41): the
 * migrations of the final release deployed over a database the compatibility release ran on — the history **through** the last
 * compatibility migration, the rows and the operator steps put there (the owner assignments, the Cost Center link and its
 * activation), then the rest deployed in ONE ordinary `migrate deploy`. What the rules do afterwards is proved with the SQL a
 * writer of either release could send: the constraint, not the application, says no.
 */
describe('the final release over a database the compatibility release ran on (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  const ids = {
    assigned: randomUUID(),
    ownedAlready: randomUUID(),
    placement: randomUUID(),
    employee: '',
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: lastCompatibilityMigration() });
    if (before.code !== 0) throw new Error(`Deploying the compatibility history failed: ${before.stdout}`);

    world = await expansionWorld(sql);
    // The operator steps of the compatibility release: the Cost Centers of the departments are linked by the schema (their old
    // column), the link is activated, one subscription has its owner assigned on a stated basis, one was owned from the start.
    await activateCostCenterLink(sql, world.organizationId);
    for (const id of [ids.assigned, ids.ownedAlready]) {
      await sql.query(
        `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, auto_renew, allows_mid_term_reduction)
         VALUES ($1, $2, $3, 'TERM', 'DRAFT', false, false)`,
        [id, world.organizationId, world.planId],
      );
    }
    await sql.query(`UPDATE subscriptions SET owner_department_id = $2 WHERE id = $1`, [
      ids.ownedAlready,
      world.departments.eng,
    ]);
    await sql.query(
      `INSERT INTO subscription_owner_assignments
         (id, organization_id, subscription_id, department_id, basis_reference, operator_ref, environment)
       VALUES (gen_random_uuid(), $1, $2, $3, 'PO-2026-17', 'ops-1', 'LOCAL_TEST')`,
      [world.organizationId, ids.assigned, world.departments.ops],
    );
    // A person with a job title of the catalogue, as the previous release writes it.
    const title = randomUUID();
    await sql.query(
      `INSERT INTO job_titles (id, organization_id, name, normalized_name, updated_at) VALUES ($1, $2, 'Engineer', 'engineer', now())`,
      [title, world.organizationId],
    );
    await sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from)
       VALUES ($1, $2, $3, $4, $5, '2026-01-01')`,
      [ids.placement, world.organizationId, world.ownerEmployeeId, world.departments.eng, title],
    );

    const deploy = await deployMigrations(database);
    if (deploy.code !== 0) throw new Error(`Deploying the final release failed: ${deploy.stdout}\n${deploy.stderr}`);
    ids.employee = world.ownerEmployeeId;
  }, DEPLOY_TIMEOUT_MS * 3);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it('leaves a clean migration history: one finished row for each committed folder, none rolled back', async () => {
    const { rows } = await sql.query<{ total: number; open: number; rolled: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE finished_at IS NULL)::int AS open,
              count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::int AS rolled FROM _prisma_migrations`,
    );
    expect(rows).toEqual([{ total: committedMigrations().length, open: 0, rolled: 0 }]);
  });

  describe('the owner department of a subscription (migration (B), F02)', () => {
    it('copies the department of the recorded basis, keeps the one that was set, writes one SYSTEM audit record for each copy', async () => {
      const { rows } = await sql.query<{ id: string; owner_department_id: string }>(
        `SELECT id, owner_department_id FROM subscriptions WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [[ids.assigned, ids.ownedAlready]],
      );
      const owner = Object.fromEntries(rows.map((row) => [row.id, row.owner_department_id]));
      expect(owner[ids.assigned]).toBe(world.departments.ops);
      expect(owner[ids.ownedAlready]).toBe(world.departments.eng);

      const audit = await sql.query<{ resource_id: string; actor_kind: string; correlation_id: string }>(
        `SELECT resource_id, actor_kind, correlation_id FROM audit_events WHERE action = 'SUBSCRIPTION.OWNER_SET_FROM_ASSIGNMENT'`,
      );
      expect(audit.rows.map((row) => [row.resource_id, row.actor_kind])).toEqual([[ids.assigned, 'SYSTEM']]);
      expect(audit.rows[0].correlation_id).toContain('subscription_owner_required');
    });

    it('makes the department required and unchangeable', async () => {
      const column = await sql.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'owner_department_id'`,
      );
      expect(column.rows).toEqual([{ is_nullable: 'NO' }]);
      expect(
        await sqlState(
          sql,
          `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, auto_renew, allows_mid_term_reduction)
           VALUES (gen_random_uuid(), $1, $2, 'TERM', 'DRAFT', false, false)`,
          [world.organizationId, world.planId],
        ),
      ).toBe('23502');
      expect(
        await sqlState(sql, `UPDATE subscriptions SET owner_department_id = $2 WHERE id = $1`, [
          ids.assigned,
          world.departments.eng,
        ]),
      ).toBe('23514');
      expect(
        await sqlState(
          sql,
          `UPDATE subscriptions SET owner_department_id = owner_department_id, purchased_quantity = 4 WHERE id = $1`,
          [ids.assigned],
        ),
      ).toBeNull();
    });
  });

  describe('a Cost Center belongs to one department (F01, review P03-RV-04)', () => {
    it('makes the link required, drops the old column of the department and its synchronisation', async () => {
      const columns = await sql.query<{ table_name: string; column_name: string; is_nullable: string }>(
        `SELECT table_name, column_name, is_nullable FROM information_schema.columns
          WHERE (table_name = 'cost_centers' AND column_name IN ('department_id', 'linked_at'))
             OR (table_name = 'departments' AND column_name = 'cost_center_id') ORDER BY table_name, column_name`,
      );
      expect(columns.rows).toEqual([
        { table_name: 'cost_centers', column_name: 'department_id', is_nullable: 'NO' },
        { table_name: 'cost_centers', column_name: 'linked_at', is_nullable: 'NO' },
      ]);
      const triggers = await sql.query<{ tgname: string }>(
        `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
           ('departments_cost_center_link_forward', 'cost_centers_department_link_backward', 'departments_unit_cost_center')`,
      );
      expect(triggers.rows).toEqual([]);
    });

    it('refuses a Cost Center without a department, a second ACTIVE one for a department and a change of its department', async () => {
      const free = (code: string) =>
        sqlState(
          sql,
          `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, updated_at) VALUES (gen_random_uuid(), $1, $2, 'x', 'UNIT', 'ACTIVE', now())`,
          [world.organizationId, code],
        );
      expect(await free('CC-FREE')).toBe('23502');
      expect(
        await sqlState(
          sql,
          `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at, updated_at)
           VALUES (gen_random_uuid(), $1, 'CC-SECOND', 'x', 'UNIT', 'ACTIVE', $2, now(), now())`,
          [world.organizationId, world.departments.eng],
        ),
      ).toBe('23505');
      expect(
        await sqlState(sql, `UPDATE cost_centers SET department_id = $2 WHERE id = $1`, [
          world.costCenters.eng,
          world.departments.ops,
        ]),
      ).toBe('23514');
    });
  });

  describe('the job title is free text (F03, F41, P03-D04 = A, P03-D05 = A)', () => {
    it('keeps the name of the catalogue on the history it was read on, and drops the catalogue and its columns', async () => {
      const history = await sql.query<{ job_title_name: string | null }>(
        `SELECT job_title_name FROM employee_placements WHERE id = $1`,
        [ids.placement],
      );
      expect(history.rows).toEqual([{ job_title_name: 'Engineer' }]);
      const person = await sql.query<{ job_title: string | null }>(`SELECT job_title FROM employees WHERE id = $1`, [
        ids.employee,
      ]);
      expect(person.rows).toEqual([{ job_title: 'Engineer' }]);
      const gone = await sql.query<{ job_titles: string | null }>(
        `SELECT to_regclass('job_titles')::text AS job_titles`,
      );
      expect(gone.rows).toEqual([{ job_titles: null }]);
      const columns = await sql.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE column_name IN ('job_title_id', 'from_job_title_id', 'to_job_title_id') AND table_schema = 'public'`,
      );
      expect(columns.rows).toEqual([]);
    });

    it('refuses to write a name into a new row of the history and to change one that exists', async () => {
      expect(
        await sqlState(
          sql,
          `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_name, valid_from)
           VALUES (gen_random_uuid(), $1, $2, $3, 'Invented', '2025-01-01')`,
          [world.organizationId, ids.employee, world.departments.ops],
        ),
      ).toBe('23514');
      expect(
        await sqlState(sql, `UPDATE employee_placements SET job_title_name = 'Changed' WHERE id = $1`, [ids.placement]),
      ).toBe('23514');
    });

    it('refuses a new BM-09 notice of a change of job title and a new transfer that keeps the department', async () => {
      expect(
        await sqlState(
          sql,
          `INSERT INTO personnel_notices (id, code, organization_id, employee_id, kind, proposed_on, sender_employee_id, sender_department_id, due_on)
           VALUES (gen_random_uuid(), 'BM09-2026-000001', $1, $2, 'JOB_TITLE_CHANGE', CURRENT_DATE, $2, $3, CURRENT_DATE)`,
          [world.organizationId, ids.employee, world.departments.eng],
        ),
      ).toBe('23514');
      expect(
        await sqlState(
          sql,
          `INSERT INTO department_transfers (id, organization_id, employee_id, from_department_id, to_department_id, effective_on,
              closes_placement_id, opens_placement_id, grounds_type, grounds_reference, grounds_issuer, grounds_issued_on, recorded_by_app_user_id)
           VALUES (gen_random_uuid(), $1, $2, $3, $3, CURRENT_DATE + 3, $4, $4, 'DECISION', 'QD-1', 'HR', CURRENT_DATE, gen_random_uuid())`,
          [world.organizationId, ids.employee, world.departments.eng, ids.placement],
        ),
      ).toBe('23514');
    });
  });

  describe('the standard toolset, the proportional allocation and the move of a service account are gone (F04–F06)', () => {
    it('drops every table, type and column the compatibility release no longer names', async () => {
      const tables = await sql.query<{ name: string }>(
        `SELECT n AS name FROM unnest(ARRAY['standard_toolsets', 'standard_toolset_versions', 'standard_toolset_items',
           'subscription_cost_allocations', 'subscription_cost_allocation_versions', 'subscription_cost_allocation_lines',
           'service_account_moves', 'job_titles']) AS n WHERE to_regclass(n) IS NOT NULL`,
      );
      expect(tables.rows).toEqual([]);
      const columns = await sql.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'access_requests' AND column_name IN ('outside_standard', 'outside_standard_reason')`,
      );
      expect(columns.rows).toEqual([]);
      const types = await sql.query<{ typname: string }>(
        `SELECT typname FROM pg_type WHERE typname IN ('ServiceAccountMoveStatus', 'ServiceAccountMoveConfirmerRole', 'JobTitleStatus')`,
      );
      expect(types.rows).toEqual([]);
    });
  });

  describe('the draft of a paid request (F27, P03-D01 = A)', () => {
    const insertSql = (branch: string) =>
      `INSERT INTO access_requests (id, organization_id, plan_id, branch, state, requester_employee_id, department_id, cost_center_id,
          business_reason, term_months, policy, created_by_app_user_id, submitted_at)
       VALUES (gen_random_uuid(), $1, $7, '${branch}', $2::"AccessRequestState", $3, $4, $5, 'because', 12, '{}', gen_random_uuid(), $6::timestamptz)`;
    const values = (state: string, costCenter: string | null, submittedAt: string | null) => [
      world.organizationId,
      state,
      ids.employee,
      world.departments.eng,
      costCenter,
      submittedAt,
      world.planId,
    ];
    const insertRequest = (state: string, costCenter: string | null, submittedAt: string | null) =>
      sqlState(sql, insertSql('INTERNAL_FREE'), values(state, costCenter, submittedAt));
    /** The CHECK that refused the statement (PostgreSQL tests CHECK constraints in name order), or null when accepted. */
    const refusingConstraint = async (text: string, params: unknown[]): Promise<string | null> => {
      try {
        await sql.query(text, params);
        return null;
      } catch (error) {
        return (error as { constraint?: string }).constraint ?? 'unknown';
      }
    };

    it('lets a DRAFT have no Cost Center and no submission moment, and every other state needs both', async () => {
      expect(await insertRequest('DRAFT', null, null)).toBeNull();
      // A free internal request needs no Cost Center (F91, QĐ-87g(2), migration 20261029101100); one that costs money does.
      expect(await insertRequest('PENDING', null, '2026-10-01T00:00:00Z')).toBeNull();
      expect(
        await refusingConstraint(insertSql('PAID_IN_CATALOG'), values('PENDING', null, '2026-10-01T00:00:00Z')),
      ).toBe('access_requests_cost_center_unless_draft');
      expect(await insertRequest('PENDING', world.costCenters.eng, null)).toBe('23514');
      expect(await insertRequest('DRAFT', world.costCenters.eng, '2026-10-01T00:00:00Z')).toBe('23514');
      expect(await insertRequest('PENDING', world.costCenters.eng, '2026-10-01T00:00:00Z')).toBeNull();
    });

    it('refuses a step, a budget check, a commitment and a batch item of a draft', async () => {
      const draft = randomUUID();
      await sql.query(
        `INSERT INTO access_requests (id, organization_id, plan_id, branch, state, requester_employee_id, department_id, business_reason,
            term_months, policy, created_by_app_user_id, submitted_at)
         VALUES ($1, $2, $5, 'INTERNAL_FREE', 'DRAFT', $3, $4, 'because', 12, '{}', gen_random_uuid(), NULL)`,
        [draft, world.organizationId, ids.employee, world.departments.eng, world.planId],
      );
      for (const table of [
        'access_request_steps',
        'request_budget_checks',
        'budget_commitments',
        'spend_batch_items',
      ]) {
        // The trigger runs before the row is checked for the rest of its columns: its refusal comes first.
        expect(await sqlState(sql, `INSERT INTO ${table} (request_id) VALUES ($1)`, [draft])).toBe('23514');
      }
    });
  });
});
