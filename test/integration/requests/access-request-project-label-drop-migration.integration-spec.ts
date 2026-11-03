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

const MIGRATION = migrationEndingWith('_requests_drop_project_label');

interface Seed {
  orgId: string;
  deptId: string;
  costCenterId: string;
  empId: string;
  appUserId: string;
  planId: string;
}

describe('drop project_label migration (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;

  afterEach(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  async function startFromBefore(): Promise<Seed> {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();

    const before = await deployMigrations(database, { through: migrationBefore(MIGRATION) });
    expect(before.code).toBe(0);

    const seed: Seed = {
      orgId: randomUUID(),
      deptId: randomUUID(),
      costCenterId: randomUUID(),
      empId: randomUUID(),
      appUserId: randomUUID(),
      planId: randomUUID(),
    };
    const appId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme Corp', 'Asia/Ho_Chi_Minh', 'VND')`,
      [seed.orgId],
    );
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, 'DEPT-1', 'Engineering', now())`,
      [seed.deptId, seed.orgId],
    );
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at) VALUES ($1, $2, 'CC-01', 'Engineering CC', 'UNIT', 'ACTIVE', $3, now())`,
      [seed.costCenterId, seed.orgId, seed.deptId],
    );
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, employment_type, hire_date, updated_at) VALUES ($1, $2, 'EMP-001', 'Test Person', 'emp1@corp.test', 'STAFF'::"EmploymentType", now()::date, now())`,
      [seed.empId, seed.orgId],
    );
    await sql.query(
      `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, updated_at) VALUES ($1, $2, $3, 'user@acme.test', 'user@acme.test', 'ACTIVE', now())`,
      [seed.appUserId, seed.orgId, seed.empId],
    );
    await sql.query(
      `INSERT INTO applications (
        id, organization_id, kind, name, normalized_name,
        business_owner_employee_id, data_sensitivity,
        comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox,
        is_communication_service
      ) VALUES ($1, $2, 'INTERNAL', 'Internal App', 'internal app', $3, 'LOW', false, false, false, false)`,
      [appId, seed.orgId, seed.empId],
    );
    await sql.query(
      `INSERT INTO plans (
        id, organization_id, application_id, name, normalized_name, provisioning_type
      ) VALUES ($1, $2, $3, 'Internal Plan', 'internal plan', 'K5')`,
      [seed.planId, seed.orgId, appId],
    );

    return seed;
  }

  async function insertRequest(
    seed: Seed,
    state: 'PENDING' | 'DRAFT',
    policy: string,
    projectLabel: string | null,
  ): Promise<string> {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO access_requests (
        id, organization_id, branch, state, plan_id, requester_employee_id,
        department_id, cost_center_id, business_reason, term_months, policy,
        created_by_app_user_id, project_label, submitted_at
      ) VALUES ($1, $2, 'INTERNAL_FREE', $3::"AccessRequestState", $4, $5, $6, $7, 'Testing', 6, $8::jsonb, $9, $10,
               CASE WHEN $3 = 'DRAFT' THEN NULL ELSE now() END)`,
      [
        id,
        seed.orgId,
        state,
        seed.planId,
        seed.empId,
        seed.deptId,
        seed.costCenterId,
        policy,
        seed.appUserId,
        projectLabel,
      ],
    );

    return id;
  }

  const draftPolicyOf = async (id: string) =>
    (
      await sql.query<{ policy: { draft: Record<string, unknown> } }>(
        `SELECT policy FROM access_requests WHERE id = $1`,
        [id],
      )
    ).rows[0].policy.draft;

  it(
    'drops project_label and cleans the draft policy projectLabel key when no request that was sent carries a label',
    async () => {
      const seed = await startFromBefore();
      const sentId = await insertRequest(seed, 'PENDING', '{"version": 1}', null);
      const draftWithKeyId = await insertRequest(
        seed,
        'DRAFT',
        '{"draft": {"projectLabel": "Old Draft Label", "keepMe": true}}',
        null,
      );
      const draftWithoutKeyId = await insertRequest(seed, 'DRAFT', '{"draft": {"keepMe": true}}', null);
      // The column of a draft is not read by the guard: a draft is not a request that was sent.
      await insertRequest(seed, 'DRAFT', '{"draft": {"keepMe": true}}', 'Label of a draft');

      const deploy = await deployMigrations(database, { through: MIGRATION });
      expect(deploy.code).toBe(0);

      const column = await sql.query(
        `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'access_requests' AND column_name = 'project_label'`,
      );
      expect(column.rows).toHaveLength(0);
      expect(await draftPolicyOf(draftWithKeyId)).toEqual({ keepMe: true });
      expect(await draftPolicyOf(draftWithoutKeyId)).toEqual({ keepMe: true });
      const sent = await sql.query<{ state: string }>(`SELECT state FROM access_requests WHERE id = $1`, [sentId]);
      expect(sent.rows).toEqual([{ state: 'PENDING' }]);
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  it(
    'stops with P0001, lists the request and drops nothing while a request that was sent carries a label',
    async () => {
      const seed = await startFromBefore();
      const labelled = await insertRequest(seed, 'PENDING', '{"version": 1}', 'Special Project');
      const draftId = await insertRequest(seed, 'DRAFT', '{"draft": {"projectLabel": "Old", "keepMe": true}}', null);

      const attempt = await deployMigrations(database, { through: MIGRATION });

      expect(attempt.code).not.toBe(0);
      const output = attempt.stderr + attempt.stdout;
      expect(output).toContain('P0001');
      expect(output).toContain('requests that were sent still carry a label');
      expect(output).toContain(`PROJECT_LABEL request ${labelled}`);
      const column = await sql.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'access_requests' AND column_name = 'project_label'`,
      );
      expect(column.rowCount).toBe(1);
      const label = await sql.query<{ project_label: string }>(
        `SELECT project_label FROM access_requests WHERE id = $1`,
        [labelled],
      );
      expect(label.rows[0].project_label).toBe('Special Project');
      // The migration is one unit: the draft JSON was not cleaned either.
      expect(await draftPolicyOf(draftId)).toEqual({ projectLabel: 'Old', keepMe: true });
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
