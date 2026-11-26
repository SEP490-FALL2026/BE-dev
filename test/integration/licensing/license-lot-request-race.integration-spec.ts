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
    await h.budgetFor(unit, { total: 500 * M, held: 0, spent: 0 });
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
});
