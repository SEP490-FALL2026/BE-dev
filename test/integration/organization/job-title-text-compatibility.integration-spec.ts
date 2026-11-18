import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { stopCliProcesses } from '../../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { expansionWorld, ExpansionWorld, sqlState } from '../../support/expansion-world';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.3a (F03, F41, reviews `P03-RV-03`, spec L.4 and L.10): the migration
 * `…_job_title_text` is the compatibility step of the free-text job title. It only adds and relaxes, so the `7c28e75`
 * application — which names a job title through `job_titles` on every placement, transfer and review — keeps working on the
 * new schema: the title of each person is copied into `employees.job_title`, the four `job_title_id` columns accept NULL,
 * and two triggers carry what is written afterwards either way (`employees_job_title_forward` for a placement `7c28e75`
 * wrote, `job_title_id_backfill` for the rows of the compatibility release, which no longer names a catalogue entry). Every
 * statement that plays `7c28e75` is plain SQL on the old columns.
 */
const TEXT = migrationEndingWith('_job_title_text');

describe('free-text job title, compatibility migration (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  const titles = { engineer: randomUUID(), designer: randomUUID() };
  let counter = 0;

  /** An employee as `7c28e75` writes one: no title on the row itself, it is on the placement. */
  const employee = async (code: string, extra: { jobTitle?: string | null } = {}): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at, ${
        extra.jobTitle === undefined ? '' : 'job_title,'
      } status)
       VALUES ($1, $2, $3, 'Someone', 'STAFF', '2026-01-01', now(), ${extra.jobTitle === undefined ? '' : '$4,'} 'ACTIVE')`,
      extra.jobTitle === undefined
        ? [id, world.organizationId, code]
        : [id, world.organizationId, code, extra.jobTitle],
    );

    return id;
  };
  /** A placement as `7c28e75` writes one: it always names its catalogue entry. */
  const placement = async (
    employeeId: string,
    department: string,
    jobTitleId: string | null,
    validFrom: string,
    validTo: string | null = null,
  ): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from, valid_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, world.organizationId, employeeId, department, jobTitleId, validFrom, validTo],
    );

    return id;
  };
  const titleOf = async (employeeId: string) =>
    (await sql.query<{ job_title: string | null }>('SELECT job_title FROM employees WHERE id = $1', [employeeId]))
      .rows[0].job_title;
  const catalogue = async (name: string) =>
    (
      await sql.query<{ id: string; name: string; status: string }>(
        `SELECT id, name, status FROM job_titles WHERE organization_id = $1 AND normalized_name = lower($2)`,
        [world.organizationId, name],
      )
    ).rows;
  const newCode = () => `T-${(counter += 1)}`;

  const olds = {
    current: randomUUID(),
    futureOnly: randomUUID(),
    twoFuture: randomUUID(),
    single: randomUUID(),
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: migrationBefore(TEXT) });
    if (before.code !== 0) throw new Error(`Deploying the history before the title migration failed: ${before.stdout}`);
    world = await expansionWorld(sql);
    await sql.query(
      `INSERT INTO job_titles (id, organization_id, name, normalized_name) VALUES
         ($1, $3, 'Engineer', 'engineer'), ($2, $3, 'Designer', 'designer')`,
      [titles.engineer, titles.designer, world.organizationId],
    );
    // The rows `7c28e75` left, with titles on the placements: the migration copies the current one onto the person (L.4).
    for (const [id, code] of [
      [olds.current, 'OLD-CUR'],
      [olds.futureOnly, 'OLD-FUT'],
      [olds.twoFuture, 'OLD-2FUT'],
      [olds.single, 'OLD-ONE'],
    ] as const) {
      await sql.query(
        `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
         VALUES ($1, $2, $3, 'Old', 'STAFF', '2020-01-01', now())`,
        [id, world.organizationId, code],
      );
    }
    // The latest period that began on or before the migration day wins, whatever order the rows were written in.
    await placement(olds.current, world.departments.eng, titles.engineer, '2020-01-01', '2022-01-01');
    await placement(olds.current, world.departments.ops, titles.designer, '2022-01-01');
    // Only a period still to come: the earliest of them.
    await placement(olds.futureOnly, world.departments.eng, titles.designer, '2999-01-01');
    await placement(olds.twoFuture, world.departments.eng, titles.designer, '2999-06-01');
    await placement(olds.twoFuture, world.departments.ops, titles.engineer, '2999-02-01', '2999-06-01');
    await placement(olds.single, world.departments.eng, titles.engineer, '2020-01-01');
    // Through the compatibility migration: the migrations of the final release drop the catalogue and the four columns this suite reads.
    const deploy = await deployMigrations(database, { through: TEXT });
    if (deploy.code !== 0) throw new Error(`Deploying the title migration failed: ${deploy.stdout}\n${deploy.stderr}`);
  }, DEPLOY_TIMEOUT_MS * 2);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it('copies the title of the current period onto each person: the latest period begun by the migration day, else the earliest', async () => {
    expect(await titleOf(olds.current)).toBe('Designer');
    expect(await titleOf(olds.futureOnly)).toBe('Designer');
    expect(await titleOf(olds.twoFuture)).toBe('Engineer');
    expect(await titleOf(olds.single)).toBe('Engineer');
    // A person with no placement at all has no title to copy: the column is nullable.
    expect(await titleOf(world.ownerEmployeeId)).toBeNull();
  });

  it('lets the four job_title_id columns be NULL, and keeps every foreign key and the unique key of the catalogue', async () => {
    const columns = await sql.query<{ table_name: string; column_name: string; is_nullable: string }>(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name IN ('job_title_id', 'from_job_title_id', 'to_job_title_id')
          AND table_name IN ('employee_placements', 'department_transfers', 'transfer_reviews')
        ORDER BY table_name, column_name`,
    );

    expect(columns.rows).toEqual([
      { table_name: 'department_transfers', column_name: 'from_job_title_id', is_nullable: 'YES' },
      { table_name: 'department_transfers', column_name: 'to_job_title_id', is_nullable: 'YES' },
      { table_name: 'employee_placements', column_name: 'job_title_id', is_nullable: 'YES' },
      { table_name: 'transfer_reviews', column_name: 'job_title_id', is_nullable: 'YES' },
    ]);
    const foreignKeys = await sql.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname LIKE '%job_title_id_fkey' ORDER BY conname`,
    );
    expect(foreignKeys.rows.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        'department_transfers_from_job_title_id_fkey',
        'department_transfers_to_job_title_id_fkey',
        'employee_placements_job_title_id_fkey',
        'transfer_reviews_job_title_id_fkey',
      ]),
    );
  });

  describe('what 7c28e75 writes after the migration (it names the catalogue entry on the placement)', () => {
    it('fills employees.job_title from the placement the release wrote, when the person has none', async () => {
      const person = await employee(newCode());
      await placement(person, world.departments.eng, titles.engineer, '2026-02-01');

      expect(await titleOf(person)).toBe('Engineer');
    });

    it('keeps a title the person already has: the forward trigger fills a missing one only', async () => {
      const person = await employee(newCode(), { jobTitle: 'Staff Engineer' });
      await placement(person, world.departments.eng, titles.engineer, '2026-02-01');

      expect(await titleOf(person)).toBe('Staff Engineer');
    });
  });

  describe('what the compatibility release writes (it names no catalogue entry: the title is free text on the person)', () => {
    it('gives a placement the catalogue entry that matches the title as it is compared (case and whitespace ignored), creating none', async () => {
      const person = await employee(newCode(), { jobTitle: 'Senior Designer' });
      await sql.query(
        `INSERT INTO job_titles (id, organization_id, name, normalized_name) VALUES (gen_random_uuid(), $1, 'Senior Designer', 'senior designer')`,
        [world.organizationId],
      );
      const known = (await catalogue('senior designer'))[0].id;
      const before = Number((await sql.query<{ n: string }>('SELECT count(*) AS n FROM job_titles')).rows[0].n);

      const written = await placement(person, world.departments.eng, null, '2026-02-01');

      const row = await sql.query<{ job_title_id: string | null }>(
        'SELECT job_title_id FROM employee_placements WHERE id = $1',
        [written],
      );
      expect(row.rows[0].job_title_id).toBe(known);
      expect(Number((await sql.query<{ n: string }>('SELECT count(*) AS n FROM job_titles')).rows[0].n)).toBe(before);
    });

    it('creates one ACTIVE entry for a title the catalogue has not, once, whatever the case of the next person', async () => {
      const first = await employee(newCode(), { jobTitle: 'Chief  Happiness  Officer' });
      const second = await employee(newCode(), { jobTitle: 'chief happiness officer' });

      const one = await placement(first, world.departments.eng, null, '2026-02-01');
      const two = await placement(second, world.departments.ops, null, '2026-02-01');

      const entries = await catalogue('chief happiness officer');
      expect(entries).toHaveLength(1);
      // The stored name is the one that created it, trimmed and collapsed as the display name rule says.
      expect(entries[0]).toMatchObject({ name: 'Chief Happiness Officer', status: 'ACTIVE' });
      const placements = await sql.query<{ job_title_id: string }>(
        'SELECT job_title_id FROM employee_placements WHERE id = ANY($1::uuid[])',
        [[one, two]],
      );
      expect(placements.rows.map((row) => row.job_title_id)).toEqual([entries[0].id, entries[0].id]);
    });

    it('gives a transfer both titles (the one of the person, as it only changes department) and a review the one of its placement', async () => {
      const person = await employee(newCode(), { jobTitle: 'Engineer' });
      const from = await placement(person, world.departments.eng, null, '2026-01-01', '2026-06-01');
      const opens = await placement(person, world.departments.ops, null, '2026-06-01');
      const transfer = randomUUID();
      await sql.query(
        `INSERT INTO department_transfers (id, organization_id, employee_id, from_department_id, to_department_id,
           effective_on, closes_placement_id, opens_placement_id, grounds_type, grounds_reference, grounds_issuer,
           grounds_issued_on, recorded_by_app_user_id)
         VALUES ($1, $2, $3, $4, $5, '2026-06-01', $6, $7, 'DECISION', 'D-1', 'HR', '2026-05-01', gen_random_uuid())`,
        [transfer, world.organizationId, person, world.departments.eng, world.departments.ops, from, opens],
      );
      const review = randomUUID();
      await sql.query(
        `INSERT INTO transfer_reviews (id, organization_id, employee_id, transfer_id, placement_id, department_id,
           effective_on, due_on)
         VALUES ($1, $2, $3, $4, $5, $6, '2026-06-01', '2026-06-08')`,
        [review, world.organizationId, person, transfer, opens, world.departments.ops],
      );

      const entry = (await catalogue('engineer'))[0].id;
      const transferRow = await sql.query<{ from_job_title_id: string; to_job_title_id: string }>(
        'SELECT from_job_title_id, to_job_title_id FROM department_transfers WHERE id = $1',
        [transfer],
      );
      const reviewRow = await sql.query<{ job_title_id: string }>(
        'SELECT job_title_id FROM transfer_reviews WHERE id = $1',
        [review],
      );
      expect(transferRow.rows[0]).toEqual({ from_job_title_id: entry, to_job_title_id: entry });
      expect(reviewRow.rows[0].job_title_id).toBe(entry);
      // And the previous release reads them through its own join, as before.
      const read = await sql.query<{ name: string }>(
        `SELECT t.name FROM department_transfers d JOIN job_titles t ON t.id = d.to_job_title_id WHERE d.id = $1`,
        [transfer],
      );
      expect(read.rows).toEqual([{ name: 'Engineer' }]);
    });

    it('leaves the column NULL for a person with no title (the migration does not invent one), and keeps a title that the row names itself', async () => {
      const bare = await employee(newCode());
      const named = await employee(newCode(), { jobTitle: 'Designer' });

      const withoutTitle = await placement(bare, world.departments.eng, null, '2026-02-01');
      const withId = await placement(named, world.departments.eng, titles.engineer, '2026-02-01');

      const rows = await sql.query<{ id: string; job_title_id: string | null }>(
        'SELECT id, job_title_id FROM employee_placements WHERE id = ANY($1::uuid[])',
        [[withoutTitle, withId]],
      );
      const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row.job_title_id]));
      expect(byId[withoutTitle]).toBeNull();
      expect(byId[withId]).toBe(titles.engineer);
    });
  });

  it('refuses a free-text title that is empty or longer than 255 characters, and keeps the shape the display name rule gives', async () => {
    const person = await employee(newCode());

    expect(await sqlState(sql, 'UPDATE employees SET job_title = $2 WHERE id = $1', [person, ''])).toBe('23514');
    expect(await sqlState(sql, 'UPDATE employees SET job_title = $2 WHERE id = $1', [person, 'x'.repeat(256)])).toBe(
      '23514',
    );
    expect(
      await sqlState(sql, 'UPDATE employees SET job_title = $2 WHERE id = $1', [person, 'x'.repeat(255)]),
    ).toBeNull();
    expect(await sqlState(sql, 'UPDATE employees SET job_title = NULL WHERE id = $1', [person])).toBeNull();
  });

  describe('control: with the triggers off the same writes leave the old shape, so the cases above prove the triggers', () => {
    it('does not fill employees.job_title or job_title_id without employees_job_title_forward and job_title_id_backfill', async () => {
      await sql.query('ALTER TABLE employee_placements DISABLE TRIGGER employees_job_title_forward');
      await sql.query('ALTER TABLE employee_placements DISABLE TRIGGER job_title_id_backfill');
      try {
        const legacy = await employee(newCode());
        await placement(legacy, world.departments.eng, titles.engineer, '2026-02-01');
        const typed = await employee(newCode(), { jobTitle: 'Engineer' });
        const written = await placement(typed, world.departments.eng, null, '2026-02-01');

        expect(await titleOf(legacy)).toBeNull();
        const row = await sql.query<{ job_title_id: string | null }>(
          'SELECT job_title_id FROM employee_placements WHERE id = $1',
          [written],
        );
        expect(row.rows[0].job_title_id).toBeNull();
      } finally {
        await sql.query('ALTER TABLE employee_placements ENABLE TRIGGER employees_job_title_forward');
        await sql.query('ALTER TABLE employee_placements ENABLE TRIGGER job_title_id_backfill');
      }
    });
  });
});
