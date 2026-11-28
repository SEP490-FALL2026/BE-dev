import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { SeatLedgerApi } from '../../../src/modules/catalog/public/seat-ledger.api';
import { Barrier } from '../../support/concurrency-harness';
import { SubscriptionHttpHarness, type SubscriptionWire } from '../../support/subscription-http-harness';

interface PoolWire extends SubscriptionWire {
  isPrimaryForPlan: boolean;
}

const isDeadlockError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === '40P01';
};

describe('Subscription primary change and pool seat addition lock order (integration, real PostgreSQL)', () => {
  const h = new SubscriptionHttpHarness();
  const { dataOf, today, plan, create, complete } = h;

  const BASE = {
    kind: 'TERM',
    purchasedQuantity: 5,
    unitPrice: { amount: '3000000', currency: 'VND' },
    monthlyUnitPrice: { amount: '250000', currency: 'VND' },
    billingCycle: 'ANNUAL',
    startDate: '2026-03-15',
    endDate: '2027-03-14',
  };

  beforeAll(async () => {
    await h.start();
  }, 120000);

  beforeEach(() => {
    today('2026-03-15');
  });

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  it('G-15: never deadlocks (0 x 40P01) across 20 concurrent addSeat on primary and complete renewal transferring primary', async () => {
    const { planId, vendorId } = await plan({ kind: 'SAAS', type: 'K2' });
    const subS = dataOf<PoolWire>(await create({ ...BASE, planId }).expect(201));
    await h.ctx.sql.query(`UPDATE subscriptions SET is_primary_for_plan = true WHERE id = $1`, [subS.id]);

    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const catalog = h.ctx.app.get(CatalogApi, { strict: false });
    const ledger = h.ctx.app.get(SeatLedgerApi, { strict: false });
    const actor: AuthenticatedPrincipal = {
      subject: h.it1.appUserId,
      appUserId: h.it1.appUserId,
      sessionId: 'test-session',
      employeeId: h.it1.employeeId,
      roles: ['IT_ADMIN'],
      directRoles: ['IT_ADMIN'],
    };

    let currentPrimary = subS.id;

    for (let i = 0; i < 20; i += 1) {
      const nextStart = addDays('2026-03-15', i + 1);
      const nextEnd = addDays('2027-03-14', i + 1);
      today(nextStart);

      const wsRes = await request(h.server())
        .post('/api/v1/workspaces')
        .set(h.as(h.it1))
        .send({ vendorId, name: h.unique('LockWs') })
        .expect(201);
      const workspaceId = dataOf<{ id: string }>(wsRes).id;

      const draftId = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO subscriptions (
           id, organization_id, plan_id, kind, status, renewed_from_id, workspace_id, purchased_quantity,
           unit_price_minor, unit_price_currency, monthly_unit_price_minor,
           price_recorded_on, price_rate, price_rate_date, price_rate_source,
           price_reporting_minor, price_reporting_currency, billing_cycle, commitment_term_months,
           start_date, end_date, responsible_it_admin_employee_id
         ) VALUES (
           $1, $2, $3, 'TERM', 'DRAFT', $4, $5, 5,
           3000000, 'VND', 250000,
           $7::date, 1, $7::date, 'SAME_CURRENCY',
           3000000, 'VND', 'ANNUAL', 12,
           $7::date, $8::date, $6
         )`,
        [draftId, h.seed.organizationId, planId, currentPrimary, workspaceId, h.it1.employeeId, nextStart, nextEnd],
      );

      const barrier = new Barrier(2);
      const addSeatTask = (async () => {
        await barrier.wait();
        return runner.run(async (tx) => {
          const target = await catalog.lockSeatTarget(tx, { subscriptionId: currentPrimary });
          if (!target?.subscriptionLineId) throw new Error('Expected active K2 subscription line');
          return ledger.recordVendor(tx, target.subscriptionLineId, {
            delta: 1,
            effectiveOn: nextStart,
            note: 'Primary lock order verification',
            actor,
            alreadyLocked: true,
            today: nextStart,
          });
        });
      })();
      const completeRenewalTask = (async () => {
        await barrier.wait();
        return complete(draftId);
      })();

      const [seatOutcome, completeOutcome] = await Promise.allSettled([addSeatTask, completeRenewalTask]);
      expect(seatOutcome.status).toBe('fulfilled');
      if (seatOutcome.status === 'rejected') expect(isDeadlockError(seatOutcome.reason)).toBe(false);
      expect(completeOutcome.status).toBe('fulfilled');
      if (completeOutcome.status === 'fulfilled') {
        expect(completeOutcome.value.status).toBe(200);
        expect(completeOutcome.value.body).not.toMatchObject({ error: { code: '40P01' } });
      }
      currentPrimary = draftId;
    }
  });
});
