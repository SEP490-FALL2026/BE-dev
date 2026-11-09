import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { stopCliProcesses } from '../../support/cli-process';
import { DisposableDatabase, dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import { DEPLOY_TIMEOUT_MS, deployMigrations, migrationBefore, migrationEndingWith } from '../../support/migration-history';
const VALUES = migrationEndingWith('_request_one_step_values');
const RULES = migrationEndingWith('_request_one_step');
interface Seed { orgId: string; deptId: string; costCenterId: string; empId: string; appUserId: string; planId: string }
describe('BR-MF1-02: one-step migration keeps history and marks old requests without checking budgets', () => {
  let database: DisposableDatabase;
  let sql: Client;
  afterEach(async () => { await sql?.end(); if (database) await dropDisposableDatabase(database); stopCliProcesses(); });
  async function startThrough(migration: string): Promise<Seed> {
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
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type)
       VALUES ($1, $2, $3, 'Internal Plan', 'internal plan', 'K5')`,
      [seed.planId, seed.orgId, appId],
    );

    return seed;
  }

  async function legacy(seed: Seed, row: number, state = 'PENDING', spend = false): Promise<string> {
    const id = randomUUID();
    await sql.query(`INSERT INTO access_requests (id, organization_id, branch, state, plan_id, requester_employee_id, department_id, cost_center_id, business_reason, policy, created_by_app_user_id, submitted_at)
      VALUES ($1,$2,'INTERNAL_FREE',$3::"AccessRequestState",$4,$5,$6,$7,'Legacy request','{"version":1,"branch":"INTERNAL_FREE","chain":["NEED","IT_EXECUTION"],"slaWorkingDays":2}',$8,now())`, [id,seed.orgId,state,seed.planId,seed.empId,seed.deptId,seed.costCenterId,seed.appUserId]);
    await sql.query(`INSERT INTO access_request_steps (id,request_id,kind,sequence,state,assignee_employee_id,routing_row,waiting_reason,sla_working_days,assigned_at)
      VALUES ($1,$2,'NEED',1,$3::"AccessRequestStepState",$4,$5,$6,2,$7)`, [randomUUID(),id,row===4?'WAITING':'PENDING',row===4?null:seed.empId,row,row===4?'NO_DEPARTMENT_HEAD':null,row===4?null:new Date()]);
    if (spend) await sql.query(`INSERT INTO access_request_steps (id,request_id,kind,sequence,state,assignee_employee_id,routing_row,sla_working_days,assigned_at) VALUES ($1,$2,'SPEND_APPROVAL',2,'PENDING',$3,9,2,now())`, [randomUUID(),id,seed.empId]);
    return id;
  }
  it('BR-MF1-02 Q-24: rows 2/4/8 are marked and request states are kept, including a request with an open spend step', async () => {
    const seed = await startThrough(migrationBefore(VALUES));
    const ids = [];
    for (const row of [2,4,8]) ids.push(await legacy(seed,row));
    const open = await legacy(seed,2,'AWAITING_SPEND_DECISION',true);
    const deploy = await deployMigrations(database, { through: RULES }); expect(deploy.code).toBe(0);
    const rows = (await sql.query(`SELECT state,routing_mode,one_step_reason FROM access_requests WHERE id=ANY($1::uuid[])`,[ids])).rows;
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toMatchObject({ state:'PENDING',routing_mode:'ONE_STEP' });
    expect((await sql.query(`SELECT state,routing_mode FROM access_requests WHERE id=$1`,[open])).rows).toEqual([{state:'AWAITING_SPEND_DECISION',routing_mode:'ONE_STEP'}]);
    expect((await sql.query(`SELECT state,assignee_employee_id,waiting_reason,waiting_since FROM access_request_steps WHERE request_id=ANY($1::uuid[])`,[ids])).rows).toEqual(Array.from({length:3},()=>({state:'NOT_REQUIRED',assignee_employee_id:null,waiting_reason:null,waiting_since:null})));
    expect((await sql.query(`SELECT 1 FROM request_budget_checks`)).rows).toHaveLength(0);
    await expect(sql.query(`UPDATE access_requests SET one_step_reason=NULL WHERE id=$1`,[ids[0]])).rejects.toMatchObject({code:'23514'});
    await expect(sql.query(`UPDATE access_requests SET routing_mode='VIA_HEAD' WHERE id=$1`,[ids[0]])).rejects.toMatchObject({code:'23514'});
  }, DEPLOY_TIMEOUT_MS * 2);
  it('BR-MF1-02 Q-24: row4 with recorded future successor is not marked', async () => {
    const seed = await startThrough(migrationBefore(VALUES));
    const id = await legacy(seed,4);
    await sql.query(`INSERT INTO employee_placements (id,organization_id,employee_id,department_id,valid_from) VALUES ($1,$2,$3,$4,DATE '2020-01-01')`,[randomUUID(),seed.orgId,seed.empId,seed.deptId]);
    await sql.query(`INSERT INTO department_head_periods (id,organization_id,department_id,employee_id,valid_from) VALUES ($1,$2,$3,$4,CURRENT_DATE+1)`,[randomUUID(),seed.orgId,seed.deptId,seed.empId]);
    expect((await deployMigrations(database,{through:RULES})).code).toBe(0);
    expect((await sql.query(`SELECT routing_mode,state FROM access_requests WHERE id=$1`,[id])).rows).toEqual([{routing_mode:'VIA_HEAD',state:'PENDING'}]);
  }, DEPLOY_TIMEOUT_MS * 2);
});
