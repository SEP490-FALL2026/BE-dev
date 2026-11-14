import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { searchKey } from '../../../src/core/search-key';
import { STANDARD_FUNCTIONAL_GROUPS } from '../../../src/modules/catalog/functional-group/functional-group-standard.policy';
import { PROJECT_ROOT, stopCliProcesses } from '../../support/cli-process';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

const TARGET = migrationEndingWith('_ct1_functional_groups_system_key');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

interface GroupRow {
  id: string;
  name: string;
  normalized_name: string;
  status: string;
  system_key: string | null;
}

/**
 * CT-1.1 (QĐ-111bf, QĐ-111e, MAJ-7): the migration that gives a functional group its `system_key`, seeds the seven standard groups and
 * moves every application into one, on an installation that already holds applications. The history before it is replayed, the groups
 * and applications are written the way they were, the migration runs twice (it must be safe to run again) and the counts are read.
 */
describe('the migration of the standard functional groups (integration, real PostgreSQL)', () => {
  it(
    'seeds the seven groups, adopts an older Khac, moves the communication services to Lien lac and the rest with none to Khac',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
        const organizationId = randomUUID();
        await sql.query(
          `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
          [organizationId],
        );
        const group = async (name: string, status = 'ACTIVE'): Promise<string> => {
          const id = randomUUID();
          await sql.query(
            `INSERT INTO functional_groups (id, organization_id, name, normalized_name, status, updated_at)
             VALUES ($1, $2, $3, $4, $5::"FunctionalGroupStatus", now())`,
            [id, organizationId, name, searchKey(name), status],
          );

          return id;
        };
        const application = async (name: string, groupId: string | null, communication: boolean): Promise<string> => {
          const id = randomUUID();
          await sql.query(
            `INSERT INTO applications (id, organization_id, kind, name, normalized_name, functional_group_id, data_sensitivity,
               comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
             VALUES ($1, $2, 'INTERNAL', $3, $3, $4, 'LOW', $5, false, false, $5)`,
            [id, organizationId, name, groupId, communication],
          );

          return id;
        };
        const design = await group('Design');
        const olderOther = await group('khác', 'INACTIVE');
        const chat = await application('Chat', design, true);
        const noGroup = await application('No group', null, false);
        const inDesign = await application('In Design', design, false);
        const inOlderOther = await application('In older other', olderOther, false);

        await sql.query(sqlOf(TARGET));
        await sql.query(sqlOf(TARGET));

        const groups = await sql.query<GroupRow>(
          `SELECT id, name, normalized_name, status, system_key FROM functional_groups WHERE organization_id = $1 ORDER BY name`,
          [organizationId],
        );
        // Seven standard groups and the one of the organization (Design): the older Khac is adopted, not made twice.
        expect(groups.rows).toHaveLength(8);
        for (const standard of STANDARD_FUNCTIONAL_GROUPS) {
          const row = groups.rows.find((candidate) => candidate.normalized_name === searchKey(standard.name));
          expect(row).toBeDefined();
          expect(row?.system_key).toBe(standard.systemKey);
          expect(row?.status).toBe('ACTIVE');
        }
        expect(groups.rows.find((row) => row.id === olderOther)?.system_key).toBe('OTHER');
        expect(groups.rows.find((row) => row.id === design)?.system_key).toBeNull();

        /** The system key of the group an application stands in, or the id of the group when it has none. */
        const groupOf = async (id: string): Promise<string> => {
          const row = (
            await sql.query<{ id: string; system_key: string | null }>(
              `SELECT g.id, g.system_key FROM applications a JOIN functional_groups g ON g.id = a.functional_group_id WHERE a.id = $1`,
              [id],
            )
          ).rows[0];

          return row.system_key ?? row.id;
        };
        expect(await groupOf(chat)).toBe('COMMUNICATION');
        expect(await groupOf(noGroup)).toBe('OTHER');
        expect(await groupOf(inDesign)).toBe(design);
        expect(await groupOf(inOlderOther)).toBe('OTHER');

        // MAJ-7: an application can be written with no communication answer and no sensitivity; the CHECK of the flag still holds.
        const bare = randomUUID();
        await sql.query(
          `INSERT INTO applications (id, organization_id, kind, name, normalized_name) VALUES ($1, $2, 'INTERNAL', 'Bare', 'bare')`,
          [bare, organizationId],
        );
        const bareRow = await sql.query<{ is_communication_service: boolean; data_sensitivity: string | null }>(
          `SELECT is_communication_service, data_sensitivity FROM applications WHERE id = $1`,
          [bare],
        );
        expect(bareRow.rows[0]).toEqual({ is_communication_service: false, data_sensitivity: null });

        // The two fixed keys are known and unique inside an organization.
        await expect(
          sql.query(`UPDATE functional_groups SET system_key = 'OTHER' WHERE id = $1`, [design]),
        ).rejects.toMatchObject({ code: '23505' });
        await expect(
          sql.query(`UPDATE functional_groups SET system_key = 'SOMETHING' WHERE id = $1`, [design]),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS + 60_000,
  );
});
