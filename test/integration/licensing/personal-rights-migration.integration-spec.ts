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

const TARGET = migrationEndingWith('_w3_personal_rights_allocations');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

/**
 * Redesign wave 3, W3-17 (M7, `20261203000300_w3_personal_rights_allocations`): the personal rights of a K1 plan that exist get one month counted from the day their grant
 * was completed, a subscription of a K1 plan is closed, and from then on a new K1 right with no subscription names both its months and its anchor.
 */
describe('M7 w3_personal_rights_allocations migration (integration, real PostgreSQL)', () => {
  it(
    'gives the K1 rights that exist one month from their grant day, closes the K1 subscriptions and leaves the rest as it was; then holds the rule for a new K1 right',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying history failed: ${before.stdout}`);
        const w = await lineWorld(sql);
        const { vendorId, workspaceId } = await w.vendor('Anthropic');
        const k1 = await w.plan(vendorId, 'Claude Pro', 'K1');
        const k2 = await w.plan(vendorId, 'Claude Team', 'K2');
        const k1Subscription = await w.period(k1, null);
        const k2Subscription = await w.period(k2, workspaceId);
        const person = await w.person('K1P');
        const other = await w.person('K2P');
        await w.seat(k1Subscription, k1, person, '2026-09-02');
        await w.seat(k2Subscription, k2, other, '2026-09-02');
        await sql.query(`UPDATE license_assignments SET granted_on = '2026-09-05' WHERE plan_id = $1`, [k1]);

        await sql.query(sqlOf(TARGET));

        const rights = (
          await sql.query<{ plan_id: string; months: number | null; anchor: string | null }>(
            `SELECT plan_id, personal_commitment_months AS months, to_char(billing_anchor_on, 'YYYY-MM-DD') AS anchor FROM license_assignments`,
          )
        ).rows;
        expect(rights.find((row) => row.plan_id === k1)).toMatchObject({ months: 1, anchor: '2026-09-05' });
        expect(rights.find((row) => row.plan_id === k2)).toMatchObject({ months: null, anchor: null });
        const closed = (
          await sql.query<{ id: string; closed_reason: string | null }>(`SELECT id, closed_reason FROM subscriptions`)
        ).rows;
        expect(closed.find((row) => row.id === k1Subscription)?.closed_reason).toBe('K1_WITHOUT_SUBSCRIPTION');
        expect(closed.find((row) => row.id === k2Subscription)?.closed_reason).toBeNull();

        // A K1 right written from now on has no subscription and names both; the right of another plan is not asked.
        const insert = (planId: string, months: number | null, anchor: string | null, employee: string) =>
          sql.query(
            `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
               normalized_account_identifier, valid_from, valid_from_basis, personal_commitment_months, billing_anchor_on, created_by_app_user_id)
             SELECT gen_random_uuid(), e.organization_id, 'PERSONAL', 'REQUEST', $1, NULL, e.id, e.employee_code || '@acme.vn',
                    lower(e.employee_code) || '@acme.vn', '2026-11-01', 'ACTUAL', $2, $3::date, $5
               FROM employees e WHERE e.id = $4`,
            [planId, months, anchor, employee, randomUUID()],
          );
        await expect(insert(k1, null, null, await w.person('N1'))).rejects.toMatchObject({
          code: '23514',
          constraint: 'license_assignments_k1_terms',
        });
        await expect(insert(k1, 12, null, await w.person('N2'))).rejects.toMatchObject({
          constraint: 'license_assignments_k1_terms',
        });
        await expect(insert(k1, 12, '2026-11-05', await w.person('N3'))).resolves.toBeDefined();
        await expect(insert(k1, 6, '2026-11-05', await w.person('N4'))).rejects.toMatchObject({
          constraint: 'license_assignments_personal_commitment_months_check',
        });
        await expect(insert(k2, null, null, await w.person('N5'))).resolves.toBeDefined();
        // What a right says of its term never changes.
        await expect(
          sql.query(`UPDATE license_assignments SET personal_commitment_months = 12 WHERE plan_id = $1`, [k1]),
        ).rejects.toMatchObject({ constraint: 'license_assignments_immutable' });
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );
});
