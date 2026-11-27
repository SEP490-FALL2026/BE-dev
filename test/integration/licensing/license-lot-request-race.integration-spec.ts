import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { Barrier } from '../../support/concurrency-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;

/**
 * FIX-W3 W-7: `LicenseLotCreateService.create` (purpose = REQUEST) locks the open grant task (`tier 3a`) in the same
 * transaction as acting-IT-Admin check (`5b`) and `createLot` (`6a`/`7`), matching the lock order of request cancellation
 * (`lockGrantOfRequest` tier `3a` -> `access_requests` tier `4`). Concurrent cancel || `POST /license-lots` never
 * deadlocks (`40P01`), and a cancelled request refuses `REQUEST` lot creation with `422 LICENSE_LOT.REQUEST_REQUIRED`.
 */
describe('REQUEST license-lot creation vs request cancellation race (integration, real PostgreSQL)', () => {
  let k4PlanId: string;
  let unit: Unit;
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const k4SubId = await h.subscription(1, 'K4');
    k4PlanId = await h.planOf(k4SubId);
    unit = await h.departmentWithHead('P-W7R');
    await h.budgetFor(unit, { total: 5000 * M, held: 0, spent: 0 });
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  async function openK4GrantForTerminatedWorker(): Promise<string> {
    seq += 1;
    const employee = await h.worker(unit.department, `W7R-E${seq}`);
    const sent = await h.sent(employee, k4PlanId, {});
    await h.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
    await h.setPayments(sent.id, { amount: 12 * M });
    await h.sendOn([sent.id], unit.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    await h.grant({ requestId: sent.id, purchase: { reason: 'Buy K4 key for request' } }).expect(201);
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [employee.employeeId]);

    return sent.id;
  }

  const cancelRequest = (requestId: string) =>
    request(h.server())
      .post(`/api/v1/access-requests/${requestId}/cancellation`)
      .set(h.as(h.it1))
      .send({ cause: 'BENEFICIARY_LEFT', evidence: 'Stopped open grant on departure' });

  const createRequestLot = (requestId: string) =>
    request(h.server())
      .post('/api/v1/license-lots')
      .set(h.as(h.it1))
      .send({
        planId: k4PlanId,
        purchasedOn: h.today(),
        licenseCount: 1,
        unitPrice: { amount: '12000000', currency: 'VND' },
        purpose: 'REQUEST',
        requestId,
      });

  const lotCountOfRequest = async (requestId: string): Promise<number> =>
    (await h.ctx.sql.query(`SELECT 1 FROM license_lots WHERE request_id = $1`, [requestId])).rowCount ?? 0;

  it('rejects POST /license-lots with 422 LICENSE_LOT.REQUEST_REQUIRED when cancellation completes first under lock', async () => {
    const requestId = await openK4GrantForTerminatedWorker();
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT id FROM provisioning_tasks WHERE request_id = $1 FOR UPDATE`, [requestId]);

      const cancelling = cancelRequest(requestId).then((res) => res);
      await waitForLockWaiters(h.ctx.sql, 1);
      const creating = createRequestLot(requestId).then((res) => res);
      await waitForLockWaiters(h.ctx.sql, 2);

      await holder.query('COMMIT');
      const [cancelRes, lotRes] = await Promise.all([cancelling, creating]);

      expect(cancelRes.status).toBe(200);
      expect(lotRes.status).toBe(422);
      expect(h.codeOf(lotRes)).toBe('LICENSE_LOT.REQUEST_REQUIRED');
      expect(await lotCountOfRequest(requestId)).toBe(0);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
    }
  });

  it('barrier x20: cancel Request || POST /license-lots REQUEST across 2 connections produces zero 40P01 deadlocks', async () => {
    for (let i = 0; i < 20; i += 1) {
      const requestId = await openK4GrantForTerminatedWorker();
      const barrier = new Barrier(2);

      const cancelling = (async () => {
        await barrier.wait();
        return cancelRequest(requestId);
      })();
      const creating = (async () => {
        await barrier.wait();
        return createRequestLot(requestId);
      })();

      const [cancelRes, lotRes] = await Promise.all([cancelling, creating]);

      expect(cancelRes.status).toBe(200);
      expect([201, 422]).toContain(lotRes.status);
      expect(lotRes.status).not.toBe(500);
      expect(lotRes.status).not.toBe(503);
      if (lotRes.status === 422) {
        expect(h.codeOf(lotRes)).toBe('LICENSE_LOT.REQUEST_REQUIRED');
        expect(await lotCountOfRequest(requestId)).toBe(0);
      } else {
        expect(await lotCountOfRequest(requestId)).toBe(1);
      }
    }
  });

  async function seedApprovedGroupAndLot(): Promise<string> {
    seq += 1;
    const reqC = randomUUID();
    const emp1 = await h.worker(unit.department, `F17-C1-${seq}`);
    const emp2 = await h.worker(unit.department, `F17-C2-${seq}`);
    const members = [emp1.employeeId, emp2.employeeId];
    const needStepId = randomUUID();
    const spendStepId = randomUUID();
    const checkId = randomUUID();
    const policyJson = JSON.stringify({
      version: 1,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL'],
      slaWorkingDays: 3,
    });
    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, type, branch, state, plan_id, department_id, cost_center_id,
          requester_employee_id, business_reason, submitted_at, budget_year, amount_months,
          amount_currency, unit_price_minor, monthly_price_minor, amount_minor, billing_cycle, pricing_status, policy, created_by_app_user_id)
       VALUES ($1, $2, 'GROUP_GRANT', 'PAID_IN_CATALOG', 'AWAITING_EXECUTION', $3, $4, $5, $6,
               'F17 barrier lot test', now(), $7, 1, 'VND', 12000000, 12000000, 24000000, 'ANNUAL', 'PRICED', $8::jsonb, $9)`,
      [
        reqC,
        h.seed.organizationId,
        k4PlanId,
        unit.department.id,
        unit.department.unitId,
        unit.head.employeeId,
        h.year,
        policyJson,
        unit.head.account.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO access_request_steps
         (id, request_id, kind, sequence, state, assignee_employee_id, routing_row, sla_working_days, assigned_at, decided_at)
       VALUES ($1, $2, 'NEED', 1, 'APPROVED', $3, 1, 3, now(), now()),
              ($4, $2, 'SPEND_APPROVAL', 2, 'APPROVED', $5, 1, 3, now(), now())`,
      [needStepId, reqC, unit.head.employeeId, spendStepId, h.boss.employeeId],
    );
    await h.ctx.sql.query(
      `INSERT INTO request_budget_checks
         (id, organization_id, request_id, number, trigger, route, outcome, stale_cost_evidence,
          plan_line_overdue, period_closed, off_plan, currency, binding_total_minor, ran_by_employee_id)
       VALUES ($1, $2, $3, 1, 'SUBMISSION', 'SPEND_APPROVAL', 'WITHIN_BASE'::"BudgetCheckOutcome",
               false, false, false, false, 'VND', 24000000, $4)`,
      [checkId, h.seed.organizationId, reqC, h.boss.employeeId],
    );
    await h.ctx.sql.query(
      `INSERT INTO spend_decisions (step_id, request_id, check_id, decision, decided_by_employee_id, decided_at)
       VALUES ($1, $2, $3, 'APPROVED', $4, now())`,
      [spendStepId, reqC, checkId, h.boss.employeeId],
    );
    for (let idx = 0; idx < members.length; idx += 1) {
      await h.ctx.sql.query(
        `WITH b AS (
           INSERT INTO access_request_beneficiaries (request_id, employee_id, position)
           VALUES ($1, $2, $3)
           RETURNING request_id, employee_id
         )
         INSERT INTO access_request_lines (request_id, employee_id, state, need_step_id)
         SELECT request_id, employee_id, 'NEED_CONFIRMED', $4 FROM b`,
        [reqC, members[idx], idx + 1, needStepId],
      );
      await h.ctx.sql.query(
        `UPDATE access_request_lines SET state = 'APPROVED' WHERE request_id = $1 AND employee_id = $2`,
        [reqC, members[idx]],
      );
      await h.ctx.sql.query(
        `INSERT INTO access_request_line_amounts (request_id, employee_id, budget_year, amount_minor, currency, held)
         VALUES ($1, $2, $3, 12000000, 'VND', true)`,
        [reqC, members[idx], h.year],
      );
    }
    await h.ctx.sql.query(
      `INSERT INTO budget_commitments
         (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, origin, unattached_reason)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 24000000, 'VND', 'HELD', 'APPROVAL', 'NO_BUDGET')`,
      [h.seed.organizationId, reqC, unit.department.unitId, h.year],
    );

    await h
      .grant({ requestId: reqC, beneficiaryEmployeeId: emp1.employeeId, purchase: { reason: 'Buy lotC for ReqC' } })
      .expect(201);

    const lotCId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/license-lots')
        .set(h.as(h.it1))
        .send({
          planId: k4PlanId,
          purchasedOn: h.today(),
          licenseCount: 3,
          unitPrice: { amount: '12000000', currency: 'VND' },
          purpose: 'REQUEST',
          requestId: reqC,
        })
        .expect(201),
    ).id;
    await request(h.server())
      .post(`/api/v1/license-lots/${lotCId}/keys`)
      .set(h.as(h.it1))
      .send({ keys: [`F17-${seq}-001-ABCDE-12345`, `F17-${seq}-002-ABCDE-12345`, `F17-${seq}-003-ABCDE-12345`] })
      .expect(201);

    return lotCId;
  }

  async function approvedSingleRequest(tag: string): Promise<string> {
    const emp = await h.worker(unit.department, tag);
    const sent = await h.sent(emp, k4PlanId, {});
    await h.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
    await h.setPayments(sent.id, { amount: 12 * M });
    await h.sendOn([sent.id], unit.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  }

  const completeGrant = (taskId: string, licenseKeyId: string) =>
    request(h.server())
      .post(`/api/v1/provisioning-tasks/${taskId}/complete`)
      .set(h.as(h.it1))
      .send({ evidence: 'Assigned key for grant', licenseKeyId });

  it('H-8 / F11 barrier x20: two key completions competing for 1 excess slot on K4 REQUEST lot -> [200, 409] LICENSE_LOT.RESERVED_FOR_REQUEST', async () => {
    for (let i = 0; i < 20; i += 1) {
      const lotCId = await seedApprovedGroupAndLot();
      const [reqA, reqB] = await Promise.all([
        approvedSingleRequest(`F17-A-${i}`),
        approvedSingleRequest(`F17-B-${i}`),
      ]);
      const grantA = await h.grant({ requestId: reqA, subscriptionId: lotCId }).expect(201);
      const grantB = await h.grant({ requestId: reqB, subscriptionId: lotCId }).expect(201);
      const taskAId = h.dataOf<{ task: { id: string } }>(grantA).task.id;
      const taskBId = h.dataOf<{ task: { id: string } }>(grantB).task.id;
      const keyRows = await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM license_keys WHERE license_lot_id = $1 ORDER BY id LIMIT 2`,
        [lotCId],
      );
      const [key1, key2] = keyRows.rows.map((r) => r.id);
      const barrier = new Barrier(2);

      const resA = (async () => {
        await barrier.wait();
        return completeGrant(taskAId, key1);
      })();
      const resB = (async () => {
        await barrier.wait();
        return completeGrant(taskBId, key2);
      })();

      const outcomes = await Promise.all([resA, resB]);
      const statuses = outcomes.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);
      const refused = outcomes.find((r) => r.status === 409);
      expect(refused).toBeDefined();
      expect(h.codeOf(refused!)).toBe('LICENSE_LOT.RESERVED_FOR_REQUEST');
    }
  });

  it('H-8 / F11 post-charge: refuses POST /provisioning-tasks with 409 LICENSE_LOT.RESERVED_FOR_REQUEST once excess charge is recorded', async () => {
    const lotCId = await seedApprovedGroupAndLot();
    const [reqA, reqD] = await Promise.all([approvedSingleRequest('F17-POST-A'), approvedSingleRequest('F17-POST-D')]);
    const grantA = await h.grant({ requestId: reqA, subscriptionId: lotCId }).expect(201);
    const taskAId = h.dataOf<{ task: { id: string } }>(grantA).task.id;
    const keyRows = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM license_keys WHERE license_lot_id = $1 ORDER BY id LIMIT 1`,
      [lotCId],
    );
    await completeGrant(taskAId, keyRows.rows[0].id).expect(200);

    const refused = await h.grant({ requestId: reqD, subscriptionId: lotCId });
    expect(refused.status).toBe(409);
    expect(h.codeOf(refused)).toBe('LICENSE_LOT.RESERVED_FOR_REQUEST');
  });
});
