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

const SOURCE_COLUMNS = `id, organization_id, application_id, name, identifier_type, report_shape, template, time_zone,
  activity_definition, definition_strictness, evidence_direction, cap_member_list, cap_last_activity, cap_event_detail, created_by_app_user_id`;

describe('vendor usage tables (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;

  const insertSource = (id: string, definition: string | null) =>
    sqlState(
      sql,
      `INSERT INTO usage_sources (${SOURCE_COLUMNS})
       VALUES ($1, $2, $3, $4, 'EMAIL', 'EVENT', '{}'::jsonb, 'UTC', $5, 'STRICT', 'POSITIVE_ONLY', true, true, false, $6)`,
      [id, organizationId, randomUUID(), `s-${id}`, definition, randomUUID()],
    );

  const insertImport = (sourceId: string, from: string, to: string, status = 'PREVIEW') =>
    sqlState(
      sql,
      `INSERT INTO usage_imports (id, organization_id, source_id, format, status, coverage_from, coverage_to, coverage_basis,
         content_hash, summary, expires_at, uploaded_by_app_user_id)
       VALUES ($1, $2, $3, 'CSV', $4::"UsageImportStatus", $5::date, $6::date, 'DECLARED', 'h', '{}'::jsonb, now(), $7)`,
      [randomUUID(), organizationId, sourceId, status, from, to, randomUUID()],
    );

  const newSource = async (): Promise<string> => {
    const id = randomUUID();
    expect(await insertSource(id, 'mở file')).toBeNull();

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

  it('INV-11: a source needs an activity definition of 3 to 500 characters (23502 when missing, 23514 when out of range)', async () => {
    expect(await insertSource(randomUUID(), 'đăng nhập và mở file')).toBeNull();
    expect(await insertSource(randomUUID(), null)).toBe('23502');
    expect(await insertSource(randomUUID(), 'ab')).toBe('23514');
    expect(await insertSource(randomUUID(), 'x'.repeat(501))).toBe('23514');
  });

  it('INV-10: an import has a coverage window of at most 366 days, from not after to (23514)', async () => {
    const sourceId = await newSource();

    expect(await insertImport(sourceId, '2026-06-01', '2026-08-31')).toBeNull();
    expect(await insertImport(sourceId, '2026-01-01', '2027-01-03')).toBe('23514');
    expect(await insertImport(sourceId, '2026-01-01', '2027-01-02')).toBeNull();
    expect(await insertImport(sourceId, '2026-09-01', '2026-08-31')).toBe('23514');
  });

  it('INV-10: a completed or cancelled import cannot be written without what its state needs (23514)', async () => {
    const sourceId = await newSource();

    expect(await insertImport(sourceId, '2026-06-01', '2026-08-31', 'COMPLETED')).toBe('23514');
    expect(await insertImport(sourceId, '2026-06-01', '2026-08-31', 'CANCELLED')).toBe('23514');
  });

  it('migration: only superseded_by_import_id of an activity day changes, once (55000); a day is one row (23505)', async () => {
    const sourceId = await newSource();
    const importId = randomUUID();
    await sql.query(
      `INSERT INTO usage_imports (id, organization_id, source_id, format, coverage_from, coverage_to, coverage_basis, content_hash, summary,
         expires_at, uploaded_by_app_user_id)
       VALUES ($1, $2, $3, 'CSV', '2026-06-01', '2026-06-30', 'DECLARED', 'h', '{}'::jsonb, now(), $4)`,
      [importId, organizationId, sourceId, randomUUID()],
    );
    const insertDay = (id: string) =>
      sqlState(
        sql,
        `INSERT INTO usage_activity_days (id, organization_id, source_id, import_id, application_id, identifier_type, normalized_identifier,
           activity_date, event_class, basis)
         VALUES ($1, $2, $3, $4, $5, 'EMAIL', 'a@x.com', '2026-06-02', 'VALUE', 'ACTIVE_DATE')`,
        [id, organizationId, sourceId, importId, randomUUID()],
      );
    const dayId = randomUUID();

    expect(await insertDay(dayId)).toBeNull();
    expect(await insertDay(randomUUID())).toBe('23505');
    expect(
      await sqlState(sql, `UPDATE usage_activity_days SET activity_date = '2026-06-03' WHERE id = $1`, [dayId]),
    ).toBe('55000');
    expect(
      await sqlState(sql, `UPDATE usage_activity_days SET superseded_by_import_id = $2 WHERE id = $1`, [
        dayId,
        importId,
      ]),
    ).toBeNull();
    expect(
      await sqlState(sql, `UPDATE usage_activity_days SET superseded_by_import_id = $2 WHERE id = $1`, [
        dayId,
        randomUUID(),
      ]),
    ).toBe('55000');
  });

  it('INV-12: one mapping in force for an identifier (23505), a manual mapping names who confirmed it, an ended one says why (23514)', async () => {
    const application = randomUUID();
    const insert = (columns: { identifier: string; method?: string; confirmedBy?: string | null; ended?: boolean }) =>
      sqlState(
        sql,
        `INSERT INTO usage_identity_mappings (organization_id, application_id, identifier_type, normalized_identifier, raw_identifier,
           employee_id, method, confidence, confirmed_by_app_user_id, ended_at, ended_by_app_user_id, end_reason)
         VALUES ($1, $2, 'USERNAME', $3, $3, $4, $5::"UsageMatchMethod", 'HIGH', $6, $7, $8, $9)`,
        [
          organizationId,
          application,
          columns.identifier,
          randomUUID(),
          columns.method ?? 'EXACT_EMAIL',
          columns.confirmedBy ?? null,
          columns.ended ? new Date() : null,
          columns.ended ? randomUUID() : null,
          columns.ended ? 'nhầm người' : null,
        ],
      );

    expect(await insert({ identifier: 'baovh' })).toBeNull();
    expect(await insert({ identifier: 'baovh' })).toBe('23505');
    expect(await insert({ identifier: 'baovh', ended: true })).toBeNull();
    expect(await insert({ identifier: 'x2', method: 'MANUAL' })).toBe('23514');
    expect(await insert({ identifier: 'x2', method: 'MANUAL', confirmedBy: randomUUID() })).toBeNull();
    expect(
      await sqlState(
        sql,
        `INSERT INTO usage_identity_mappings (organization_id, application_id, identifier_type, normalized_identifier, raw_identifier,
           employee_id, method, confidence, ended_at)
         VALUES ($1, $2, 'USERNAME', 'x3', 'x3', $3, 'EXACT_EMAIL', 'HIGH', now())`,
        [organizationId, application, randomUUID()],
      ),
    ).toBe('23514');
  });
});
