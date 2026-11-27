import request from 'supertest';
import { Barrier } from '../../support/concurrency-harness';
import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();

/**
 * The completion of the revocation of a seat of a subscription with lines and the record of the result of the renewal of the same
 * subscription write the same line and the same seats. Both take the period, then its lines, then the assignments (the order of
 * locks of `SPEC.md` §6.2: tier 6, 6c, 8), so run together behind a barrier 20 times they never wait for each other in a circle: no
 * `40P01`, no 500, and the end state is the one of either order, never a mix. Which of the two goes first in a round is not in the hands of the
 * test (the renewal was recorded in about one round of twenty), so each order is also run on its own, in the order the test fixes.
 */
describe('completing a revocation while the result of the renewal of the same subscription is recorded (integration, lock order)', () => {
  const year = () => ({ startDate: h.inDays(-300), endDate: h.inDays(64) });
  const nextYear = () => ({
    purchasedQuantity: 1,
    unitPrice: { amount: '1000000', currency: 'VND' },
    billingCycle: 'ANNUAL',
    startDate: h.inDays(65),
    endDate: h.inDays(429),
    noticeDeadline: h.inDays(400),
    autoRenew: true,
    allowsMidTermReduction: false,
  });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const startRevocation = async (unit: Awaited<ReturnType<typeof h.unit>>) => {
    const { subscriptionId, seats } = await h.termWithSeats(unit, 20, { quantity: 2, ...year() });
    const [leaving, staying] = seats;
    const { taskId } = await h.openRevocation(leaving);
    await request(h.server()).post(`/api/v1/provisioning-tasks/${taskId}/claim`).set(h.as(h.it1)).expect(200);

    return { subscriptionId, leaving, staying, taskId };
  };
  const complete = (taskId: string) =>
    request(h.server())
      .post(`/api/v1/provisioning-tasks/${taskId}/revocation-completion`)
      .set(h.as(h.it1))
      .send({ completion: 'ACCOUNT_REMOVED', evidence: 'account removed from the workspace' });
  const renew = (subscriptionId: string) =>
    h.propose({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 1,
      outcome: 'AS_DECIDED',
      nextPeriod: nextYear(),
    });

  it('revocation first: the seat is ended, then the renewal is recorded whole and carries only the seat that stays', async () => {
    const { subscriptionId, staying, taskId } = await startRevocation(await h.unit(2));

    expect((await complete(taskId)).status).toBe(200);
    const renewed = await renew(subscriptionId);

    expect(renewed.status).toBe(201);
    const carried = await h.ctx.sql.query<{ predecessor_id: string }>(
      `SELECT a.predecessor_id FROM license_assignments a JOIN subscriptions s ON s.id = a.subscription_id WHERE s.renewed_from_id = $1`,
      [subscriptionId],
    );
    expect(carried.rows).toEqual([{ predecessor_id: staying }]);
  }, 120000);

  it('renewal first: refused whole while the revocation is open, nothing written, and the revocation still completes', async () => {
    const { subscriptionId, leaving, taskId } = await startRevocation(await h.unit(2));

    const renewed = await renew(subscriptionId);

    expect(renewed.status).toBe(409);
    expect(h.codeOf(renewed)).toBe('SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED');
    expect(
      (await h.ctx.sql.query(`SELECT id FROM subscriptions WHERE renewed_from_id = $1`, [subscriptionId])).rows,
    ).toHaveLength(0);
    expect(
      (await h.ctx.sql.query(`SELECT id FROM subscription_renewals WHERE subscription_id = $1`, [subscriptionId])).rows,
    ).toHaveLength(0);
    expect((await complete(taskId)).status).toBe(200);
    const ended = await h.ctx.sql.query<{ valid_until: string | null }>(
      `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until FROM license_assignments WHERE id = $1`,
      [leaving],
    );
    expect(ended.rows[0].valid_until).toBe(h.today());
  }, 120000);

  it('20x barrier: the revocation always completes, the renewal is recorded whole or refused whole, and no round ends in 40P01', async () => {
    const unit = await h.unit(2);
    const recorded: boolean[] = [];

    for (let round = 0; round < 20; round += 1) {
      const { subscriptionId, seats } = await h.termWithSeats(unit, 20, { quantity: 2, ...year() });
      const [leaving, staying] = seats;
      const { taskId } = await h.openRevocation(leaving);
      await request(h.server()).post(`/api/v1/provisioning-tasks/${taskId}/claim`).set(h.as(h.it1)).expect(200);
      const barrier = new Barrier(2);

      const [revoked, renewed] = await Promise.all([
        (async () => {
          await barrier.wait();

          return request(h.server())
            .post(`/api/v1/provisioning-tasks/${taskId}/revocation-completion`)
            .set(h.as(h.it1))
            .send({ completion: 'ACCOUNT_REMOVED', evidence: 'account removed from the workspace' });
        })(),
        (async () => {
          await barrier.wait();

          return h.propose({
            subscriptionId,
            choice: 'REDUCE',
            proposedQuantity: 1,
            outcome: 'AS_DECIDED',
            nextPeriod: nextYear(),
          });
        })(),
      ]);

      expect(revoked.status).toBe(200);
      const ended = await h.ctx.sql.query<{ valid_until: string | null }>(
        `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until FROM license_assignments WHERE id = $1`,
        [leaving],
      );
      expect(ended.rows[0].valid_until).toBe(h.today());
      const next = await h.ctx.sql.query<{ id: string }>(`SELECT id FROM subscriptions WHERE renewed_from_id = $1`, [
        subscriptionId,
      ]);
      const cases = await h.ctx.sql.query(`SELECT id FROM subscription_renewals WHERE subscription_id = $1`, [
        subscriptionId,
      ]);
      if (renewed.status === 201) {
        recorded.push(true);
        expect(next.rows).toHaveLength(1);
        expect(cases.rows).toHaveLength(1);
        const carried = await h.ctx.sql.query<{ predecessor_id: string }>(
          `SELECT predecessor_id FROM license_assignments WHERE subscription_id = $1`,
          [next.rows[0].id],
        );
        expect(carried.rows).toEqual([{ predecessor_id: staying }]);
      } else {
        recorded.push(false);
        expect(renewed.status).toBe(409);
        expect(['SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED', 'SUBSCRIPTION_RENEWAL.SEATS_HAVE_OPEN_TASKS']).toContain(
          h.codeOf(renewed),
        );
        expect(next.rows).toHaveLength(0);
        expect(cases.rows).toHaveLength(0);
      }
    }
    expect(recorded).toHaveLength(20);
  }, 600000);
});
