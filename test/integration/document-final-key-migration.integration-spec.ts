import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../support/disposable-database';

const MIGRATIONS = join(process.cwd(), 'prisma', 'migrations');
const TARGET = '_document_final_key_and_expiry';

const directories = (): string[] =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
const sqlOf = (directory: string): string => readFileSync(join(MIGRATIONS, directory, 'migration.sql'), 'utf8');

/** SEC-01 and DB-13: the migration that gives a kept file its final key, on an installation that already holds files. */
describe('the migration of the final key of a document (integration, real PostgreSQL)', () => {
  it('keeps where a file already uploaded or attached is stored: its key is its final key, and the rest have none', async () => {
    const database = await provisionDisposableDatabase();
    const sql = new Client({ connectionString: database.url });
    await sql.connect();
    try {
      const target = directories().find((name) => name.endsWith(TARGET)) ?? '';
      expect(target).not.toBe('');
      for (const directory of directories()) {
        if (directory === target) break;
        await sql.query(sqlOf(directory));
      }
      const organizationId = randomUUID();
      await sql.query(
        `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
        [organizationId],
      );
      const contractId = randomUUID();
      await sql.query(
        `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id) VALUES ($1, $2, 'Hợp đồng', $3)`,
        [contractId, organizationId, randomUUID()],
      );
      const file = async (status: string, key: string) => {
        const id = randomUUID();
        await sql.query(
          `INSERT INTO document_attachments (id, organization_id, purpose, file_name, content_type, size_bytes, object_key, uploaded_by_app_user_id)
           VALUES ($1, $2, 'CONTRACT_ATTACHMENT', 'a.pdf', 'application/pdf', 10, $3, $4)`,
          [id, organizationId, key, randomUUID()],
        );
        if (status !== 'AWAITING_UPLOAD')
          await sql.query(`UPDATE document_attachments SET status = 'PENDING_ATTACH' WHERE id = $1`, [id]);
        if (status === 'READY') {
          await sql.query(
            `UPDATE document_attachments SET status = 'READY', contract_id = $2, attached_at = now() WHERE id = $1`,
            [id, contractId],
          );
        }
        if (status === 'QUARANTINED') {
          await sql.query(
            `UPDATE document_attachments SET status = 'QUARANTINED' WHERE id = $1 AND status = 'AWAITING_UPLOAD'`,
            [id],
          );
        }

        return id;
      };
      const awaiting = await file('AWAITING_UPLOAD', 'documents/2026/10/awaiting');
      const pending = await file('PENDING_ATTACH', 'documents/2026/10/pending');
      const ready = await file('READY', 'documents/2026/10/ready');

      await sql.query(sqlOf(target));

      const rows = (
        await sql.query<{ id: string; status: string; final_object_key: string | null }>(
          `SELECT id, status, final_object_key FROM document_attachments`,
        )
      ).rows;
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(awaiting)).toMatchObject({ status: 'AWAITING_UPLOAD', final_object_key: null });
      expect(byId.get(pending)).toMatchObject({
        status: 'PENDING_ATTACH',
        final_object_key: 'documents/2026/10/pending',
      });
      expect(byId.get(ready)).toMatchObject({ status: 'READY', final_object_key: 'documents/2026/10/ready' });
      // The guard is back in force: a file that was kept cannot be moved to another key, and an awaiting one may expire.
      await expect(
        sql.query(`UPDATE document_attachments SET final_object_key = 'documents/other' WHERE id = $1`, [pending]),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        sql.query(`UPDATE document_attachments SET status = 'EXPIRED' WHERE id = $1`, [awaiting]),
      ).resolves.toBeDefined();
    } finally {
      await sql.end();
      await dropDisposableDatabase(database);
    }
  }, 90_000);
});
