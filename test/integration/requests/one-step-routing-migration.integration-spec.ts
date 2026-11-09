import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { AccessRequestRepo } from '../../../src/modules/requests/access-request/access-request.repo';
import { OneStepConversionService } from '../../../src/modules/requests/reassignment/one-step-conversion.service';
import { createHttpTestApp, type HttpTestApp } from '../../support/http-test-app';
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
const VALUES = migrationEndingWith('_request_one_step_values');
const RULES = migrationEndingWith('_request_one_step');
interface Seed {
  orgId: string;
  deptId: string;
  costCenterId: string;
  empId: string;
  appUserId: string;
  planId: string;
}
describe('BR-MF1-02: one-step migration keeps history and marks old requests without checking budgets', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let runtime: HttpTestApp | undefined;
  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });
  async function startThrough(migration: string, timeZone = 'Asia/Ho_Chi_Minh'): Promise<Seed> {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: migration });
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
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme Corp', $2, 'VND')`,
      [seed.orgId, timeZone],
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
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type)
       VALUES ($1, $2, $3, 'Internal Plan', 'internal plan', 'K5')`,
      [seed.planId, seed.orgId, appId],
    );

    return seed;
  }

  async function legacy(seed: Seed, row: number, state = 'PENDING', spend = false): Promise<string> {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO access_requests (id, organization_id, branch, state, plan_id, requester_employee_id, department_id, cost_center_id, business_reason, policy, created_by_app_user_id, submitted_at)
      VALUES ($1,$2,'INTERNAL_FREE',$3::"AccessRequestState",$4,$5,$6,$7,'Legacy request','{"version":1,"branch":"INTERNAL_FREE","chain":["NEED","IT_EXECUTION"],"slaWorkingDays":2}',$8,now())`,
      [id, seed.orgId, state, seed.planId, seed.empId, seed.deptId, seed.costCenterId, seed.appUserId],
    );
    await sql.query(
      `INSERT INTO access_request_steps (id,request_id,kind,sequence,state,assignee_employee_id,routing_row,waiting_reason,sla_working_days,assigned_at)
      VALUES ($1,$2,'NEED',1,$3::"AccessRequestStepState",$4,$5,$6,2,$7)`,
      [
        randomUUID(),
        id,
        row === 4 ? 'WAITING' : 'PENDING',
        row === 4 ? null : seed.empId,
        row,
        row === 4 ? 'NO_DEPARTMENT_HEAD' : null,
        row === 4 ? null : new Date(),
      ],
    );
    if (spend)
      await sql.query(
        `INSERT INTO access_request_steps (id,request_id,kind,sequence,state,assignee_employee_id,routing_row,sla_working_days,assigned_at) VALUES ($1,$2,'SPEND_APPROVAL',2,'PENDING',$3,9,2,now())`,
        [randomUUID(), id, seed.empId],
      );
    return id;
  }

  /** A paid historical row, before the routing columns exist. The migration reads its branch, not its price source. */
  async function paidLegacy(seed: Seed, row: number, state = 'PENDING', spend = false): Promise<string> {
    const id = await legacy(seed, row, state, spend);
    await sql.query(
      `UPDATE access_requests SET branch = 'PAID_IN_CATALOG', pricing_status = 'MISSING',
         price_missing_reason = 'NO_PRICED_SUBSCRIPTION',
         budget_year = extract(year FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int,
         policy = '{"version":1,"branch":"PAID_IN_CATALOG","chain":["NEED","SPEND_APPROVAL","IT_EXECUTION"],"slaWorkingDays":2}'
       WHERE id = $1`,
      [id],
    );
    return id;
  }

  async function approveLegacyNeed(seed: Seed, id: string): Promise<void> {
    await sql.query(
      `UPDATE access_request_steps SET state = 'APPROVED', decided_at = now(),
         same_person_as_spend = true, no_independent_review = true WHERE request_id = $1 AND kind = 'NEED'`,
      [id],
    );
    await sql.query(
      `INSERT INTO approval_records (id, organization_id, request_id, step_id, decision,
         decided_by_employee_id, decider_role, department_id, decided_at)
       SELECT gen_random_uuid(), $2, request_id, id, 'APPROVED', $3, 'FALLBACK_APPROVER', $4, decided_at
         FROM access_request_steps WHERE request_id = $1 AND kind = 'NEED'`,
      [id, seed.orgId, seed.empId, seed.deptId],
    );
  }

  async function awaitingGroup(seed: Seed): Promise<string> {
    const id = await paidLegacy(seed, 4);
    const colleague = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'EMP-002', 'Second Person', 'emp2@corp.test', 'STAFF', now()::date, now())`,
      [colleague, seed.orgId],
    );
    await sql.query('BEGIN');
    try {
      await sql.query(`UPDATE access_requests SET type = 'GROUP_GRANT' WHERE id = $1`, [id]);
      await sql.query(
        `INSERT INTO access_request_beneficiaries (request_id, employee_id, position) VALUES ($1, $2, 1), ($1, $3, 2)`,
        [id, seed.empId, colleague],
      );
      await sql.query(
        `INSERT INTO access_request_lines (request_id, employee_id, state, need_step_id)
         SELECT b.request_id, b.employee_id, 'AWAITING_NEED', s.id
           FROM access_request_beneficiaries b JOIN access_request_steps s ON s.request_id = b.request_id AND s.kind = 'NEED'
          WHERE b.request_id = $1`,
        [id],
      );
      await sql.query('COMMIT');
    } catch (error) {
      await sql.query('ROLLBACK');
      throw error;
    }
    return id;
  }
  it(
    'BR-MF1-02 Q-24: rows 2/4/8 are marked and request states are kept, including a request with an open spend step',
    async () => {
      const seed = await startThrough(migrationBefore(VALUES));
      const ids = [];
      for (const row of [2, 4, 8]) ids.push(await legacy(seed, row));
      const open = await legacy(seed, 2, 'AWAITING_SPEND_DECISION', true);
      const deploy = await deployMigrations(database, { through: RULES });
      expect(deploy.code).toBe(0);
      const rows = (
        await sql.query(`SELECT state,routing_mode,one_step_reason FROM access_requests WHERE id=ANY($1::uuid[])`, [
          ids,
        ])
      ).rows;
      expect(rows).toHaveLength(3);
      for (const row of rows) expect(row).toMatchObject({ state: 'PENDING', routing_mode: 'ONE_STEP' });
      expect((await sql.query(`SELECT state,routing_mode FROM access_requests WHERE id=$1`, [open])).rows).toEqual([
        { state: 'AWAITING_SPEND_DECISION', routing_mode: 'ONE_STEP' },
      ]);
      expect(
        (
          await sql.query(
            `SELECT state,assignee_employee_id,waiting_reason,waiting_since FROM access_request_steps WHERE request_id=ANY($1::uuid[])`,
            [ids],
          )
        ).rows,
      ).toEqual(
        Array.from({ length: 3 }, () => ({
          state: 'NOT_REQUIRED',
          assignee_employee_id: null,
          waiting_reason: null,
          waiting_since: null,
        })),
      );
      expect((await sql.query(`SELECT 1 FROM request_budget_checks`)).rows).toHaveLength(0);
      await expect(
        sql.query(`UPDATE access_requests SET one_step_reason=NULL WHERE id=$1`, [ids[0]]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        sql.query(`UPDATE access_requests SET routing_mode='VIA_HEAD' WHERE id=$1`, [ids[0]]),
      ).rejects.toMatchObject({ code: '23514' });
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
  it(
    'BR-MF1-02 Q-24: paid Finance-returned rows preserve approved need history, groups confirm lines, and open spend is only marked',
    async () => {
      const seed = await startThrough(migrationBefore(VALUES));
      const returned = [];
      for (const row of [2, 8]) {
        const id = await paidLegacy(seed, row, 'AWAITING_SPEND_SUBMISSION');
        await approveLegacyNeed(seed, id);
        returned.push(id);
      }
      const group = await awaitingGroup(seed);
      const open = await paidLegacy(seed, 2, 'AWAITING_SPEND_DECISION', true);
      await approveLegacyNeed(seed, open);
      const kept = await sql.query(`SELECT * FROM approval_records ORDER BY id`);
      const approvedSteps = await sql.query(
        `SELECT * FROM access_request_steps WHERE request_id = ANY($1::uuid[]) ORDER BY id`,
        [[...returned, open]],
      );
      const deploy = await deployMigrations(database, { through: RULES });
      expect(deploy.code).toBe(0);

      expect((await sql.query(`SELECT * FROM approval_records ORDER BY id`)).rows).toEqual(kept.rows);
      expect(
        (
          await sql.query(`SELECT * FROM access_request_steps WHERE request_id = ANY($1::uuid[]) ORDER BY id`, [
            [...returned, open],
          ])
        ).rows,
      ).toEqual(approvedSteps.rows);
      expect(
        (
          await sql.query(
            `SELECT id, state, routing_mode, one_step_reason FROM access_requests WHERE id = ANY($1::uuid[]) ORDER BY id`,
            [returned],
          )
        ).rows,
      ).toEqual(
        returned.sort().map((id) => ({
          id,
          state: 'AWAITING_SPEND_SUBMISSION',
          routing_mode: 'ONE_STEP',
          one_step_reason: 'REQUESTER_IS_HEAD',
        })),
      );
      expect((await sql.query(`SELECT state, routing_mode FROM access_requests WHERE id = $1`, [open])).rows).toEqual([
        { state: 'AWAITING_SPEND_DECISION', routing_mode: 'ONE_STEP' },
      ]);
      expect((await sql.query(`SELECT state, routing_mode FROM access_requests WHERE id = $1`, [group])).rows).toEqual([
        { state: 'PENDING', routing_mode: 'ONE_STEP' },
      ]);
      expect((await sql.query(`SELECT state FROM access_request_lines WHERE request_id = $1`, [group])).rows).toEqual([
        { state: 'NEED_CONFIRMED' },
        { state: 'NEED_CONFIRMED' },
      ]);
      expect(
        (await sql.query(`SELECT state, assignee_employee_id FROM access_request_steps WHERE request_id = $1`, [group]))
          .rows,
      ).toEqual([{ state: 'NOT_REQUIRED', assignee_employee_id: null }]);
      expect((await sql.query(`SELECT 1 FROM request_budget_checks`)).rows).toHaveLength(0);
      // Compatibility keeps legacy true flags, but no new update can reintroduce a retired flag on the converted group.
      await expect(
        sql.query(`UPDATE access_request_steps SET same_person_as_spend = true WHERE request_id = $1`, [group]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        sql.query(`UPDATE access_request_steps SET no_independent_review = true WHERE request_id = $1`, [group]),
      ).rejects.toMatchObject({ code: '23514' });
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
  it(
    'BR-MF1-02 Q-24: row4 with recorded future successor is not marked',
    async () => {
      const seed = await startThrough(migrationBefore(VALUES), 'Etc/GMT+12');
      const id = await legacy(seed, 4);
      // Force the database calendar ahead of the organization's: CURRENT_DATE would consider this successor effective already.
      await sql.query(`ALTER DATABASE "${database.name.replaceAll('"', '""')}" SET timezone TO 'Pacific/Kiritimati'`);
      await sql.query(
        `INSERT INTO employee_placements (id,organization_id,employee_id,department_id,valid_from) VALUES ($1,$2,$3,$4,DATE '2020-01-01')`,
        [randomUUID(), seed.orgId, seed.empId, seed.deptId],
      );
      await sql.query(
        `INSERT INTO department_head_periods (id,organization_id,department_id,employee_id,valid_from)
         VALUES ($1,$2,$3,$4,(CURRENT_TIMESTAMP AT TIME ZONE 'Etc/GMT+12')::date+1)`,
        [randomUUID(), seed.orgId, seed.deptId, seed.empId],
      );
      expect((await deployMigrations(database, { through: RULES })).code).toBe(0);
      expect((await sql.query(`SELECT routing_mode,state FROM access_requests WHERE id=$1`, [id])).rows).toEqual([
        { routing_mode: 'VIA_HEAD', state: 'PENDING' },
      ]);
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  describe('finishing the rows the real upgrade marked', () => {
    let internal: string;
    let paid: string;
    let group: string;
    let history: unknown[];

    beforeAll(async () => {
      const seed = await startThrough(migrationBefore(VALUES));
      internal = await legacy(seed, 2);
      paid = await paidLegacy(seed, 8, 'AWAITING_SPEND_SUBMISSION');
      await approveLegacyNeed(seed, paid);
      await sql.query(
        `INSERT INTO access_request_beneficiaries (request_id, employee_id, position) VALUES ($1, $3, 1), ($2, $3, 1)`,
        [internal, paid, seed.empId],
      );
      group = await awaitingGroup(seed);
      history = (await sql.query(`SELECT * FROM approval_records ORDER BY id`)).rows;
      expect((await deployMigrations(database, { through: RULES })).code).toBe(0);
      runtime = await createHttpTestApp({ database });
    }, DEPLOY_TIMEOUT_MS * 2);

    it('BR-MF1-02 Q-24: finishes migrated K5 and paid/group rows, honors routing over policy v1 and does not repeat work', async () => {
      const app = runtime!.app;
      const requests = app.get(AccessRequestRepo, { strict: false });
      const conversion = app.get(OneStepConversionService, { strict: false });
      const ids = [internal, paid, group];
      for (const id of ids) {
        const row = (await sql.query(`SELECT policy FROM access_requests WHERE id = $1`, [id])).rows[0] as {
          policy: { version: number; chain: string[] };
        };
        const stored = row.policy;
        expect(stored.version).toBe(1);
        expect(stored.chain).toContain('NEED');
        expect((await requests.findById(id))?.policy.chain).not.toContain('NEED');
        expect(await conversion.finishPending(id, new Date())).toBe(true);
      }

      expect((await sql.query(`SELECT state FROM access_requests WHERE id = $1`, [internal])).rows).toEqual([
        { state: 'AWAITING_EXECUTION' },
      ]);
      expect(
        (
          await sql.query(`SELECT state, one_step_blocked_reason FROM access_requests WHERE id = ANY($1::uuid[])`, [
            [paid, group],
          ])
        ).rows,
      ).toEqual([
        { state: 'AWAITING_REQUESTER_REVISION', one_step_blocked_reason: 'PRICE_MISSING' },
        { state: 'AWAITING_REQUESTER_REVISION', one_step_blocked_reason: 'PRICE_MISSING' },
      ]);
      expect((await sql.query(`SELECT state FROM access_request_lines WHERE request_id = $1`, [group])).rows).toEqual([
        { state: 'NEED_CONFIRMED' },
        { state: 'NEED_CONFIRMED' },
      ]);
      expect((await sql.query(`SELECT * FROM approval_records ORDER BY id`)).rows).toEqual(history);
      expect(
        (await sql.query(`SELECT 1 FROM request_budget_checks WHERE request_id = ANY($1::uuid[])`, [ids])).rows,
      ).toEqual([]);
      expect(
        (
          await sql.query(
            `SELECT 1 FROM access_request_steps WHERE request_id = ANY($1::uuid[]) AND kind = 'SPEND_APPROVAL'`,
            [ids],
          )
        ).rows,
      ).toEqual([]);
      const events = (
        await sql.query(
          `SELECT action, resource_id FROM audit_events WHERE resource_id = ANY($1::text[]) ORDER BY id`,
          [ids],
        )
      ).rows;
      expect(events).toContainEqual({ action: 'ACCESS_REQUEST.NO_NEED_APPROVER', resource_id: internal });
      expect(events).toContainEqual({ action: 'ACCESS_REQUEST.ONE_STEP_PRICE_MISSING', resource_id: paid });
      expect(events).toContainEqual({ action: 'ACCESS_REQUEST.ONE_STEP_PRICE_MISSING', resource_id: group });
      for (const id of ids) expect(await conversion.finishPending(id, new Date())).toBe(false);
      expect(
        (
          await sql.query(
            `SELECT action, resource_id FROM audit_events WHERE resource_id = ANY($1::text[]) ORDER BY id`,
            [ids],
          )
        ).rows,
      ).toEqual(events);
    });
  });
});
