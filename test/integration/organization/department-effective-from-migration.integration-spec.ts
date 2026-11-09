import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { stopCliProcesses } from '../../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

/**
 * `qd103-department-effective-year`, Task 1 (R-I10): the migration `…_department_effective_from` gives every department that exists
 * the day it takes effect: the earliest day its own history shows (creation in the time zone of the organization, a placement into
 * it, a head's term), so no dated row predates its department.
 */
const MIGRATION = migrationEndingWith('_department_effective_from');

describe('departments.effective_from migration (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  const organization = randomUUID();
  const ids = { plain: randomUUID(), placed: randomUUID(), headed: randomUUID(), late: randomUUID() };

  const effectiveOf = async (id: string): Promise<string> =>
    (await sql.query<{ day: string }>(`SELECT effective_from::text AS day FROM departments WHERE id = $1`, [id]))
      .rows[0].day;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: migrationBefore(MIGRATION) });
    if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'Asia/Ho_Chi_Minh', 'VND')`,
      [organization],
    );
    // 2026-03-09T20:00Z is already 10 March in Ho Chi Minh City.
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, created_at, updated_at) VALUES
         ($1, $5, 'PLAIN', 'Plain', '2026-03-09T20:00:00Z', now()),
         ($2, $5, 'PLACED', 'Placed', '2026-03-09T20:00:00Z', now()),
         ($3, $5, 'HEADED', 'Headed', '2026-03-09T20:00:00Z', now()),
         ($4, $5, 'LATE', 'Late', '2026-03-09T20:00:00Z', now())`,
      [ids.plain, ids.placed, ids.headed, ids.late, organization],
    );
    const employee = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-1', 'One', 'STAFF', '2026-01-01', now())`,
      [employee, organization],
    );
    await sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to) VALUES
         ($1, $3, $4, $2, '2026-01-05', '2026-02-01'), ($5, $3, $4, $6, '2026-04-01', NULL)`,
      [randomUUID(), ids.placed, organization, employee, randomUUID(), ids.late],
    );
    // The head must be a member for the whole term, so the term and the placement open on the same day.
    const head = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-2', 'Two', 'STAFF', '2026-01-01', now())`,
      [head, organization],
    );
    await sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from) VALUES ($1, $2, $3, $4, '2026-02-15')`,
      [randomUUID(), organization, head, ids.headed],
    );
    await sql.query(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from) VALUES ($1, $2, $3, $4, '2026-02-15')`,
      [randomUUID(), organization, ids.headed, head],
    );
    const deploy = await deployMigrations(database, { through: MIGRATION });
    if (deploy.code !== 0) throw new Error(`Deploying the migration failed: ${deploy.stdout}\n${deploy.stderr}`);
  }, DEPLOY_TIMEOUT_MS * 2);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it('takes the creation day in the time zone of the organization when nothing earlier is recorded', async () => {
    expect(await effectiveOf(ids.plain)).toBe('2026-03-10');
    expect(await effectiveOf(ids.late)).toBe('2026-03-10');
  });

  it('takes the earliest placement into the department when it is before the creation day', async () => {
    expect(await effectiveOf(ids.placed)).toBe('2026-01-05');
  });

  it('takes the day the term of a head opens (a head is a member from that day) when it is before the creation day', async () => {
    expect(await effectiveOf(ids.headed)).toBe('2026-02-15');
  });

  it('never leaves a placement or a term before its department', async () => {
    const predating = await sql.query(
      `SELECT 1 FROM employee_placements p JOIN departments d ON d.id = p.department_id WHERE p.valid_from < d.effective_from
       UNION ALL
       SELECT 1 FROM department_head_periods h JOIN departments d ON d.id = h.department_id WHERE h.valid_from < d.effective_from`,
    );

    expect(predating.rows).toEqual([]);
  });

  it('makes the column NOT NULL, and a department written without a day takes effect today (installation)', async () => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'NODAY', 'No day', now())`,
      [id, organization],
    );
    const today = (
      await sql.query<{ same: boolean }>(
        `SELECT effective_from = CURRENT_DATE AS same FROM departments WHERE id = $1`,
        [id],
      )
    ).rows[0].same;
    const nullable = await sql.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'departments' AND column_name = 'effective_from'`,
    );

    expect(today).toBe(true);
    expect(nullable.rows[0]).toEqual({ is_nullable: 'NO' });
  });
});
