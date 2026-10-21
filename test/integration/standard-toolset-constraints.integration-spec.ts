import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('standard toolsets (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let departmentId: string;
  let senior: string;
  let figma: string;
  let miro: string;
  let counter = 0;

  const newPair = async (): Promise<{ department: string; jobTitle: string }> => {
    counter += 1;
    const costCenter = randomUUID();
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind) VALUES ($1, $2, $3, $3, 'UNIT')`,
      [costCenter, organizationId, `CC-${counter}`],
    );
    const department = randomUUID();
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, cost_center_id) VALUES ($1, $2, $3, $3, $4)`,
      [department, organizationId, `P-${counter}`, costCenter],
    );
    const jobTitle = randomUUID();
    await sql.query(
      `INSERT INTO job_titles (id, organization_id, name, normalized_name, updated_at) VALUES ($1, $2, $3, $3, now())`,
      [jobTitle, organizationId, `Title ${counter}`],
    );

    return { department, jobTitle };
  };
  const head = (department: string, jobTitle: string) =>
    sqlState(sql, `INSERT INTO standard_toolsets (department_id, job_title_id, organization_id) VALUES ($1, $2, $3)`, [
      department,
      jobTitle,
      organizationId,
    ]);
  const version = async (
    department: string,
    jobTitle: string,
    number: number,
    reason = 'theo đề xuất của trưởng phòng',
  ): Promise<{ state: string | null; id: string }> => {
    const id = randomUUID();
    const state = await sqlState(
      sql,
      `INSERT INTO standard_toolset_versions (id, department_id, job_title_id, version, reason, changed_by_app_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, department, jobTitle, number, reason, randomUUID()],
    );

    return { state, id };
  };
  const item = (versionId: string, planId: string) =>
    sqlState(sql, `INSERT INTO standard_toolset_items (version_id, plan_id) VALUES ($1, $2)`, [versionId, planId]);

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
    const owner = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-1', 'Owner', 'STAFF', '2026-01-01', now())`,
      [owner, organizationId],
    );
    const plan = async (name: string): Promise<string> => {
      const vendorId = randomUUID();
      await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $3)`, [
        vendorId,
        organizationId,
        name,
      ]);
      const applicationId = randomUUID();
      await sql.query(
        `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
           data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
         VALUES ($1, $2, 'SAAS', $3, $4, $4, $5, 'LOW', false, false, false, false)`,
        [applicationId, organizationId, vendorId, name, owner],
      );
      const planId = randomUUID();
      await sql.query(
        `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
         VALUES ($1, $2, $3, 'Team', 'team', 'K2', 'PER_SEAT', 'FULL')`,
        [planId, organizationId, applicationId],
      );

      return planId;
    };
    figma = await plan('Figma');
    miro = await plan('Miro');
    const first = await newPair();
    departmentId = first.department;
    senior = (await newPair()).jobTitle;
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('has one head per department and job title, and refuses a department or a job title that does not exist', async () => {
    const pair = await newPair();

    expect(await head(pair.department, pair.jobTitle)).toBeNull();
    expect(await head(pair.department, pair.jobTitle)).toBe('23505');
    expect(await head(randomUUID(), pair.jobTitle)).toBe('23503');
    expect(await head(pair.department, randomUUID())).toBe('23503');
  });

  it('keeps the version number positive and unique for a pair, and refuses a version of a pair with no head', async () => {
    const pair = await newPair();
    await head(pair.department, pair.jobTitle);

    expect((await version(pair.department, pair.jobTitle, 1)).state).toBeNull();
    expect((await version(pair.department, pair.jobTitle, 1)).state).toBe('23505');
    expect((await version(pair.department, pair.jobTitle, 0)).state).toBe('23514');
    expect((await version(departmentId, senior, 1)).state).toBe('23503');
  });

  it('refuses a version without a reason: a blank one is none (AC-2)', async () => {
    const pair = await newPair();
    await head(pair.department, pair.jobTitle);

    expect((await version(pair.department, pair.jobTitle, 1, '')).state).toBe('23514');
    expect((await version(pair.department, pair.jobTitle, 1, '   ')).state).toBe('23514');
  });

  it('keeps a plan once in a version, and refuses a plan that is not in the catalog (AC-9)', async () => {
    const pair = await newPair();
    await head(pair.department, pair.jobTitle);
    const { id } = await version(pair.department, pair.jobTitle, 1);

    expect(await item(id, figma)).toBeNull();
    expect(await item(id, miro)).toBeNull();
    expect(await item(id, figma)).toBe('23505');
    expect(await item(id, randomUUID())).toBe('23503');
    expect(await item(randomUUID(), figma)).toBe('23503');
  });

  it('never changes or deletes a recorded version or its items, whoever writes it: the history stays whole', async () => {
    const pair = await newPair();
    await head(pair.department, pair.jobTitle);
    const { id } = await version(pair.department, pair.jobTitle, 1);
    await item(id, figma);

    expect(await sqlState(sql, `UPDATE standard_toolset_versions SET reason = 'x' WHERE id = $1`, [id])).toBe('55000');
    expect(await sqlState(sql, `DELETE FROM standard_toolset_versions WHERE id = $1`, [id])).toBe('55000');
    expect(
      await sqlState(sql, `UPDATE standard_toolset_items SET plan_id = $2 WHERE version_id = $1`, [id, miro]),
    ).toBe('55000');
    expect(await sqlState(sql, `DELETE FROM standard_toolset_items WHERE version_id = $1`, [id])).toBe('55000');
    const stored = await sql.query<{ plan_id: string }>(
      `SELECT plan_id FROM standard_toolset_items WHERE version_id = $1`,
      [id],
    );
    expect(stored.rows).toEqual([{ plan_id: figma }]);
  });

  it('lets the head move to the next version, which is already recorded, and refuses a version below zero', async () => {
    const pair = await newPair();
    await head(pair.department, pair.jobTitle);
    await version(pair.department, pair.jobTitle, 1);
    const move = (to: number) =>
      sqlState(
        sql,
        `UPDATE standard_toolsets SET current_version = $3 WHERE department_id = $1 AND job_title_id = $2`,
        [pair.department, pair.jobTitle, to],
      );

    expect(await move(1)).toBeNull();
    expect(await move(-1)).toBe('55000');
  });

  it('records a version only as the next one of its pair, and its items only while it is being written (history stays whole)', async () => {
    const pair = await newPair();
    await head(pair.department, pair.jobTitle);
    const move = (to: number) =>
      sqlState(
        sql,
        `UPDATE standard_toolsets SET current_version = $3 WHERE department_id = $1 AND job_title_id = $2`,
        [pair.department, pair.jobTitle, to],
      );

    // The first version is written, its items with it, and then the head moves to it.
    const first = await version(pair.department, pair.jobTitle, 1);
    expect(first.state).toBeNull();
    expect(await item(first.id, figma)).toBeNull();
    expect((await version(pair.department, pair.jobTitle, 3)).state).toBe('55000');
    expect(await move(1)).toBeNull();

    // The version is recorded: nothing is added to it any more, and no version is written out of turn.
    expect(await item(first.id, miro)).toBe('55000');
    expect((await version(pair.department, pair.jobTitle, 3)).state).toBe('55000');
    expect((await version(pair.department, pair.jobTitle, 1)).state).toBe('55000');
    const second = await version(pair.department, pair.jobTitle, 2);
    expect(second.state).toBeNull();
    expect(await item(second.id, miro)).toBeNull();

    // The head moves up by one, to a version that exists; never back, never past it.
    expect(await move(3)).toBe('55000');
    expect(await move(0)).toBe('55000');
    expect(await move(2)).toBeNull();
    expect(await move(4)).toBe('55000');
    const stored = await sql.query<{ plan_id: string }>(
      `SELECT plan_id FROM standard_toolset_items WHERE version_id = $1`,
      [first.id],
    );
    expect(stored.rows).toEqual([{ plan_id: figma }]);
  });
});
