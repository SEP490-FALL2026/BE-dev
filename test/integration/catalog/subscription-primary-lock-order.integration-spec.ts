import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
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
  const { dataOf, today, plan, create, patch } = h;

  const BASE = {
    kind: 'TERM',
    purchasedQuantity: 5,
    unitPrice: { amount: '250000', currency: 'VND' },
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

  it('never deadlocks (0 x 40P01) across 20 concurrent addSeat on primary S and PATCH primary on P', async () => {
    const { planId } = await plan({ kind: 'SAAS', type: 'K2' });
    const subS = dataOf<PoolWire>(await create({ ...BASE, planId }).expect(201));
    const subP = dataOf<PoolWire>(await create({ ...BASE, planId }).expect(201));
    await patch(subS.id, { isPrimaryForPlan: true }).expect(200);

    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const catalog = h.ctx.app.get(CatalogApi, { strict: false });
    const actor: AuthenticatedPrincipal = {
      subject: h.it1.appUserId,
      appUserId: h.it1.appUserId,
      sessionId: 'test-session',
      employeeId: h.it1.employeeId,
      roles: ['IT_ADMIN'],
      directRoles: ['IT_ADMIN'],
    };

    let currentPrimary = subS.id;
    let candidate = subP.id;

    for (let i = 0; i < 20; i += 1) {
      const barrier = new Barrier(2);
      const addSeatTask = (async () => {
        await barrier.wait();
        return runner.run((tx) => catalog.incrementLegacyPoolSeat(tx, actor, currentPrimary, null));
      })();
      const makePrimaryTask = (async () => {
        await barrier.wait();
        return patch(candidate, { isPrimaryForPlan: true });
      })();

      const [seatOutcome, patchOutcome] = await Promise.allSettled([addSeatTask, makePrimaryTask]);
      expect(seatOutcome.status).toBe('fulfilled');
      if (seatOutcome.status === 'rejected') expect(isDeadlockError(seatOutcome.reason)).toBe(false);
      expect(patchOutcome.status).toBe('fulfilled');
      if (patchOutcome.status === 'fulfilled') {
        expect(patchOutcome.value.status).toBe(200);
        expect(patchOutcome.value.body).not.toMatchObject({ error: { code: '40P01' } });
      }
      [currentPrimary, candidate] = [candidate, currentPrimary];
    }
  });
});
