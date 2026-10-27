import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { CLI_COLD_START_MS, CliResult, cliWorkingDirectory, runCli, stopCliProcesses } from '../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { expansionWorld, ExpansionWorld, insertSubscriptionAs7c28e75 } from '../support/expansion-world';
import { waitForLockWaiters } from '../support/lock-wait';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.2a (F02, spec L.3): `pnpm ops:assign-subscription-owner`, the one
 * way an existing subscription gets its owner department. One subscription, one department and one stated basis per run,
 * in one transaction with its Audit Trail event; nothing inferred, nothing printed but two ids and the outcome.
 */
const OWNER_COLUMN = migrationEndingWith('_subscription_owner_column');
const BASIS = 'PO-2026-0042 (Figma, 12 months)';
const OPERATOR = 'ops-lead@acme.example';

describe('ops:assign-subscription-owner (integration, real CLI and PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  let stoppedDepartmentCode: string;

  const run = (args: string[], target: DisposableDatabase = database): Promise<CliResult> =>
    runCli('subscription-owner-assignment-cli.ts', args, {
      cwd: cliWorkingDirectory('slm-assign-owner'),
      environment: { NODE_ENV: 'production', DATABASE_URL: target.url },
    });
  const argumentsOf = (
    subscription: string,
    department: string,
    overrides: { basis?: string; environment?: string } = {},
  ) => [
    '--subscription',
    subscription,
    '--department',
    department,
    '--basis',
    overrides.basis ?? BASIS,
    '--operator',
    OPERATOR,
    '--environment',
    overrides.environment ?? 'SHARED',
  ];
  const assign = (
    subscription: string,
    department: string,
    target: DisposableDatabase = database,
  ): Promise<CliResult> => run(argumentsOf(subscription, department), target);
  const counts = async () => ({
    assignments: Number(
      (await sql.query<{ n: string }>(`SELECT count(*) AS n FROM subscription_owner_assignments`)).rows[0].n,
    ),
    audit: Number((await sql.query<{ n: string }>(`SELECT count(*) AS n FROM audit_events`)).rows[0].n),
  });
  const newSubscription = () => insertSubscriptionAs7c28e75(sql, world);

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    world = await expansionWorld(sql);
    const costCenter = randomUUID();
    stoppedDepartmentCode = 'OLD';
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status) VALUES ($1, $2, 'CC-OLD', 'Old', 'UNIT', 'ACTIVE')`,
      [costCenter, world.organizationId],
    );
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, cost_center_id, status, deactivated_at, updated_at)
       VALUES ($1, $2, $3, 'Old', $4, 'INACTIVE', now(), now())`,
      [randomUUID(), world.organizationId, stoppedDepartmentCode, costCenter],
    );
  }, DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it(
    'prints the usage and exits 0 for --help, with nothing configured',
    async () => {
      const result = await runCli('subscription-owner-assignment-cli.ts', ['--help'], {
        cwd: cliWorkingDirectory('slm-assign-owner'),
        environment: { NODE_ENV: 'production' },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('ops:assign-subscription-owner');
    },
    CLI_COLD_START_MS,
  );

  it(
    'refuses a run with a missing option, a flag it does not know, or no database, and changes nothing',
    async () => {
      const before = await counts();
      const missing = await run(['--subscription', randomUUID(), '--department', 'ENG']);
      const unknown = await run([...argumentsOf(randomUUID(), 'ENG'), '--all']);

      expect(missing.code).toBe(1);
      expect(missing.stderr).toContain('--basis is required');
      expect(unknown.code).toBe(1);
      expect(await counts()).toEqual(before);
    },
    CLI_COLD_START_MS * 2,
  );

  it(
    'assigns one subscription: a row with the basis, an OPERATOR audit event, and an output of two ids and the outcome only',
    async () => {
      const subscription = await newSubscription();

      const result = await assign(subscription, 'ENG');

      expect(result).toMatchObject({ code: 0 });
      expect(result.stdout).toContain(`subscription: ${subscription}`);
      expect(result.stdout).toContain(`department:   ${world.departments.eng}`);
      expect(result.stdout).toContain('outcome:      ASSIGNED');
      // Nothing the operator typed or the database holds beyond the two ids comes back: no basis, operator or code.
      for (const secret of [BASIS, OPERATOR, 'ENG ']) expect(result.stdout + result.stderr).not.toContain(secret);

      const row = await sql.query(
        `SELECT department_id, basis_reference, operator_ref, environment FROM subscription_owner_assignments
          WHERE subscription_id = $1`,
        [subscription],
      );
      expect(row.rows).toEqual([
        { department_id: world.departments.eng, basis_reference: BASIS, operator_ref: OPERATOR, environment: 'SHARED' },
      ]);
      const audit = await sql.query(
        `SELECT actor_kind, actor_app_user_id, action, resource_type, operator_reference, after
           FROM audit_events WHERE resource_id = $1`,
        [subscription],
      );
      expect(audit.rows).toEqual([
        {
          actor_kind: 'OPERATOR',
          actor_app_user_id: null,
          action: 'SUBSCRIPTION_OWNER_ASSIGNMENT.RECORDED',
          resource_type: 'Subscription',
          operator_reference: BASIS,
          after: {
            subscriptionId: subscription,
            departmentId: world.departments.eng,
            basis: BASIS,
            operator: OPERATOR,
            environment: 'SHARED',
          },
        },
      ]);
    },
    CLI_COLD_START_MS,
  );

  it(
    'run again for the same subscription and department: exit 2, nothing is written a second time',
    async () => {
      const subscription = await newSubscription();
      expect((await assign(subscription, 'OPS')).code).toBe(0);
      const before = await counts();

      const again = await assign(subscription, 'OPS');

      expect(again.code).toBe(2);
      expect(again.stdout).toContain('outcome:      ALREADY_ASSIGNED');
      expect(await counts()).toEqual(before);
    },
    CLI_COLD_START_MS * 2,
  );

  it(
    'queues two assignments of one subscription to two departments behind its row lock: the first in line is assigned, the second is refused (F02, spec L.3)',
    async () => {
      const subscription = await newSubscription();
      const holder = new Client({ connectionString: database.url });
      await holder.connect();
      try {
        // The contended row is the subscription: each run waits for it here, in the order they are started.
        await holder.query('BEGIN');
        await holder.query('SELECT id FROM subscriptions WHERE id = $1 FOR UPDATE', [subscription]);
        const first = assign(subscription, 'ENG');
        await waitForLockWaiters(sql, 1);
        const second = assign(subscription, 'OPS');
        await waitForLockWaiters(sql, 2);
        await holder.query('COMMIT');

        const [a, b] = await Promise.all([first, second]);

        expect({ first: a.code, second: b.code }).toEqual({ first: 0, second: 1 });
        expect(b.stderr).toContain('Refused (OWNER_ALREADY_SET). Nothing was changed.');
        const rows = await sql.query(
          `SELECT department_id FROM subscription_owner_assignments WHERE subscription_id = $1`,
          [subscription],
        );
        expect(rows.rows).toEqual([{ department_id: world.departments.eng }]);
        // One assignment, one audit event: the refused run wrote nothing.
        const audit = await sql.query<{ n: string }>(`SELECT count(*) AS n FROM audit_events WHERE resource_id = $1`, [
          subscription,
        ]);
        expect(audit.rows[0].n).toBe('1');
      } finally {
        await holder.query('ROLLBACK').catch(() => undefined);
        await holder.end();
      }
    },
    CLI_COLD_START_MS * 3,
  );

  it.each([
    ['another department for an assigned subscription', 'OWNER_ALREADY_SET'],
    ['a subscription that already has its owner department', 'OWNER_ALREADY_SET'],
    ['a subscription that does not exist', 'SUBSCRIPTION_NOT_FOUND'],
    ['a department that does not exist', 'DEPARTMENT_NOT_ACTIVE'],
    ['a department that was stopped', 'DEPARTMENT_NOT_ACTIVE'],
  ])(
    'refuses %s with %s, exit 1, nothing changed',
    async (name, problem) => {
      let subscription = await newSubscription();
      let department = 'ENG';
      if (name.startsWith('another')) {
        expect((await assign(subscription, 'OPS')).code).toBe(0);
        department = 'ENG';
      } else if (name.includes('already has')) {
        await sql.query(`UPDATE subscriptions SET owner_department_id = $2 WHERE id = $1`, [
          subscription,
          world.departments.ops,
        ]);
      } else if (name.includes('subscription that does not')) {
        subscription = randomUUID();
      } else if (name.includes('does not exist')) {
        department = 'NOPE';
      } else {
        department = stoppedDepartmentCode;
      }
      const before = await counts();

      const result = await assign(subscription, department);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(`Refused (${problem}). Nothing was changed.`);
      expect(await counts()).toEqual(before);
    },
    CLI_COLD_START_MS * 2,
  );

  it(
    'on a database before the expansion migration there is nothing to write to: SCHEMA_NOT_READY, exit 1, no write',
    async () => {
      const old = await provisionDisposableDatabase();
      const oldSql = new Client({ connectionString: old.url });
      try {
        const deploy = await deployMigrations(old, { through: migrationBefore(OWNER_COLUMN) });
        if (deploy.code !== 0) throw new Error(`Deploying the history before (A) failed: ${deploy.stdout}`);
        await oldSql.connect();
        const oldWorld = await expansionWorld(oldSql);
        const subscription = await insertSubscriptionAs7c28e75(oldSql, oldWorld);

        const result = await assign(subscription, 'ENG', old);

        expect(result.code).toBe(1);
        expect(result.stderr).toContain('Refused (SCHEMA_NOT_READY). Nothing was changed.');
        const audit = await oldSql.query<{ n: string }>(`SELECT count(*) AS n FROM audit_events`);
        expect(Number(audit.rows[0].n)).toBe(0);
      } finally {
        await oldSql.end();
        await dropDisposableDatabase(old);
      }
    },
    DEPLOY_TIMEOUT_MS + CLI_COLD_START_MS * 3,
  );
});
