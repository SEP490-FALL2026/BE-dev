import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import {
  expansionWorld,
  ExpansionWorld,
  insertSubscriptionAs7c28e75,
  sqlState,
  updateSubscriptionAs7c28e75,
} from '../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
  schemaDrift,
} from '../support/migration-history';
import { stopCliProcesses } from '../support/cli-process';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.2a (F02, `P03-D03` = A, reviews `P03-RV-01`/`P03-RV-02`): migration
 * (A) `…_subscription_owner_column` only **adds** — a nullable `owner_department_id` and the append-only table of owner
 * assignments. It puts no trigger, CHECK or NOT NULL on `subscriptions`, because H7 runs `migrate deploy` before it
 * recreates `api` and `worker` and recovers the previous image after a failed deploy: the `7c28e75` application, which
 * sends no owner department, must keep creating, updating and reading subscriptions on this schema.
 */
const OWNER_COLUMN = migrationEndingWith('_subscription_owner_column');

async function nonInternalTriggers(sql: Client, table: string): Promise<string[]> {
  const { rows } = await sql.query<{ tgname: string }>(
    `SELECT tgname FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal ORDER BY tgname`,
    [table],
  );

  return rows.map((row) => row.tgname);
}

describe('subscription owner department, expansion migration (A) (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  let beforeA: { subscriptionId: string; triggers: string[] };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: migrationBefore(OWNER_COLUMN) });
    if (before.code !== 0) throw new Error(`Deploying the history before (A) failed: ${before.stdout}`);
    world = await expansionWorld(sql);
    beforeA = {
      subscriptionId: await insertSubscriptionAs7c28e75(sql, world),
      triggers: await nonInternalTriggers(sql, 'subscriptions'),
    };
    const deploy = await deployMigrations(database);
    if (deploy.code !== 0) throw new Error(`Deploying (A) failed: ${deploy.stdout}\n${deploy.stderr}`);
  }, DEPLOY_TIMEOUT_MS * 2);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it('only adds: a nullable owner department, no trigger on subscriptions, a subscription made before (A) reads NULL', async () => {
    const column = await sql.query<{ is_nullable: string; data_type: string }>(
      `SELECT is_nullable, data_type FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'owner_department_id'`,
    );
    expect(column.rows).toEqual([{ is_nullable: 'YES', data_type: 'uuid' }]);
    expect(await nonInternalTriggers(sql, 'subscriptions')).toEqual(beforeA.triggers);

    const checks = await sql.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'subscriptions'::regclass AND contype = 'c' AND conname LIKE '%owner%'`,
    );
    expect(checks.rows).toEqual([]);
    const owner = await sql.query<{ owner_department_id: string | null }>(
      `SELECT owner_department_id FROM subscriptions WHERE id = $1`,
      [beforeA.subscriptionId],
    );
    expect(owner.rows).toEqual([{ owner_department_id: null }]);
  });

  it('keeps the previous application valid: it creates and updates subscriptions with no owner department (the H7 window)', async () => {
    const created = await insertSubscriptionAs7c28e75(sql, world);
    await updateSubscriptionAs7c28e75(sql, created);
    await updateSubscriptionAs7c28e75(sql, beforeA.subscriptionId);

    const rows = await sql.query<{ id: string; owner_department_id: string | null; purchased_quantity: number }>(
      `SELECT id, owner_department_id, purchased_quantity FROM subscriptions WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[created, beforeA.subscriptionId]],
    );
    expect(rows.rows).toHaveLength(2);
    for (const row of rows.rows) {
      expect(row.owner_department_id).toBeNull();
      expect(row.purchased_quantity).toBe(5);
    }
  });

  it('accepts an owner department of the same organization and refuses one that is not a department (foreign key)', async () => {
    const id = await insertSubscriptionAs7c28e75(sql, world);
    expect(
      await sqlState(sql, `UPDATE subscriptions SET owner_department_id = $2 WHERE id = $1`, [
        id,
        world.departments.eng,
      ]),
    ).toBeNull();
    expect(
      await sqlState(sql, `UPDATE subscriptions SET owner_department_id = $2 WHERE id = $1`, [id, randomUUID()]),
    ).toBe('23503');
  });

  describe('subscription_owner_assignments: the durable record of the basis of an assignment', () => {
    const assign = (subscriptionId: string, overrides: { basis?: string; environment?: string } = {}) =>
      sqlState(
        sql,
        `INSERT INTO subscription_owner_assignments
           (id, organization_id, subscription_id, department_id, basis_reference, operator_ref, environment)
         VALUES ($1, $2, $3, $4, $5, 'ops-1', $6)`,
        [
          randomUUID(),
          world.organizationId,
          subscriptionId,
          world.departments.ops,
          overrides.basis ?? 'PO-2026-0042',
          overrides.environment ?? 'LOCAL_TEST',
        ],
      );

    it('takes one row for a subscription that has no owner department yet, and only one', async () => {
      const subscription = await insertSubscriptionAs7c28e75(sql, world);
      expect(await assign(subscription)).toBeNull();
      expect(await assign(subscription)).toBe('23505');
    });

    it('refuses a row for a subscription that already has an owner department (23514)', async () => {
      const subscription = await insertSubscriptionAs7c28e75(sql, world);
      await sql.query(`UPDATE subscriptions SET owner_department_id = $2 WHERE id = $1`, [
        subscription,
        world.departments.eng,
      ]);
      expect(await assign(subscription)).toBe('23514');
    });

    it('keeps the basis between 2 and 200 characters and the environment to the two known values', async () => {
      const subscription = await insertSubscriptionAs7c28e75(sql, world);
      expect(await assign(subscription, { basis: 'x' })).toBe('23514');
      expect(await assign(subscription, { basis: '  ' })).toBe('23514');
      expect(await assign(subscription, { basis: 'y'.repeat(201) })).toBe('23514');
      expect(await assign(subscription, { environment: 'PRODUCTION' })).toBe('23514');
      expect(await assign(subscription, { basis: 'y'.repeat(200), environment: 'SHARED' })).toBeNull();
    });

    it('is append-only: no update, no delete, no truncate (the record is the basis, QĐ-89e)', async () => {
      const subscription = await insertSubscriptionAs7c28e75(sql, world);
      await assign(subscription);

      expect(
        await sqlState(
          sql,
          `UPDATE subscription_owner_assignments SET basis_reference = 'changed' WHERE subscription_id = $1`,
          [subscription],
        ),
      ).toBe('23001');
      expect(
        await sqlState(sql, `DELETE FROM subscription_owner_assignments WHERE subscription_id = $1`, [subscription]),
      ).toBe('23001');
      expect(await sqlState(sql, `TRUNCATE subscription_owner_assignments`)).toBe('23001');
    });
  });

  it(
    'leaves a clean migration history and the schema exactly as prisma/models describe it (DB-16)',
    async () => {
      const history = await sql.query<{
        migration_name: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }>(`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`);
      expect(history.rows.filter((row) => row.finished_at === null || row.rolled_back_at !== null)).toEqual([]);
      expect(history.rows.map((row) => row.migration_name)).toContain(OWNER_COLUMN);
      expect((await schemaDrift(database)).code).toBe(0);
    },
    DEPLOY_TIMEOUT_MS,
  );
});
