import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PROJECT_ROOT, stopCliProcesses } from '../../support/cli-process';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

const TARGET = migrationEndingWith('_ct1_application_group_required');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

/**
 * CT-1.7 (QĐ-111d, MAJ-7): every application stands in a functional group. The history before the migration is replayed on an installation that holds
 * applications with no group and an older group called Khác; the migration puts each of them in Khác (adopting that group, or making one) and makes the
 * column NOT NULL. A row written with no group afterwards stands in Khác too (the database says so, for every
 * road that does not name one), and a group can never be taken away.
 */
describe('the migration that makes the functional group of an application required (integration, real PostgreSQL)', () => {
  it(
    'puts the applications with no group in Khác, adopts or makes that group once, and refuses an application without one afterwards',
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
        const application = async (organizationId: string, name: string, groupId: string | null = null) => {
          const id = randomUUID();
          await sql.query(
            `INSERT INTO applications (id, organization_id, kind, name, normalized_name, functional_group_id)
             VALUES ($1, $2, 'INTERNAL', $3, $3, $4)`,
            [id, organizationId, name, groupId],
          );

          return id;
        };
        const groupKeyOf = async (applicationId: string): Promise<string | null> =>
          (
            await sql.query<{ system_key: string | null }>(
              `SELECT g.system_key FROM applications a JOIN functional_groups g ON g.id = a.functional_group_id WHERE a.id = $1`,
              [applicationId],
            )
          ).rows[0]?.system_key ?? null;
        const groupsOf = async (organizationId: string) =>
          (
            await sql.query<{ id: string; name: string; system_key: string | null; status: string }>(
              `SELECT id, name, system_key, status FROM functional_groups WHERE organization_id = $1 ORDER BY name`,
              [organizationId],
            )
          ).rows;

        // The organization (there is one) has an older group called Khac, switched off, and applications that have no group.
        const olderOther = randomUUID();
        await sql.query(
          `INSERT INTO functional_groups (id, organization_id, name, normalized_name, status, updated_at)
           VALUES ($1, $2, 'Khac', 'khac', 'INACTIVE', now())`,
          [olderOther, acme],
        );
        const noGroup = await application(acme, 'No group');
        const another = await application(acme, 'Another with no group');

        await sql.query(sqlOf(TARGET));
        await sql.query(sqlOf(TARGET));

        expect(await groupKeyOf(noGroup)).toBe('OTHER');
        expect(await groupKeyOf(another)).toBe('OTHER');
        // The older group was adopted, not made twice, and is active as the fixed group must be.
        expect(await groupsOf(acme)).toEqual([{ id: olderOther, name: 'Khac', system_key: 'OTHER', status: 'ACTIVE' }]);

        // The column is required now: no application without a group, and one cannot lose it.
        const [column] = (
          await sql.query<{ is_nullable: string }>(
            `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'functional_group_id'`,
          )
        ).rows;
        expect(column.is_nullable).toBe('NO');
        await expect(
          sql.query(`UPDATE applications SET functional_group_id = NULL WHERE id = $1`, [noGroup]),
        ).rejects.toMatchObject({ code: '23502' });

        // A road that names no group is put in Khác by the database; a group that is named stays.
        const design = randomUUID();
        await sql.query(
          `INSERT INTO functional_groups (id, organization_id, name, normalized_name, updated_at) VALUES ($1, $2, 'Design', 'design', now())`,
          [design, acme],
        );
        expect(await groupKeyOf(await application(acme, 'Later with no group'))).toBe('OTHER');
        expect(await groupKeyOf(await application(acme, 'Named', design))).toBeNull();
        expect((await groupsOf(acme)).map((group) => group.name)).toEqual(['Design', 'Khac']);

        // An organization that has lost its Khác (the group is renamed away here) gets it made, once, for the next row with no group.
        await sql.query(
          `UPDATE functional_groups SET system_key = NULL, name = 'Old', normalized_name = 'old' WHERE id = $1`,
          [olderOther],
        );
        const first = await application(acme, 'First after the loss');
        const second = await application(acme, 'Second after the loss');
        const made = (await groupsOf(acme)).filter((group) => group.system_key === 'OTHER');
        expect(made).toEqual([expect.objectContaining({ name: 'Khác', status: 'ACTIVE' })]);
        expect(made[0].id).not.toBe(olderOther);
        expect(await groupKeyOf(first)).toBe('OTHER');
        expect(await groupKeyOf(second)).toBe('OTHER');
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS + 60_000,
  );
});
