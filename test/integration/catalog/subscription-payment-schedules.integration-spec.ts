import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SubscriptionPeriodApi } from '../../../src/modules/catalog/public/subscription-period.api';
import { principalOf } from '../../support/builders/account.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * The subscriptions whose payment days an invoice follows (`PI-2`, `QĐ-111x`), through the facade the invoices of `requests` read them by, on
 * real PostgreSQL: the ones that run a period and are paid by a cycle from a start day, none owned by a department
 * (`PI-1c`: every IT Admin submits the invoice of a subscription), and nothing of the rest.
 */
describe('the payment schedules of the subscriptions that run a period (PI-2, PI-1c)', () => {
  const api = () => h.ctx.app.get(SubscriptionPeriodApi, { strict: false });
  const idsOf = async () => new Set((await api().listPaymentSchedules()).map((schedule) => schedule.subscriptionId));

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('gives the cycle and the days a payment follows, and when the system came to know the subscription', async () => {
    const owned = await h.subscription(10, 'K2');
    await h.ctx.sql.query(
      `UPDATE subscriptions SET end_date = '2027-01-04', renewal_date = '2026-12-05', auto_renew = true WHERE id = $1`,
      [owned],
    );

    const schedule = (await api().listPaymentSchedules()).find((row) => row.subscriptionId === owned);

    expect(schedule).toMatchObject({
      subscriptionId: owned,
      responsibleItAdminEmployeeId: h.it1.employeeId,
      billingCycle: 'MONTHLY',
      startDate: '2026-01-05',
      endDate: '2027-01-04',
      renewalDate: '2026-12-05',
      autoRenew: true,
    });
    expect(schedule?.recordedAt).toBeInstanceOf(Date);
  });

  it('leaves out a draft, a purchase made once, a period that a later one continues, a cycle with no payment day', async () => {
    const kept = await h.subscription(10, 'K2');
    const draft = await h.draftSubscription('K2');
    const once = await h.subscription(5, 'K4');
    const continued = await h.subscription(10, 'K2');
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
    const odd = await h.subscription(10, 'K2');
    await h.ctx.sql.query(`UPDATE subscriptions SET billing_cycle = 'OTHER' WHERE id = $1`, [odd]);

    const everyone = await idsOf();

    expect(everyone.has(kept)).toBe(true);
    expect(everyone.has(next)).toBe(true);
    for (const left of [draft, once, continued, odd]) expect(everyone.has(left)).toBe(false);
  });
});
