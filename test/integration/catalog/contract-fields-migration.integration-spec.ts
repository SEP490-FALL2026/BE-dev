import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PROJECT_ROOT, stopCliProcesses } from '../../support/cli-process';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  committedMigrations,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
  schemaDrift,
} from '../../support/migration-history';

const TARGET = migrationEndingWith('_co1_contract_fields_and_subscription_links');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/**
 * CO-1.1 (QĐ-111t, US-04-13): a contract gets a vendor, a number, the days it is in effect and a note, and a subscription of a shared stock can
 * rest on it. The history before the migration is replayed with a contract that is only a name (as the old routes made them); the migration
 * leaves it as it was, reading as incomplete, gives it `updated_at` of the day it was made, and from then on the fields can change while the
 * contract is never deleted and who made it, where and when never change. The schema it leaves is the one of `prisma/models`.
 */
describe('the migration that gives a contract its fields and links its subscriptions (integration, real PostgreSQL)', () => {
  it(
    'keeps a contract that is only a name, lets the fields change under the guard, and says no with the constraints it names',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
        const acme = randomUUID();
        await sql.query(
          `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
          [acme],
        );
        const person = randomUUID();
        const legacy = randomUUID();
        await sql.query(
          `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id, created_at)
           VALUES ($1, $2, 'Hợp đồng cũ', $3, '2026-10-01T03:00:00Z')`,
          [legacy, acme, person],
        );
        // What the contract was until now: no change at all is taken.
        expect(await sqlState(sql, `UPDATE contracts SET name = 'Khác' WHERE id = $1`, [legacy])).toBe('55000');

        await sql.query(sqlOf(TARGET));
        await sql.query(sqlOf(TARGET));

        const row = async (id: string) =>
          (
            await sql.query<{
              name: string;
              vendor_id: string | null;
              number: string | null;
              effective_from: string | null;
              effective_to: string | null;
              note: string | null;
              created_at: Date;
              updated_at: Date;
            }>(
              `SELECT name, vendor_id, number, to_char(effective_from, 'YYYY-MM-DD') AS effective_from,
                      to_char(effective_to, 'YYYY-MM-DD') AS effective_to, note, created_at, updated_at
                 FROM contracts WHERE id = $1`,
              [id],
            )
          ).rows[0];

        // The old contract is as it was: nothing of the new fields, and it was last touched when it was made.
        const old = await row(legacy);
        expect(old).toMatchObject({
          name: 'Hợp đồng cũ',
          vendor_id: null,
          number: null,
          effective_from: null,
          effective_to: null,
          note: null,
        });
        expect(old.updated_at.toISOString()).toBe(old.created_at.toISOString());

        // The second run did not move `updated_at` of a contract that was changed after the first.
        await sql.query(`UPDATE contracts SET note = 'Đã bổ sung' WHERE id = $1`, [legacy]);
        const changed = (await row(legacy)).updated_at;
        await sql.query(sqlOf(TARGET));
        expect((await row(legacy)).updated_at.toISOString()).toBe(changed.toISOString());

        // A vendor, days and a number go on the old contract; the vendor is a vendor that exists.
        const vendor = randomUUID();
        await sql.query(
          `INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'Atlassian', 'atlassian')`,
          [vendor, acme],
        );
        expect(await sqlState(sql, `UPDATE contracts SET vendor_id = $2 WHERE id = $1`, [legacy, randomUUID()])).toBe(
          '23503',
        );
        expect(
          await sqlState(
            sql,
            `UPDATE contracts SET vendor_id = $2, number = ' HD-2026-07 ', number_key = 'hd-2026-07',
                    effective_from = '2026-01-01', effective_to = '2028-12-31', name = 'Hợp đồng khung' WHERE id = $1`,
            [legacy, vendor],
          ),
        ).toBeNull();

        // A new contract that never ends, one that has no number, and the number is unique as the key reads it.
        const made = (key: string | null) =>
          sqlState(
            sql,
            `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id, number, number_key)
             VALUES (gen_random_uuid(), $1, 'Hợp đồng', $2, $3, $4)`,
            [acme, person, key === null ? null : key.toUpperCase(), key],
          );
        expect(await made(null)).toBeNull();
        expect(await made(null)).toBeNull();
        expect(await made('hd-2026-07')).toBe('23505');
        expect(await made('hd-2026-08')).toBeNull();

        // The number is a pair (the text and its key), is not blank, and is at most 100 characters.
        const withNumber = (number: string | null, key: string | null) =>
          sqlState(
            sql,
            `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id, number, number_key)
             VALUES (gen_random_uuid(), $1, 'Hợp đồng', $2, $3, $4)`,
            [acme, person, number, key],
          );
        expect(await withNumber('HD-9', null)).toBe('23514');
        expect(await withNumber(null, 'hd-9')).toBe('23514');
        expect(await withNumber('   ', 'x')).toBe('23514');
        expect(await withNumber('H'.repeat(101), 'h'.repeat(101))).toBe('23514');
        expect(await withNumber('H'.repeat(100), 'h'.repeat(100))).toBeNull();

        // The days make a period: an end needs a beginning and is not before it; an end on the day it begins is a period.
        const withDays = (from: string | null, to: string | null) =>
          sqlState(
            sql,
            `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id, effective_from, effective_to)
             VALUES (gen_random_uuid(), $1, 'Hợp đồng', $2, $3, $4)`,
            [acme, person, from, to],
          );
        expect(await withDays('2026-01-01', null)).toBeNull();
        expect(await withDays('2026-01-01', '2026-01-01')).toBeNull();
        expect(await withDays(null, '2026-12-31')).toBe('23514');
        expect(await withDays('2026-02-01', '2026-01-31')).toBe('23514');

        // The note is not blank and is at most 2000 characters.
        const withNote = (note: string) =>
          sqlState(
            sql,
            `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id, note) VALUES (gen_random_uuid(), $1, 'Hợp đồng', $2, $3)`,
            [acme, person, note],
          );
        expect(await withNote('   ')).toBe('23514');
        expect(await withNote('n'.repeat(2001))).toBe('23514');
        expect(await withNote('n'.repeat(2000))).toBeNull();

        // The guard: what was written can change; who made the contract, where and when cannot; it is never deleted.
        expect(
          await sqlState(sql, `UPDATE contracts SET created_by_app_user_id = $2 WHERE id = $1`, [legacy, randomUUID()]),
        ).toBe('55000');
        expect(await sqlState(sql, `UPDATE contracts SET created_at = now() WHERE id = $1`, [legacy])).toBe('55000');
        expect(
          await sqlState(sql, `UPDATE contracts SET organization_id = $2 WHERE id = $1`, [legacy, randomUUID()]),
        ).toBe('55000');
        expect(await sqlState(sql, `DELETE FROM contracts WHERE id = $1`, [legacy])).toBe('55000');
        expect(
          await sqlState(sql, `UPDATE contracts SET effective_to = NULL, note = NULL WHERE id = $1`, [legacy]),
        ).toBeNull();

        // The links: a table of its own, and a subscription is on at most one contract.
        const { rows: columns } = await sql.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'contract_subscriptions' ORDER BY column_name`,
        );
        expect(columns.map((column) => column.column_name)).toEqual([
          'contract_id',
          'id',
          'linked_at',
          'linked_by_app_user_id',
          'subscription_id',
        ]);
        // A link to what is not a subscription of a shared stock is refused by the trigger before any key is looked at.
        expect(
          await sqlState(
            sql,
            `INSERT INTO contract_subscriptions (id, contract_id, subscription_id, linked_by_app_user_id) VALUES (gen_random_uuid(), $1, $2, $3)`,
            [legacy, randomUUID(), person],
          ),
        ).toBe('55000');

        // The migrations written after this one are applied the same way (as `year-start-commitments-migration` does), so the schema is
        // whole before it is read against `prisma/models`: the history was only deployed up to the one before this migration.
        for (const later of committedMigrations().slice(committedMigrations().indexOf(TARGET) + 1)) {
          await sql.query(sqlOf(later));
        }
        // What Prisma reads of `prisma/models` is what the migrations made.
        const drift = await schemaDrift(database);
        expect(drift.code).toBe(0);
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
