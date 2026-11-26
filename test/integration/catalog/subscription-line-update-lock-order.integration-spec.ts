import request from 'supertest';
import { Barrier } from '../../support/concurrency-harness';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

const isDeadlockError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as {
    code?: unknown;
    status?: number;
    body?: { error?: { code?: unknown } };
    meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } };
  };

  return (
    record.code === '40P01' ||
    record.body?.error?.code === '40P01' ||
    record.meta?.driverAdapterError?.cause?.originalCode === '40P01'
  );
};

/**
 * F-4: `subscriptionLineUpdate` locks period (6) before line (6c), matching seat grant (`SeatTargetService.lock`: 6 -> 6c -> 7),
 * so 20 concurrent barrier rounds produce zero PostgreSQL 40P01 deadlocks.
 */
describe('Subscription line update vs seat grant lock order (integration, real PostgreSQL)', () => {
  const people: string[] = [];

  beforeAll(async () => {
    await h.start();
    for (let i = 0; i < 20; i += 1) {
      people.push(await h.person(`E-F4-${i}`));
    }
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('20x barrier: PATCH /subscription-lines/:id concurrent with seat grant never produces 40P01', async () => {
    const subscriptionId = await h.subscription(25, 'K2');
    const planId = await h.planOf(subscriptionId);
    const lineRow = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM subscription_lines WHERE subscription_id = $1 AND plan_id = $2`,
        [subscriptionId, planId],
      )
    ).rows[0];
    expect(lineRow).toBeDefined();

    for (let round = 0; round < 20; round += 1) {
      const { rows } = await h.ctx.sql.query<{ updated_at: Date }>(
        `SELECT updated_at FROM subscription_lines WHERE id = $1`,
        [lineRow.id],
      );
      const expectedUpdatedAt = rows[0].updated_at.toISOString();
      const requestId = h.gate.grantable(people[round], planId);
      const barrier = new Barrier(2);

      const updateTask = (async () => {
        await barrier.wait();

        return request(h.server())
          .patch(`/api/v1/subscription-lines/${lineRow.id}`)
          .set(h.as(h.it1))
          .send({
            monthlyUnitPrice: { amount: String(510_000 + round * 1_000), currency: 'VND' },
            expectedUpdatedAt,
          });
      })();

      const grantTask = (async () => {
        await barrier.wait();

        return h.grant({ requestId, subscriptionId });
      })();

      const [updateRes, grantRes] = await Promise.all([updateTask, grantTask]);
      expect(isDeadlockError(updateRes) || isDeadlockError(grantRes)).toBe(false);
      expect(updateRes.status).toBe(200);
      expect(grantRes.status).toBe(201);
    }
  });
});
