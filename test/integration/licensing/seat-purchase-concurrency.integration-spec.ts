import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SeatLedgerApi } from '../../../src/modules/catalog/public/seat-ledger.api';
import { Barrier } from '../../support/concurrency-harness';
import { pretendBusinessToday } from '../../support/pretend-today';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

const isDeadlockError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } };

  return record.code === '40P01' || record.meta?.driverAdapterError?.cause?.originalCode === '40P01';
};

async function createOpenedLine(input: {
  subscriptionId: string;
  effectiveOn: string;
  quantity: number;
  monthlyUnitPriceMinor: number;
}): Promise<string> {
  const { rows } = await h.ctx.sql.query<{
    organization_id: string;
    workspace_id: string;
    plan_id: string;
  }>(`SELECT organization_id, workspace_id, plan_id FROM subscriptions WHERE id = $1`, [input.subscriptionId]);
  const sub = rows[0];
  const lineId = randomUUID();
  await h.ctx.sql.query(
    `INSERT INTO subscription_lines (
       id, organization_id, subscription_id, workspace_id, plan_id,
       monthly_unit_price_minor, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [lineId, sub.organization_id, input.subscriptionId, sub.workspace_id, sub.plan_id, input.monthlyUnitPriceMinor],
  );
  const ledger = h.ctx.app.get(SeatLedgerApi, { strict: false });
  const runner = h.ctx.app.get(TransactionRunner);
  await runner.run((tx) =>
    ledger.openLines(tx, { lines: [{ lineId, quantity: input.quantity, effectiveOn: input.effectiveOn }] }),
  );

  return lineId;
}

async function seedPendingK2GrantItem(
  planId: string,
  employeeId: string,
): Promise<{ requestId: string; taskId: string }> {
  const requestId = h.gate.grantable(employeeId, planId);
  const assignmentId = randomUUID();
  const taskId = randomUUID();
  const { rows } = await h.ctx.sql.query<{ organization_id: string; app_user_id: string }>(
    `SELECT e.organization_id, u.id AS app_user_id
       FROM employees e
       JOIN app_users u ON u.employee_id = e.id
      WHERE e.id = $1`,
    [h.it1],
  );
  const meta = rows[0];
  await h.ctx.sql.query(
    `INSERT INTO license_assignments (
       id, organization_id, kind, source, plan_id, employee_id,
       account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id
     ) VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $5, current_date, 'ACTUAL', $6)`,
    [assignmentId, meta.organization_id, planId, employeeId, `${employeeId}@example.test`, meta.app_user_id],
  );
  await h.ctx.sql.query(
    `INSERT INTO provisioning_tasks (
       id, organization_id, assignment_id, kind, channel, status, request_id,
       created_by_app_user_id, max_attempts
     ) VALUES ($1, $2, $3, 'GRANT', 'MANUAL', 'QUEUED', $4, $5, 3)`,
    [taskId, meta.organization_id, assignmentId, requestId, meta.app_user_id],
  );

  return { requestId, taskId };
}

/**
 * `W3-18` (real PostgreSQL):
 * 20x barrier concurrency with 2 purchases targeting the same `subscription_line` (`period FOR UPDATE` -> `line FOR UPDATE`)
 * never produces PostgreSQL deadlock (`40P01`).
 */
describe('Seat purchase concurrency (integration, real PostgreSQL, W3-18)', () => {
  const people: string[] = [];
  const nextPerson = (): string => {
    const id = people.shift();
    if (!id) throw new Error('Ran out of test employees');

    return id;
  };

  beforeAll(async () => {
    await h.start();
    for (let i = 0; i < 60; i += 1) {
      people.push(await h.person(`E-SPC-${i}`));
    }
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('20x barrier: 2 concurrent POST /subscription-lines/:id/purchases on same line never hit 40P01', async () => {
    const today = '2026-11-21';
    pretendBusinessToday(h.ctx.app, today);

    const subId = await h.subscription(0, 'K2');
    const planId = await h.planOf(subId);
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET start_date = '2026-07-01'::date,
              end_date = '2027-06-30'::date,
              renewal_date = '2027-07-01'::date,
              billing_cycle = 'ANNUAL'::"BillingCycle",
              seat_counting = 'FIXED'::"SeatCounting",
              monthly_unit_price_minor = 500000
        WHERE id = $1`,
      [subId],
    );
    const lineId = await createOpenedLine({
      subscriptionId: subId,
      effectiveOn: '2026-07-01',
      quantity: 0,
      monthlyUnitPriceMinor: 500000,
    });

    for (let round = 0; round < 20; round += 1) {
      const empA = nextPerson();
      const empB = nextPerson();
      const itemA = await seedPendingK2GrantItem(planId, empA);
      const itemB = await seedPendingK2GrantItem(planId, empB);

      const barrier = new Barrier(2);
      const postPurchase = async (item: { requestId: string; beneficiaryEmployeeId: string; taskId: string }) => {
        await barrier.wait();
        return request(h.server())
          .post(`/api/v1/subscription-lines/${lineId}/purchases`)
          .set(h.as(h.it1))
          .send({ purchasedOn: today, items: [item] });
      };

      const [resA, resB] = await Promise.allSettled([
        postPurchase({ requestId: itemA.requestId, beneficiaryEmployeeId: empA, taskId: itemA.taskId }),
        postPurchase({ requestId: itemB.requestId, beneficiaryEmployeeId: empB, taskId: itemB.taskId }),
      ]);

      expect(resA.status).toBe('fulfilled');
      if (resA.status === 'rejected') expect(isDeadlockError(resA.reason)).toBe(false);
      expect(resB.status).toBe('fulfilled');
      if (resB.status === 'rejected') expect(isDeadlockError(resB.reason)).toBe(false);
    }
  });
});
