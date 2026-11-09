import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('contracts and the files kept for them (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let counter = 0;
  const person = () => randomUUID();

  const newContract = async (): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO contracts (id, organization_id, name, created_by_app_user_id) VALUES ($1, $2, 'Hợp đồng', $3)`,
      [id, organizationId, person()],
    );

    return id;
  };
  const newDocument = async (
    extra: { purpose?: string; fileName?: string; sizeBytes?: number; objectKey?: string } = {},
  ): Promise<{ id: string; code: string | null }> => {
    const id = randomUUID();
    counter += 1;
    const code = await sqlState(
      sql,
      `INSERT INTO document_attachments (id, organization_id, purpose, file_name, content_type, size_bytes, object_key,
         uploaded_by_app_user_id)
       VALUES ($1, $2, $3::"DocumentPurpose", $4, 'application/pdf', $5, $6, $7)`,
      [
        id,
        organizationId,
        extra.purpose ?? 'CONTRACT_ATTACHMENT',
        extra.fileName ?? 'hop-dong.pdf',
        extra.sizeBytes ?? 1000,
        extra.objectKey ?? `documents/2026/10/${counter}-${id}`,
        person(),
      ],
    );

    return { id, code };
  };
  const move = (id: string, set: string, values: unknown[] = []) =>
    sqlState(sql, `UPDATE document_attachments SET ${set} WHERE id = $1`, [id, ...values]);
  /** The file was looked at and its bytes copied to the key it is kept under (SEC-01). */
  const keep = (id: string) =>
    move(id, `status = 'PENDING_ATTACH', final_object_key = $2`, [`documents/2026/10/kept-${id}`]);
  const uploaded = async (purpose?: string): Promise<string> => {
    const { id } = await newDocument({ purpose });
    await keep(id);

    return id;
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    organizationId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [organizationId],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  describe('a contract', () => {
    it('has a name, and is never changed or deleted', async () => {
      const id = await newContract();

      expect(
        await sqlState(
          sql,
          `INSERT INTO contracts (organization_id, id, name, created_by_app_user_id) VALUES ($1, gen_random_uuid(), '  ', $2)`,
          [organizationId, person()],
        ),
      ).toBe('23514');
      expect(await sqlState(sql, `UPDATE contracts SET name = 'Khác' WHERE id = $1`, [id])).toBe('55000');
      expect(await sqlState(sql, `DELETE FROM contracts WHERE id = $1`, [id])).toBe('55000');
    });
  });

  describe('a file (US-04-04 AC-6, AC-10)', () => {
    it('starts awaiting its upload with no owner, a name, and a size above zero', async () => {
      expect((await newDocument()).code).toBeNull();
      expect((await newDocument({ sizeBytes: 0 })).code).toBe('23514');
      expect((await newDocument({ fileName: '   ' })).code).toBe('23514');
    });

    it('has a place of its own in the storage: two files never share one', async () => {
      const key = `documents/2026/10/shared-${randomUUID()}`;

      expect((await newDocument({ objectKey: key })).code).toBeNull();
      expect((await newDocument({ objectKey: key })).code).toBe('23505');
    });

    it('is attached to one contract and is READY exactly then, with the time it got its owner', async () => {
      const contract = await newContract();
      const id = await uploaded();

      expect(await move(id, `status = 'READY'`)).toBe('23514');
      expect(await move(id, `contract_id = $2`, [contract])).toBe('23514');
      expect(await move(id, `status = 'READY', contract_id = $2`, [contract])).toBe('23514');
      expect(await move(id, `status = 'READY', contract_id = $2, attached_at = now()`, [contract])).toBeNull();
    });

    it('names a contract that exists', async () => {
      const id = await uploaded();

      expect(await move(id, `status = 'READY', contract_id = $2, attached_at = now()`, [randomUUID()])).toBe('23503');
    });

    it('is attached only when its purpose belongs to a contract', async () => {
      const contract = await newContract();
      for (const purpose of ['TAX_PAYMENT_PROOF', 'SIGNATURE_RECORD', 'IMPORT_SOURCE', 'COST_STATEMENT']) {
        const id = await uploaded(purpose);

        expect(await move(id, `status = 'READY', contract_id = $2, attached_at = now()`, [contract])).toBe('23514');
      }
      const purchase = await uploaded('PURCHASE_DOCUMENT');
      expect(await move(purchase, `status = 'READY', contract_id = $2, attached_at = now()`, [contract])).toBeNull();
    });

    it('moves one way: awaiting, then uploaded or quarantined, then attached; nothing goes back', async () => {
      const contract = await newContract();
      const awaiting = (await newDocument()).id;

      expect(await move(awaiting, `status = 'READY', contract_id = $2, attached_at = now()`, [contract])).toBe('55000');
      expect(await keep(awaiting)).toBeNull();
      expect(await move(awaiting, `status = 'AWAITING_UPLOAD'`)).toBe('55000');
      expect(await move(awaiting, `status = 'QUARANTINED'`)).toBe('55000');
      expect(await move(awaiting, `status = 'READY', contract_id = $2, attached_at = now()`, [contract])).toBeNull();
    });

    it('is kept under a final key exactly when it was uploaded, and that key never changes (SEC-01)', async () => {
      const awaiting = (await newDocument()).id;
      const kept = await uploaded();

      expect(await move(awaiting, `status = 'PENDING_ATTACH'`)).toBe('23514');
      expect(await move(awaiting, `final_object_key = 'documents/2026/10/early'`)).toBe('23514');
      expect(await move(kept, `final_object_key = 'documents/2026/10/replaced'`)).toBe('55000');
      expect(await move(kept, `final_object_key = NULL`)).toBe('55000');
      const other = await newDocument();
      expect(
        await move(other.id, `status = 'PENDING_ATTACH', final_object_key = $2`, [`documents/2026/10/kept-${kept}`]),
      ).toBe('23505');
    });

    it('is given up when its upload never came, and stays given up (DB-13)', async () => {
      const abandoned = (await newDocument()).id;
      const kept = await uploaded();
      const contract = await newContract();

      expect(await move(kept, `status = 'EXPIRED'`)).toBe('55000');
      expect(await move(abandoned, `status = 'EXPIRED'`)).toBeNull();
      expect(await move(abandoned, `status = 'PENDING_ATTACH'`)).toBe('55000');
      expect(await move(abandoned, `status = 'AWAITING_UPLOAD'`)).toBe('55000');
      expect(await move(abandoned, `status = 'READY', contract_id = $2, attached_at = now()`, [contract])).toBe(
        '55000',
      );
    });

    it('stays as it is once attached or quarantined, and has only one owner', async () => {
      const contract = await newContract();
      const other = await newContract();
      const attached = await uploaded();
      await move(attached, `status = 'READY', contract_id = $2, attached_at = now()`, [contract]);
      const quarantined = (await newDocument()).id;
      await move(quarantined, `status = 'QUARANTINED'`);

      expect(await move(attached, `contract_id = $2`, [other])).toBe('55000');
      expect(await move(attached, `status = 'PENDING_ATTACH', contract_id = NULL, attached_at = NULL`)).toBe('55000');
      expect(await move(quarantined, `status = 'PENDING_ATTACH'`)).toBe('55000');
    });

    it('never changes what was declared of it, and is never deleted', async () => {
      const id = await uploaded();

      for (const set of [
        `purpose = 'PURCHASE_DOCUMENT'`,
        `file_name = 'khac.pdf'`,
        `content_type = 'image/png'`,
        `size_bytes = 5`,
        `object_key = 'documents/other'`,
        `uploaded_by_app_user_id = gen_random_uuid()`,
      ]) {
        expect(await move(id, set)).toBe('55000');
      }
      expect(await sqlState(sql, `DELETE FROM document_attachments WHERE id = $1`, [id])).toBe('55000');
    });

    it('keeps no column for a link or a secret', async () => {
      const { rows } = await sql.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'document_attachments'`,
      );

      expect(rows.map((row) => row.column_name).filter((name) => /url|link|token|secret|password/i.test(name))).toEqual(
        [],
      );
    });
  });
});
