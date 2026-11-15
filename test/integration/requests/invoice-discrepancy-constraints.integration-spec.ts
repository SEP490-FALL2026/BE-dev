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
const FOREIGN_KEY_VIOLATION = '23503';
const RESTRICT_VIOLATION = '23001';

const MIGRATIONS = [
  '20261113004510_rc1_invoice_discrepancy_values',
  '20261113004520_rc1_purchase_invoice_expected',
  '20261113004530_rc1_invoice_discrepancy_cases',
];

/**
 * The file of a discrepancy between what an invoice says and what was approved or bought (`RC-1.1`, `QĐ-111y`, `R-44`): what the invoice was read
 * against is kept with it, and a case is opened once for an invoice, closed once, and never changed or deleted after. On real PostgreSQL.
 */
describe('cases of invoices that differ and what the invoices were read against (integration, PostgreSQL constraints; RC-1.1)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let vendorId: string;
  let itAdminId: string;
  let financeId: string;
  let counter = 0;

  const insertPurchase = async (extra: Record<string, unknown> = {}): Promise<{ id: string; code: string | null }> => {
    const id = randomUUID();
    counter += 1;
    const row: Record<string, unknown> = {
      id,
      organization_id: organizationId,
      link_kind: 'SUBSCRIPTION',
      subscription_id: randomUUID(),
      vendor_id: vendorId,
      number: `RC-${counter}`,
      issued_on: '2026-11-02',
      service_month: '2026-11-01',
      label: 'RENEWAL',
      quantity: 12,
      unit_price_original_minor: 1500,
      unit_price_original_currency: 'USD',
      net_minor: 3840000,
      match_result: 'PRICE_QUANTITY_EXCEPTION',
      payment_source: 'COMPANY_CARD',
      submitted_by_employee_id: itAdminId,
      submitted_at: '2026-11-02T03:00:00Z',
      expected_quantity: 10,
      expected_unit_price_original_minor: 1500,
      expected_unit_price_original_currency: 'USD',
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

  const insertCase = async (
    purchaseInvoiceId: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; code: string | null }> => {
    const id = randomUUID();
    const row: Record<string, unknown> = {
      id,
      organization_id: organizationId,
      purchase_invoice_id: purchaseInvoiceId,
      mismatches: ['QUANTITY'],
      opened_at: '2026-11-03T03:00:00Z',
      ...extra,
    };
    const columns = Object.keys(row);
    const code = await sqlState(
      sql,
      `INSERT INTO invoice_discrepancy_cases (${columns.join(', ')}) VALUES (${columns.map((_, at) => `$${at + 1}`).join(', ')})`,
      columns.map((column) => row[column]),
    );

    return { id, code };
  };

  /** Closes a case the way the service does: one update that says who, when, how and why. `set` may use `$3…` for `values`. */
  const closeCase = (id: string, set: string, values: unknown[] = []) =>
    sqlState(
      sql,
      `UPDATE invoice_discrepancy_cases SET state = 'CLOSED', closed_by_employee_id = $2, closed_at = now(), ${set} WHERE id = $1`,
      [id, financeId, ...values],
    );

  const openCase = async (extra: Record<string, unknown> = {}) => insertCase((await insertPurchase()).id, extra);

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
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('runs a second time without a change or an error (forward-only, safe to repeat)', async () => {
    for (const name of MIGRATIONS) {
      const script = readFileSync(join(process.cwd(), `prisma/migrations/${name}/migration.sql`), 'utf8');

      await expect(sql.query(script)).resolves.toBeDefined();
    }
  });

  describe('what a purchase invoice was read against', () => {
    it('is kept with the invoice and may be unknown, but a price comes with its currency and neither is below nothing', async () => {
      expect((await insertPurchase()).code).toBeNull();
      const unknown = {
        expected_quantity: null,
        expected_unit_price_original_minor: null,
        expected_unit_price_original_currency: null,
      };
      expect((await insertPurchase(unknown)).code).toBeNull();
      expect((await insertPurchase({ expected_quantity: -1 })).code).toBe(CHECK_VIOLATION);
      expect((await insertPurchase({ expected_quantity: 0 })).code).toBeNull();
      expect((await insertPurchase({ expected_unit_price_original_minor: -1 })).code).toBe(CHECK_VIOLATION);
      expect((await insertPurchase({ expected_unit_price_original_currency: null })).code).toBe(CHECK_VIOLATION);
      expect(
        (
          await insertPurchase({
            expected_unit_price_original_minor: null,
            expected_unit_price_original_currency: 'USD',
          })
        ).code,
      ).toBe(CHECK_VIOLATION);
    });

    it('never changes, like the rest of what the invoice says', async () => {
      const open = await insertPurchase();

      expect(await sqlState(sql, `UPDATE purchase_invoices SET expected_quantity = 12 WHERE id = $1`, [open.id])).toBe(
        RESTRICT_VIOLATION,
      );
    });
  });

  describe('a case of an invoice that differs', () => {
    it('is opened once for an invoice, for a count or a price or both, and for nothing else', async () => {
      const purchase = (await insertPurchase()).id;

      expect((await insertCase(purchase)).code).toBeNull();
      expect((await insertCase(purchase)).code).toBe(UNIQUE_VIOLATION);
      expect((await openCase({ mismatches: ['QUANTITY', 'UNIT_PRICE'] })).code).toBeNull();
      expect((await openCase({ mismatches: ['VND'] })).code).toBe(CHECK_VIOLATION);
      expect((await insertCase(randomUUID())).code).toBe(FOREIGN_KEY_VIOLATION);
    });

    it('is open with nobody who closed it, then closed with who, when, how and why', async () => {
      const open = await openCase();
      expect((await openCase({ closed_at: '2026-11-04T03:00:00Z' })).code).toBe(CHECK_VIOLATION);

      expect(
        await closeCase(open.id, `outcome = 'EXPLAINED', reason = $3, difference_minor = 0`, ['Mua thêm hợp lệ']),
      ).toBeNull();
      const closed = await sql.query<{ state: string; outcome: string; difference_minor: string }>(
        `SELECT state::text, outcome::text, difference_minor::text FROM invoice_discrepancy_cases WHERE id = $1`,
        [open.id],
      );
      expect(closed.rows[0]).toEqual({ state: 'CLOSED', outcome: 'EXPLAINED', difference_minor: '0' });
    });

    it('is closed with a reason, a difference that is not below nothing, and for a suspicion a difference above nothing', async () => {
      const close = async (set: string, values: unknown[]) => closeCase((await openCase()).id, set, values);

      expect(await close(`outcome = 'EXPLAINED', reason = $3, difference_minor = 5`, ['   '])).toBe(CHECK_VIOLATION);
      expect(await close(`outcome = 'EXPLAINED', reason = $3, difference_minor = 5`, ['x'.repeat(1001)])).toBe(
        CHECK_VIOLATION,
      );
      expect(await close(`outcome = 'EXPLAINED', reason = $3, difference_minor = -1`, ['ok'])).toBe(CHECK_VIOLATION);
      expect(await close(`outcome = 'EXPLAINED', reason = $3`, ['ok'])).toBe(CHECK_VIOLATION);
      expect(await close(`reason = $3, difference_minor = 5`, ['ok'])).toBe(CHECK_VIOLATION);
      expect(await close(`outcome = 'OUT_OF_PROCESS_SUSPECTED', reason = $3, difference_minor = 0`, ['ok'])).toBe(
        CHECK_VIOLATION,
      );
      expect(
        await close(`outcome = 'OUT_OF_PROCESS_SUSPECTED', reason = $3, difference_minor = 640000`, ['ok']),
      ).toBeNull();
    });

    it('never changes what it was opened with, never changes once closed, and is never deleted', async () => {
      const open = await openCase();
      expect(
        await sqlState(sql, `UPDATE invoice_discrepancy_cases SET mismatches = '{UNIT_PRICE}' WHERE id = $1`, [
          open.id,
        ]),
      ).toBe(RESTRICT_VIOLATION);
      expect(await sqlState(sql, `DELETE FROM invoice_discrepancy_cases WHERE id = $1`, [open.id])).toBe(
        RESTRICT_VIOLATION,
      );

      expect(await closeCase(open.id, `outcome = 'EXPLAINED', reason = $3, difference_minor = 0`, ['ok'])).toBeNull();
      expect(
        await sqlState(sql, `UPDATE invoice_discrepancy_cases SET reason = 'again' WHERE id = $1`, [open.id]),
      ).toBe(RESTRICT_VIOLATION);
      expect(await sqlState(sql, `TRUNCATE invoice_discrepancy_cases`)).toBe(RESTRICT_VIOLATION);
    });
  });
});
