import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const RESTRICT_VIOLATION = '23001';

describe('purchase invoices and the invoices they write (integration, PostgreSQL constraints; PI-1.1)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let vendorId: string;
  let itAdminId: string;
  let financeId: string;
  let costCenterId: string;
  let counter = 0;

  /** A purchase invoice for a subscription (no foreign key of another module is needed), with what `extra` changes. */
  const insertPurchase = async (extra: Record<string, unknown> = {}): Promise<{ id: string; code: string | null }> => {
    const id = randomUUID();
    counter += 1;
    const row: Record<string, unknown> = {
      id,
      organization_id: organizationId,
      link_kind: 'SUBSCRIPTION',
      request_id: null,
      provisioning_task_id: null,
      subscription_id: randomUUID(),
      vendor_id: vendorId,
      number: `PI-${counter}`,
      issued_on: '2026-11-02',
      service_month: '2026-11-01',
      label: 'RENEWAL',
      period_index: null,
      period_count: null,
      quantity: 10,
      unit_price_original_minor: 1500,
      unit_price_original_currency: 'USD',
      net_minor: 3840000,
      match_result: 'MATCHED',
      payment_source: 'COMPANY_CARD',
      submitted_by_employee_id: itAdminId,
      submitted_at: '2026-11-02T03:00:00Z',
      ...extra,
    };
    const columns = Object.keys(row);
    const code = await sqlState(
      sql,
      `INSERT INTO purchase_invoices (${columns.join(', ')}) VALUES (${columns.map((_, at) => `$${at + 1}`).join(', ')})`,
      columns.map((column) => row[column]),
    );

    return { id, code };
  };

  /** What Finance writes on signing: one invoice booked to a Cost Center, with no commitment. */
  const insertInvoice = async (extra: Record<string, unknown> = {}): Promise<{ id: string; code: string | null }> => {
    const id = randomUUID();
    counter += 1;
    const row: Record<string, unknown> = {
      id,
      organization_id: organizationId,
      commitment_id: null,
      cost_center_id: costCenterId,
      vendor_id: vendorId,
      number: `INV-${counter}`,
      issued_on: '2026-11-02',
      currency: 'VND',
      net_minor: 3840000,
      actual_cost_minor: 3840000,
      applied_minor: 0,
      match_result: 'MATCHED',
      recorded_by_employee_id: financeId,
      recorded_at: '2026-11-03T03:00:00Z',
      service_month: '2026-11-01',
      ...extra,
    };
    const columns = Object.keys(row);
    const code = await sqlState(
      sql,
      `INSERT INTO invoices (${columns.join(', ')}) VALUES (${columns.map((_, at) => `$${at + 1}`).join(', ')})`,
      columns.map((column) => row[column]),
    );

    return { id, code };
  };

  /** Signs a submitted invoice the way the service does: the invoice first, then one update that carries the invoice id. */
  const sign = async (purchaseId: string, by: string): Promise<string | null> => {
    const invoice = await insertInvoice({ purchase_invoice_id: purchaseId });
    if (invoice.code) return invoice.code;

    return sqlState(
      sql,
      `UPDATE purchase_invoices SET state = 'CONFIRMED', decided_by_employee_id = $2, decided_at = now(), invoice_id = $3 WHERE id = $1`,
      [purchaseId, by, invoice.id],
    );
  };

  const newDocument = async (purpose: string): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, file_name, content_type, size_bytes, object_key, uploaded_by_app_user_id)
       VALUES ($1, $2, $3::"DocumentPurpose", 'hoa-don.pdf', 'application/pdf', 1000, $4, $5)`,
      [id, organizationId, purpose, `documents/2026/11/${counter}-${id}`, randomUUID()],
    );
    await sql.query(`UPDATE document_attachments SET status = 'PENDING_ATTACH', final_object_key = $2 WHERE id = $1`, [
      id,
      `documents/2026/11/kept-${id}`,
    ]);

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
    itAdminId = randomUUID();
    financeId = randomUUID();
    for (const [id, code] of [
      [itAdminId, 'E-1'],
      [financeId, 'E-2'],
    ]) {
      await sql.query(
        `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
         VALUES ($1, $2, $3, 'Person', 'STAFF', '2026-01-01', now())`,
        [id, organizationId, code],
      );
    }
    vendorId = randomUUID();
    await sql.query(
      `INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'Figma', 'figma')`,
      [vendorId, organizationId],
    );
    costCenterId = randomUUID();
    const departmentId = randomUUID();
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'ENG', 'Engineering', now())`,
      [departmentId, organizationId],
    );
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at)
       VALUES ($1, $2, 'CC-ENG', 'Engineering', 'UNIT', 'ACTIVE', $3, now())`,
      [costCenterId, organizationId, departmentId],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('runs a second time without a change or an error (forward-only, safe to repeat)', async () => {
    const script = readFileSync(
      join(process.cwd(), 'prisma/migrations/20261113004500_pi1_purchase_invoices/migration.sql'),
      'utf8',
    );

    await expect(sql.query(script)).resolves.toBeDefined();
  });

  describe('a purchase invoice', () => {
    it('is kept when it is whole', async () => {
      expect((await insertPurchase()).code).toBeNull();
    });

    it('pays for a month: the service month is the first day of one', async () => {
      expect((await insertPurchase({ service_month: '2026-11-15' })).code).toBe(CHECK_VIOLATION);
    });

    it('is linked to a request or to a subscription, never to neither or to both, and a task only goes with a request', async () => {
      expect((await insertPurchase({ link_kind: 'REQUEST', subscription_id: null })).code).toBe(CHECK_VIOLATION);
      expect((await insertPurchase({ link_kind: 'SUBSCRIPTION', subscription_id: null })).code).toBe(CHECK_VIOLATION);
      expect((await insertPurchase({ provisioning_task_id: randomUUID() })).code).toBe(CHECK_VIOLATION);
    });

    it('states a count of at least one, a price above nothing and money taken out', async () => {
      expect((await insertPurchase({ quantity: 0 })).code).toBe(CHECK_VIOLATION);
      expect((await insertPurchase({ unit_price_original_minor: 0 })).code).toBe(CHECK_VIOLATION);
      expect((await insertPurchase({ net_minor: 0 })).code).toBe(CHECK_VIOLATION);
      expect((await insertPurchase({ deductible_tax_minor: -1 })).code).toBe(CHECK_VIOLATION);
      expect((await insertPurchase({ period_index: 0 })).code).toBe(CHECK_VIOLATION);
    });

    it('holds the number of the vendor until it is returned: a returned invoice may come back with it', async () => {
      const first = await insertPurchase({ number: 'SAME-1' });
      expect(first.code).toBeNull();
      expect((await insertPurchase({ number: 'SAME-1' })).code).toBe(UNIQUE_VIOLATION);

      expect(
        await sqlState(
          sql,
          `UPDATE purchase_invoices SET state = 'RETURNED', decided_by_employee_id = $2, decided_at = now(), return_reason = 'Thiếu thuế' WHERE id = $1`,
          [first.id, financeId],
        ),
      ).toBeNull();
      const again = await insertPurchase({ number: 'SAME-1', resubmission_of_id: first.id });
      expect(again.code).toBeNull();
      expect((await insertPurchase({ number: 'SAME-2', resubmission_of_id: first.id })).code).toBe(UNIQUE_VIOLATION);
    });

    it('is returned with a reason and signed with an invoice, by a person who did not submit it', async () => {
      const blank = await insertPurchase();
      expect(
        await sqlState(
          sql,
          `UPDATE purchase_invoices SET state = 'RETURNED', decided_by_employee_id = $2, decided_at = now(), return_reason = '  ' WHERE id = $1`,
          [blank.id, financeId],
        ),
      ).toBe(CHECK_VIOLATION);
      expect(
        await sqlState(
          sql,
          `UPDATE purchase_invoices SET state = 'CONFIRMED', decided_by_employee_id = $2, decided_at = now() WHERE id = $1`,
          [blank.id, financeId],
        ),
      ).toBe(CHECK_VIOLATION);

      const own = await insertPurchase();
      expect(await sign(own.id, itAdminId)).toBe(CHECK_VIOLATION);
      const signed = await insertPurchase();
      expect(await sign(signed.id, financeId)).toBeNull();
    });

    it('never changes what it says, and after it is signed or returned never changes at all and is never deleted', async () => {
      const open = await insertPurchase();
      expect(await sqlState(sql, `UPDATE purchase_invoices SET net_minor = 1 WHERE id = $1`, [open.id])).toBe(
        RESTRICT_VIOLATION,
      );
      expect(await sqlState(sql, `DELETE FROM purchase_invoices WHERE id = $1`, [open.id])).toBe(RESTRICT_VIOLATION);

      const signed = await insertPurchase();
      expect(await sign(signed.id, financeId)).toBeNull();
      expect(await sqlState(sql, `UPDATE purchase_invoices SET return_reason = 'x' WHERE id = $1`, [signed.id])).toBe(
        RESTRICT_VIOLATION,
      );
      expect(await sqlState(sql, `TRUNCATE purchase_invoices CASCADE`)).toBe(RESTRICT_VIOLATION);
    });
  });

  describe('the files of a purchase invoice', () => {
    it('are added in order, once for each file, and never changed', async () => {
      const purchase = await insertPurchase();
      const document = await newDocument('PURCHASE_DOCUMENT');
      const link = (position: number, id = document, invoice = purchase.id) =>
        sqlState(
          sql,
          `INSERT INTO purchase_invoice_documents (purchase_invoice_id, document_id, position) VALUES ($1, $2, $3)`,
          [invoice, id, position],
        );
      expect(await link(1)).toBeNull();
      expect(await link(2, document, (await insertPurchase()).id)).toBe(UNIQUE_VIOLATION);
      expect(await link(21, await newDocument('PURCHASE_DOCUMENT'))).toBe(CHECK_VIOLATION);
      expect(
        await sqlState(sql, `UPDATE purchase_invoice_documents SET position = 2 WHERE document_id = $1`, [document]),
      ).toBe(RESTRICT_VIOLATION);
      expect(await sqlState(sql, `DELETE FROM purchase_invoice_documents WHERE document_id = $1`, [document])).toBe(
        RESTRICT_VIOLATION,
      );
    });

    it('belong to the invoice they came with: a purchase document may have it for an owner, another purpose may not, and a file has one owner', async () => {
      const purchase = (await insertPurchase()).id;
      const attach = (id: string, set: string) =>
        sqlState(sql, `UPDATE document_attachments SET status = 'READY', attached_at = now(), ${set} WHERE id = $1`, [
          id,
          purchase,
        ]);

      expect(await attach(await newDocument('PURCHASE_DOCUMENT'), 'purchase_invoice_id = $2')).toBeNull();
      expect(await attach(await newDocument('COST_STATEMENT'), 'purchase_invoice_id = $2')).toBe(CHECK_VIOLATION);
      expect(
        await attach(await newDocument('PURCHASE_DOCUMENT'), 'purchase_invoice_id = $2, signer_employee_id = $2'),
      ).toBe(CHECK_VIOLATION);
    });
  });

  describe('an invoice', () => {
    it('is booked to a commitment, a subscription, a Cost Center or a case, and to nothing else is refused', async () => {
      expect((await insertInvoice()).code).toBeNull();
      expect((await insertInvoice({ cost_center_id: null, subscription_id: randomUUID() })).code).toBeNull();
      expect((await insertInvoice({ cost_center_id: null })).code).toBe(CHECK_VIOLATION);
      expect((await insertInvoice({ cost_center_id: null, out_of_process_case_id: randomUUID() })).code).toBeNull();
    });

    it('pays for a month and comes from one purchase invoice at most', async () => {
      expect((await insertInvoice({ service_month: '2026-11-02' })).code).toBe(CHECK_VIOLATION);
      expect((await insertInvoice({ service_month: null })).code).toBeNull();
      const purchase = randomUUID();
      expect((await insertInvoice({ purchase_invoice_id: purchase })).code).toBeNull();
      expect((await insertInvoice({ purchase_invoice_id: purchase })).code).toBe(UNIQUE_VIOLATION);
    });

    it('is never changed or deleted', async () => {
      const { id } = await insertInvoice();
      expect(await sqlState(sql, `UPDATE invoices SET note = 'x' WHERE id = $1`, [id])).not.toBeNull();
      expect(await sqlState(sql, `DELETE FROM invoices WHERE id = $1`, [id])).not.toBeNull();
    });
  });
});
