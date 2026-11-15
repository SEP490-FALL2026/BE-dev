import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SubscriptionPeriodApi } from '../../../src/modules/catalog/public/subscription-period.api';
import { principalOf } from '../../support/builders/account.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';
import { takeOwnerOff } from '../../support/shared-pool-subscription';

const h = new SeatHarness();

/**
 * The subscriptions whose payment days an invoice follows (`PI-2`, `QĐ-111x`), through the facade the invoices of `requests` read them by, on
 * real PostgreSQL: the ones that run a period and are paid by a cycle from a start day, whether a department owns them or the shared pool
 * does (`PI-1c`: every IT Admin submits the invoice of a pool subscription), and nothing of the rest.
 */
describe('the payment schedules of the subscriptions that run a period (PI-2, PI-1c)', () => {
  let other: string;
  const api = () => h.ctx.app.get(SubscriptionPeriodApi, { strict: false });
  const idsOf = async (departmentIds: readonly string[] | null) =>
    new Set((await api().listPaymentSchedules(departmentIds)).map((schedule) => schedule.subscriptionId));

  beforeAll(async () => {
    await h.start();
    other = (await h.bareDepartment()).id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('gives the cycle and the days a payment follows, and when the system came to know the subscription', async () => {
    const owned = await h.subscription(10, 'K2', h.seed.departmentId);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET end_date = '2027-01-04', renewal_date = '2026-12-05', auto_renew = true WHERE id = $1`,
      [owned],
    );

    const schedule = (await api().listPaymentSchedules([h.seed.departmentId])).find(
      (row) => row.subscriptionId === owned,
    );

    expect(schedule).toMatchObject({
      subscriptionId: owned,
      ownerDepartmentId: h.seed.departmentId,
      billingCycle: 'MONTHLY',
      startDate: '2026-01-05',
      endDate: '2027-01-04',
      renewalDate: '2026-12-05',
      autoRenew: true,
    });
    expect(schedule?.recordedAt).toBeInstanceOf(Date);
  });

  it('leaves out a draft, a purchase made once, a period that a later one continues, a cycle with no payment day', async () => {
    const kept = await h.subscription(10, 'K2', h.seed.departmentId);
    const draft = await h.draftSubscription('K2');
    const once = await h.subscription(5, 'K4', h.seed.departmentId);
    const continued = await h.subscription(10, 'K2', h.seed.departmentId);
    // The period that follows, recorded the way a renewal outcome records it: the one it continues is no longer the period that runs.
    const next = (
      await h.ctx.app.get(TransactionRunner).run(async (tx) =>
        h.ctx.app.get(SubscriptionPeriodApi).recordNextPeriod(tx, await principalOf(h.ctx, h.it1.accessToken), {
          previousSubscriptionId: continued,
          purchasedQuantity: 10,
          unitPrice: { amount: '1000000', currency: 'VND' },
          billingCycle: 'MONTHLY',
          startDate: '2026-03-05',
          autoRenew: true,
          allowsMidTermReduction: false,
        }),
      )
    ).subscriptionId;
    const odd = await h.subscription(10, 'K2', h.seed.departmentId);
    await h.ctx.sql.query(`UPDATE subscriptions SET billing_cycle = 'OTHER' WHERE id = $1`, [odd]);

    const everyone = await idsOf(null);

    expect(everyone.has(kept)).toBe(true);
    expect(everyone.has(next)).toBe(true);
    for (const left of [draft, once, continued, odd]) expect(everyone.has(left)).toBe(false);
  });

  it('reads the departments it is given, and every owner for null', async () => {
    const mine = await h.subscription(10, 'K2', h.seed.departmentId);
    const theirs = await h.subscription(10, 'K2', other);

    const ofMine = await idsOf([h.seed.departmentId]);
    const ofOther = await idsOf([other]);
    const both = await idsOf(null);

    expect(ofMine.has(mine)).toBe(true);
    expect(ofMine.has(theirs)).toBe(false);
    expect(ofOther.has(theirs)).toBe(true);
    expect(ofOther.has(mine)).toBe(false);
    expect(both.has(mine) && both.has(theirs)).toBe(true);
  });

  it('gives a subscription of the shared pool to every scope, with no owner: a department list, an empty list and every owner', async () => {
    const pool = await takeOwnerOff(h, await h.subscription(10, 'K2', h.seed.departmentId));
    const mine = await h.subscription(10, 'K2', h.seed.departmentId);

    const schedule = (await api().listPaymentSchedules([other])).find((row) => row.subscriptionId === pool);

    expect(schedule).toMatchObject({ subscriptionId: pool, ownerDepartmentId: null, billingCycle: 'MONTHLY' });
    expect((await idsOf([])).has(pool)).toBe(true);
    expect((await idsOf([other])).has(pool)).toBe(true);
    expect((await idsOf(null)).has(pool)).toBe(true);
    // A subscription a department owns is still read by that department only: an empty list reads none of them.
    expect((await idsOf([])).has(mine)).toBe(false);
    expect((await idsOf([other])).has(mine)).toBe(false);
  });
});
