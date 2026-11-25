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

const TARGET = migrationEndingWith('_w3_license_lots');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

/** A database just before M6, with a world in it; each case writes what it needs and runs the migration. */
async function before() {
  const database = await provisionDisposableDatabase();
  const sql = new Client({ connectionString: database.url });
  await sql.connect();
  const deployed = await deployMigrations(database, { through: migrationBefore(TARGET) });
  if (deployed.code !== 0) throw new Error(`Deploying history failed: ${deployed.stdout}`);

  return { database, sql, world: await lineWorld(sql) };
}

/**
 * Redesign wave 3, W3-24 (M6, `20261203000200_w3_license_lots`): each active perpetual purchase of a K4 plan becomes a lot with the same id, its keys
 * take the lot and bear their cost, a draft with no key becomes none, and what cannot be turned into a lot stops the migration with the subscription named.
 */
describe('M6 w3_license_lots migration (integration, real PostgreSQL)', () => {
  it(
    'turns an active perpetual purchase into a lot of the same id, with the most of what was bought, kept and used, and its keys into keys of the lot',
    async () => {
      const { database, sql, world: w } = await before();
      try {
        const { vendorId } = await w.vendor('JetBrains');
        const plan = await w.plan(vendorId, 'IntelliJ', 'K4', 'ACCOUNT');
        const bought = await w.perpetual(plan, { quantity: 2 });
        const kept = await w.perpetual(plan, { quantity: 1 });
        const draftWithoutKeys = await w.perpetual(plan, { status: 'DRAFT', quantity: 4 });
        for (let i = 0; i < 3; i += 1) await w.key(kept, false);
        await w.key(bought, false);

        await sql.query(sqlOf(TARGET));

        const lots = (
          await sql.query<{
            id: string;
            purpose: string;
            license_count: number;
            unit_price_minor: string;
            legacy_subscription_id: string;
            responsible_it_admin_employee_id: string;
          }>(
            `SELECT id, purpose, license_count, unit_price_minor::text, legacy_subscription_id, responsible_it_admin_employee_id FROM license_lots`,
          )
        ).rows;
        expect(lots.map((lot) => lot.id).sort()).toEqual([bought, kept].sort());
        expect(lots.find((lot) => lot.id === bought)).toMatchObject({
          purpose: 'OPENING',
          license_count: 2,
          unit_price_minor: '1500000',
          legacy_subscription_id: bought,
          responsible_it_admin_employee_id: w.khoa,
        });
        // Three keys kept against one purchased license: the lot holds the three.
        expect(lots.find((lot) => lot.id === kept)?.license_count).toBe(3);
        expect(lots.some((lot) => lot.id === draftWithoutKeys)).toBe(false);

        const keys = (
          await sql.query<{ subscription_id: string; license_lot_id: string; cost_borne: boolean }>(
            `SELECT subscription_id, license_lot_id, cost_borne FROM license_keys`,
          )
        ).rows;
        expect(keys).toHaveLength(4);
        for (const key of keys) {
          expect(key.license_lot_id).toBe(key.subscription_id);
          expect(key.cost_borne).toBe(true);
        }
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );

  it(
    'takes an old right with no key into the count of the lot, and a key entered against the subscription after the migration into the lot',
    async () => {
      const { database, sql, world: w } = await before();
      try {
        const { vendorId } = await w.vendor('JetBrains');
        const plan = await w.plan(vendorId, 'IntelliJ', 'K4', 'ACCOUNT');
        const purchase = await w.perpetual(plan, { quantity: 2 });
        await w.seat(purchase, plan, await w.person('OLD1'), '2026-09-02');

        await sql.query(sqlOf(TARGET));

        expect(
          Number((await sql.query<{ n: string }>(`SELECT device_activation_occupied($1) AS n`, [purchase])).rows[0].n),
        ).toBe(1);
        // An import of wave 2 still names the subscription; the database gives the key the lot that came from it.
        const keyId = await w.key(purchase);
        expect(
          (
            await sql.query<{ license_lot_id: string }>(`SELECT license_lot_id FROM license_keys WHERE id = $1`, [
              keyId,
            ])
          ).rows[0].license_lot_id,
        ).toBe(purchase);
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );

  it(
    'stops, naming the subscription, for a draft perpetual purchase that holds keys, and writes nothing',
    async () => {
      const { database, sql, world: w } = await before();
      try {
        const { vendorId } = await w.vendor('JetBrains');
        const plan = await w.plan(vendorId, 'IntelliJ', 'K4', 'ACCOUNT');
        const draft = await w.perpetual(plan, { status: 'DRAFT' });
        await w.key(draft, false);

        await expect(sql.query(sqlOf(TARGET))).rejects.toMatchObject({
          code: '23514',
          constraint: 'license_lots_convertible',
          message: expect.stringContaining(draft) as string,
        });
        expect(
          (await sql.query<{ name: string | null }>(`SELECT to_regclass('license_lots') AS name`)).rows[0].name,
        ).toBeNull();
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );

  it(
    'stops for a term subscription that holds keys',
    async () => {
      const { database, sql, world: w } = await before();
      try {
        const { vendorId, workspaceId } = await w.vendor('Claude');
        const plan = await w.plan(vendorId, 'Team', 'K2');
        const term = await w.period(plan, workspaceId);
        await w.key(term, false);

        await expect(sql.query(sqlOf(TARGET))).rejects.toMatchObject({
          code: '23514',
          constraint: 'license_lots_convertible',
          message: expect.stringContaining(term) as string,
        });
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );
});
