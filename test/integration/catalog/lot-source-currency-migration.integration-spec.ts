import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PROJECT_ROOT } from '../../support/cli-process';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';
import { lineWorld } from '../../support/w3-lines-world';

const TARGET = migrationEndingWith('_w3_audit_lot_source_currency_check');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

/** A database just before the check, with the lots already born from the perpetual purchases they came from. */
async function before() {
  const database = await provisionDisposableDatabase();
  const sql = new Client({ connectionString: database.url });
  await sql.connect();
  const deployed = await deployMigrations(database, { through: migrationBefore(TARGET) });
  if (deployed.code !== 0) throw new Error(`Deploying history failed: ${deployed.stdout}`);

  return { database, sql, world: await lineWorld(sql) };
}

/** A lot born from `subscriptionId`, written the way the migration of the lots writes it. */
async function lotBornFrom(sql: Client, organizationId: string, planId: string, subscriptionId: string) {
  await sql.query(
    `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose, legacy_subscription_id, updated_at)
     VALUES ($1, $2, $3, '2026-09-01', 3, 1500000, 'OPENING', $4, now())`,
    [randomUUID(), organizationId, planId, subscriptionId],
  );
}

/**
 * A lot born from a subscription takes its price as dong. The check stops the deploy, naming the subscription, when the source was priced in
 * another currency, and lets a source in dong (or without a price) through.
 */
describe('lot source currency check migration (integration, real PostgreSQL)', () => {
  it(
    'stops, naming the subscription, when a lot was born from a subscription priced in dollars',
    async () => {
      const { database, sql, world: w } = await before();
      try {
        const { vendorId } = await w.vendor('JetBrains');
        const plan = await w.plan(vendorId, 'IntelliJ', 'K4', 'ACCOUNT');
        const inDollars = await w.perpetual(plan);
        await sql.query(`UPDATE subscriptions SET unit_price_currency = 'USD' WHERE id = $1`, [inDollars]);
        await lotBornFrom(sql, w.organizationId, plan, inDollars);

        await expect(sql.query(sqlOf(TARGET))).rejects.toMatchObject({
          code: '23514',
          constraint: 'license_lots_source_priced_in_vnd',
          message: expect.stringContaining(inDollars) as string,
        });
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );

  it(
    'passes when every lot was born from a subscription priced in dong or not priced',
    async () => {
      const { database, sql, world: w } = await before();
      try {
        const { vendorId } = await w.vendor('JetBrains');
        const plan = await w.plan(vendorId, 'IntelliJ', 'K4', 'ACCOUNT');
        await lotBornFrom(sql, w.organizationId, plan, await w.perpetual(plan));
        await lotBornFrom(
          sql,
          w.organizationId,
          plan,
          await w.perpetual(plan, { status: 'DRAFT', unitPriceMinor: null }),
        );
        // A subscription in dollars that no lot came from is not the concern of this check.
        const notALotSource = await w.perpetual(plan);
        await sql.query(`UPDATE subscriptions SET unit_price_currency = 'USD' WHERE id = $1`, [notALotSource]);

        await expect(sql.query(sqlOf(TARGET))).resolves.toBeDefined();
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );
});
