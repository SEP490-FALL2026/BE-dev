import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/** QĐ-103i, BR-MF4-01/02: what the database keeps true about the budget cycle of a year and the ceilings of its departments. */
describe('budget cycles and department ceilings (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let employeeId: string;
  let departmentId: string;
  let ceilingYear = 2100;

  const cycle = (over: Record<string, unknown> = {}) => {
    const row = {
      id: randomUUID(),
      year: 2027,
      submission: '2026-12-01',
      decision: '2026-12-15',
      ceiling: '1000',
      reserve: null as string | null,
      published: false,
      first: false,
      ...over,
    };

    return sqlState(
      sql,
      `INSERT INTO budget_cycles (id, organization_id, year, submission_deadline, decision_deadline, annual_ceiling_minor,
         shared_pool_reserve_minor, currency, opened_by_employee_id, opened_at, published_by_employee_id, published_at,
         first_published_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'VND', $8, now(), $9, $10, $11, now())`,
      [
        row.id,
        organizationId,
        row.year,
        row.submission,
        row.decision,
        row.ceiling,
        row.reserve,
        employeeId,
        row.published ? employeeId : null,
        row.published ? new Date() : null,
        row.first ? new Date() : null,
      ],
    );
  };
  const ceiling = async (over: Record<string, unknown> = {}) => {
    const cycleId = randomUUID();
    await sql.query(
      `INSERT INTO budget_cycles (id, organization_id, year, submission_deadline, decision_deadline, annual_ceiling_minor, currency,
         opened_by_employee_id, opened_at, updated_at)
       VALUES ($1, $2, $3, '2026-12-01', '2026-12-15', 1000, 'VND', $4, now(), now())`,
      [cycleId, organizationId, (ceilingYear += 1), employeeId],
    );
    const row = {
      signed: '100',
      planned: '200',
      priority: '50',
      total: '350',
      published: null as string | null,
      ...over,
    };

    return sqlState(
      sql,
      `INSERT INTO budget_department_ceilings (cycle_id, department_id, signed_commitments_minor, planned_seats_minor,
         priority_minor, total_minor, published_total_minor) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [cycleId, departmentId, row.signed, row.planned, row.priority, row.total, row.published],
    );
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
    employeeId = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-1', 'Finance One', 'STAFF', '2026-01-01', now())`,
      [employeeId, organizationId],
    );
    departmentId = randomUUID();
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'P-1', 'Phòng 1', now())`,
      [departmentId, organizationId],
    );
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('stores a cycle with its deadlines and ceiling, with the reserve still to enter (null) or an explicit zero', async () => {
    expect(await cycle({ year: 2027 })).toBeNull();
    expect(await cycle({ year: 2028, reserve: '0' })).toBeNull();
  });

  it('keeps one cycle for a year of an organization', async () => {
    expect(await cycle({ year: 2029 })).toBeNull();
    expect(await cycle({ year: 2029 })).toBe('23505');
  });

  it('refuses a decision deadline before the submission deadline, a negative ceiling or reserve, and a year that is not a year', async () => {
    expect(await cycle({ year: 2030, submission: '2026-12-15', decision: '2026-12-01' })).toBe('23514');
    expect(await cycle({ year: 2031, ceiling: '-1' })).toBe('23514');
    expect(await cycle({ year: 2032, reserve: '-1' })).toBe('23514');
    expect(await cycle({ year: 27 })).toBe('23514');
  });

  it('shows a published cycle only with a first publication, and the person who published it', async () => {
    expect(await cycle({ year: 2033, published: true, first: true })).toBeNull();
    expect(await cycle({ year: 2034, published: true, first: false })).toBe('23514');
    expect(await cycle({ year: 2035, published: false, first: true })).toBeNull();
  });

  it('keeps the total of a department ceiling equal to its three parts, none of them negative', async () => {
    expect(await ceiling()).toBeNull();
    expect(await ceiling({ total: '351' })).toBe('23514');
    expect(await ceiling({ signed: '-1', total: '249' })).toBe('23514');
    expect(await ceiling({ published: '-5' })).toBe('23514');
  });

  it('removes the ceilings with the cycle and keeps one ceiling per department in a cycle', async () => {
    const cycleId = randomUUID();
    await sql.query(
      `INSERT INTO budget_cycles (id, organization_id, year, submission_deadline, decision_deadline, annual_ceiling_minor, currency,
         opened_by_employee_id, opened_at, updated_at)
       VALUES ($1, $2, 2040, '2026-12-01', '2026-12-15', 1000, 'VND', $3, now(), now())`,
      [cycleId, organizationId, employeeId],
    );
    const insert = () =>
      sqlState(sql, `INSERT INTO budget_department_ceilings VALUES ($1, $2, 1, 1, 1, 3, NULL)`, [
        cycleId,
        departmentId,
      ]);

    expect(await insert()).toBeNull();
    expect(await insert()).toBe('23505');
    await sql.query(`DELETE FROM budget_cycles WHERE id = $1`, [cycleId]);
    expect((await sql.query(`SELECT 1 FROM budget_department_ceilings WHERE cycle_id = $1`, [cycleId])).rowCount).toBe(
      0,
    );
  });
});
