import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SubscriptionPeriodApi } from '../../../src/modules/catalog/public/subscription-period.api';
import { principalOf } from '../../support/builders/account.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * X-IT-R4 (`QĐ-110k`, `QĐ-110u`, D-111), real PostgreSQL: the gate `SUBSCRIPTION.VENDOR_ADMINS_REQUIRED` is for a subscription that is activated new (or a
 * pool that is made new), never for the period a renewal continues: an old K2 subscription whose plan has no workspace profile is renewed the same way
 * whether the period is written active or goes through a draft (`complete`, or a `PATCH` that makes it whole), and still reads with the flag.
 */
describe('the vendor admins gate and the renewal of a period (integration, real PostgreSQL)', () => {
  let runner: TransactionRunner;

  /** An active K2 subscription of a new plan whose plan has no workspace profile: a subscription older than the rule. */
  const oldWithoutProfile = async (): Promise<{ id: string; planId: string }> => {
    const id = await h.subscription(10, 'K2');
    const planId = (await h.ctx.sql.query<{ plan_id: string }>('SELECT plan_id FROM subscriptions WHERE id = $1', [id]))
      .rows[0].plan_id;
    await h.ctx.sql.query('DELETE FROM plan_workspace_admins WHERE plan_id = $1', [planId]);
    await h.ctx.sql.query('DELETE FROM plan_workspace_profiles WHERE plan_id = $1', [planId]);

    return { id, planId };
  };
  /** The period that follows, recorded the way a renewal outcome records it; returns its id. */
  const renew = async (previousSubscriptionId: string): Promise<string> => {
    const actor = await principalOf(h.ctx, h.it1.accessToken);
    const created = await runner.run((tx) =>
      h.ctx.app.get(SubscriptionPeriodApi).recordNextPeriod(tx, actor, {
        previousSubscriptionId,
        purchasedQuantity: 10,
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: '2026-03-05',
        autoRenew: true,
        allowsMidTermReduction: false,
      }),
    );

    return created.subscriptionId;
  };
  const statusOf = async (id: string): Promise<string> =>
    (await h.ctx.sql.query<{ status: string }>('SELECT status FROM subscriptions WHERE id = $1', [id])).rows[0].status;
  /** The period the renewal wrote, put back to a draft with every datum it has: what `complete` and a `PATCH` then judge. */
  const asDraft = (id: string) => h.ctx.sql.query(`UPDATE subscriptions SET status = 'DRAFT' WHERE id = $1`, [id]);

  beforeAll(async () => {
    await h.start();
    runner = h.ctx.app.get(TransactionRunner);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('records the period of a renewal active with no profile on the plan, and reads it with the flag', async () => {
    const old = await oldWithoutProfile();

    const next = await renew(old.id);

    expect(await statusOf(next)).toBe('ACTIVE');
    const read = h.dataOf<{ vendorAdminsBelowMinimum: boolean }>(
      await request(h.server()).get(`/api/v1/subscriptions/${next}`).set(h.as(h.it1)).expect(200),
    );
    expect(read.vendorAdminsBelowMinimum).toBe(true);
  });

  it('completes a draft period of a renewal with no profile on the plan: 200, active', async () => {
    const old = await oldWithoutProfile();
    const next = await renew(old.id);
    await asDraft(next);

    const completed = await request(h.server())
      .post(`/api/v1/subscriptions/${next}/completions`)
      .set(h.as(h.it1))
      .send({})
      .expect(200);

    expect(h.dataOf<{ status: string }>(completed).status).toBe('ACTIVE');
  });

  it('makes a draft period of a renewal active by a PATCH with no profile on the plan: 200, active', async () => {
    const old = await oldWithoutProfile();
    const next = await renew(old.id);
    await asDraft(next);

    const patched = await request(h.server())
      .patch(`/api/v1/subscriptions/${next}`)
      .set(h.as(h.it1))
      .send({ autoRenew: false })
      .expect(200);

    expect(h.dataOf<{ status: string }>(patched).status).toBe('ACTIVE');
  });

  it('still refuses a NEW subscription of such a plan, by the declaration and by the completion of a draft that is not a renewal', async () => {
    const old = await oldWithoutProfile();
    const body = {
      planId: old.planId,
      kind: 'TERM',
      unitPrice: { amount: '1000000', currency: 'VND' },
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 1,
      startDate: '2026-04-05',
      purchasedQuantity: 3,
      ownerDepartmentId: h.seed.departmentId,
      responsibleItAdminEmployeeId: h.it1.employeeId,
    };

    const declared = await request(h.server()).post('/api/v1/subscriptions').set(h.as(h.it1)).send(body).expect(422);
    expect(h.codeOf(declared)).toBe('SUBSCRIPTION.VENDOR_ADMINS_REQUIRED');

    // The same data as a draft (no price), completed once the price is given: the completion is the activation of a new subscription.
    const { unitPrice, ...noPrice } = body;
    const draft = h.dataOf<{ id: string; status: string }>(
      await request(h.server()).post('/api/v1/subscriptions').set(h.as(h.it1)).send(noPrice).expect(201),
    );
    expect(draft.status).toBe('DRAFT');
    await request(h.server())
      .patch(`/api/v1/subscriptions/${draft.id}`)
      .set(h.as(h.it1))
      .send({ unitPrice })
      .expect(422)
      .expect((response) => expect(h.codeOf(response)).toBe('SUBSCRIPTION.VENDOR_ADMINS_REQUIRED'));
  });
});
