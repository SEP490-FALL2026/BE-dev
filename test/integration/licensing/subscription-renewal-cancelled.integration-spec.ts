import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SharedPoolService } from '../../../src/modules/licensing/shared-pool/shared-pool.service';
import { declareSubscription } from '../../support/builders/catalog.builder';
import { RevocationHarness } from '../../support/revocation-harness';
import { SubscriptionRenewalSweepService } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal-sweep.service';

const h = new RevocationHarness();

/**
 * A subscription the IT Admin recorded as cancelled, `CANCEL` as decided (`QĐ-99i`, `A1C-02`), is no longer running for the company even while
 * the catalog still shows it: no adjustment of it is asked or alerted again, whatever period its payment day rolls into, and no seat is granted
 * from it. Real PostgreSQL.
 */
describe('a subscription recorded as cancelled leaves the adjustment and the stock it granted from (integration, real PostgreSQL)', () => {
  let people: string[] = [];
  const person = (): string => people.shift() as string;
  const closure = { dataExported: true, adminsTransferred: true };

  /** A plan by the month, paid on a day 5 days away and renewing itself, with 10 seats and none held: it may be cancelled today. */
  const monthly = async (planId: string, purchasedQuantity = 10): Promise<string> =>
    declareSubscription(h.ctx, h.it1.accessToken, {
      planId,
      kind: 'TERM',
      purchasedQuantity,
      unitPrice: { amount: '1000000', currency: 'VND' },
      billingCycle: 'MONTHLY',
      startDate: h.inDays(-60),
      renewalDate: h.inDays(5),
      autoRenew: true,
      allowsMidTermReduction: false,
    });
  const record = (body: object) =>
    request(h.server()).post('/api/v1/subscription-renewals').set(h.as(h.it1)).send(body);
  const adjustment = (subscriptionId: string) =>
    request(h.server())
      .get(`/api/v1/subscription-renewals/adjustment?subscriptionId=${subscriptionId}`)
      .set(h.as(h.it1));
  const cancel = (subscriptionId: string) =>
    record({ subscriptionId, choice: 'CANCEL', outcome: 'AS_DECIDED', closure });
  /** The pass run by hand as if it were noon (UTC+7 morning) of `day`. */
  const sweepOn = (day: string) =>
    h.ctx.app.get(SubscriptionRenewalSweepService, { strict: false }).sweep(new Date(`${day}T05:00:00.000Z`));
  const noticesOf = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{ code: string; recipient_employee_id: string }>(
        `SELECT code, recipient_employee_id FROM in_app_notifications
          WHERE subject_id = $1 AND code LIKE 'SUBSCRIPTION%' AND code <> 'SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED' ORDER BY created_at, id`,
        [subscriptionId],
      )
    ).rows;
  const subscriptionOfSeat = async (assignmentId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ subscription_id: string }>(
        `SELECT subscription_id FROM license_assignments WHERE id = $1`,
        [assignmentId],
      )
    ).rows[0].subscription_id;

  beforeAll(async () => {
    await h.start();
    people = [];
    for (let i = 0; i < 12; i += 1) people.push(await h.person(`E-CXX-${i}`));
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('A1C-02 asks and alerts nothing more of the cancelled subscription: the next payment day it rolls into, the point of it, the seats it keeps', async () => {
    const subscriptionId = await monthly(await h.plan('K2', 'PER_SEAT'));
    const recorded = await cancel(subscriptionId).expect(201);
    expect(h.dataOf<{ renewal: { state: string } }>(recorded).renewal.state).toBe('OUTCOME_RECORDED');
    // The payment day moves off the grid of the recorded case (R-1 rolls it to the first day on the grid from today): the deadline is no
    // longer the one the case was recorded for, so only the cancellation itself can keep the sweep quiet (V-4).
    await h.ctx.sql.query(`UPDATE subscriptions SET renewal_date = $2::date WHERE id = $1`, [
      subscriptionId,
      h.inDays(12),
    ]);

    // Seven days before that deadline is the point of the adjustment; the deadline itself keeps seats.
    await sweepOn(h.inDays(5));
    await sweepOn(h.inDays(12));

    expect(await noticesOf(subscriptionId)).toEqual([]);
  });

  it('A1C-02 refuses to read or record the adjustment of the cancelled subscription again: NOT_RENEWABLE, reason CANCELLED', async () => {
    const subscriptionId = await monthly(await h.plan('K2', 'PER_SEAT'));
    await adjustment(subscriptionId).expect(200);
    await cancel(subscriptionId).expect(201);
    await h.ctx.sql.query(`UPDATE subscriptions SET renewal_date = renewal_date + interval '1 month' WHERE id = $1`, [
      subscriptionId,
    ]);

    const read = await adjustment(subscriptionId).expect(409);
    const again = await cancel(subscriptionId).expect(409);

    for (const answer of [read, again]) {
      expect(h.codeOf(answer)).toBe('SUBSCRIPTION_RENEWAL.NOT_RENEWABLE');
      expect(h.detailsOf(answer)).toEqual({ reason: 'CANCELLED' });
    }
    const { rows } = await h.ctx.sql.query(`SELECT 1 FROM subscription_renewals WHERE subscription_id = $1`, [
      subscriptionId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('A1C-02 grants no seat from the cancelled subscription: the other subscription of the plan with room gives it', async () => {
    const planId = await h.plan('K2', 'PER_SEAT');
    const cancelled = await monthly(planId, 10);
    const spare = await monthly(planId, 3);
    await cancel(cancelled).expect(201);

    const task = await h.granted(person(), planId);

    expect(await subscriptionOfSeat(task.assignmentId)).toBe(spare);
  });

  it('A1C-02 a plan whose only subscription is cancelled has none to grant from, and one the IT Admin names is not grantable', async () => {
    const planId = await h.plan('K2', 'PER_SEAT');
    const cancelled = await monthly(planId, 10);
    await cancel(cancelled).expect(201);
    const before = await h.count('license_assignments');

    const unnamed = await h.grant({ requestId: h.gate.grantable(person(), planId) });
    const named = await h.grant({ requestId: h.gate.grantable(person(), planId), subscriptionId: cancelled });

    expect(unnamed.status).toBe(404);
    expect(h.codeOf(unnamed)).toBe('SUBSCRIPTION.NOT_FOUND');
    expect(named.status).toBe(422);
    expect(h.codeOf(named)).toBe('PROVISIONING.SUBSCRIPTION_NOT_GRANTABLE');
    expect(await h.count('license_assignments')).toBe(before);
  });

  it('A1C-02 counts no free seat of the cancelled subscription in the stock of the plan', async () => {
    const planId = await h.plan('K2', 'PER_SEAT');
    const cancelled = await monthly(planId, 10);
    const spare = await monthly(planId, 3);
    const pool = h.ctx.app.get(SharedPoolService, { strict: false });
    expect((await pool.stockOfPlans([planId], h.today())).get(planId)).toMatchObject({ free: 13 });

    await cancel(cancelled).expect(201);

    expect((await pool.stockOfPlans([planId], h.today())).get(planId)).toMatchObject({ free: 3 });
    const inTransaction = await h.ctx.app.get(TransactionRunner).run((tx) => pool.stockOf(tx, planId, h.today(), 'K2'));
    expect([...inTransaction.freeBySubscription.keys()]).toEqual([spare]);
  });

  it('F-11: CANCEL closes K2 lines ENDED so re-declaring the same (workspace, plan) returns 201, and renewalDate-only expiry sets closed_on = renewalDay - 1', async () => {
    const planId = await h.plan('K2', 'PER_SEAT');
    const cancelled = await monthly(planId, 5);
    await cancel(cancelled).expect(201);

    const closedCancel = await h.ctx.sql.query<{ closed_reason: string | null; workspace_id: string }>(
      `SELECT closed_reason, workspace_id FROM subscription_lines WHERE subscription_id = $1`,
      [cancelled],
    );
    expect(closedCancel.rows).toHaveLength(1);
    expect(closedCancel.rows[0].closed_reason).toBe('ENDED');

    const redeclared = await declareSubscription(h.ctx, h.it1.accessToken, {
      planId,
      workspaceId: closedCancel.rows[0].workspace_id,
      kind: 'TERM',
      purchasedQuantity: 4,
      unitPrice: { amount: '1000000', currency: 'VND' },
      billingCycle: 'MONTHLY',
      startDate: h.today(),
      renewalDate: h.inDays(30),
      autoRenew: true,
      allowsMidTermReduction: false,
    });
    expect(redeclared).toBeTruthy();

    const planNoEnd = await h.plan('K2', 'PER_SEAT');
    const subNoEnd = await declareSubscription(h.ctx, h.it1.accessToken, {
      planId: planNoEnd,
      kind: 'TERM',
      purchasedQuantity: 3,
      unitPrice: { amount: '12000000', currency: 'VND' },
      billingCycle: 'ANNUAL',
      startDate: '2026-07-01',
      renewalDate: '2027-07-01',
      autoRenew: false,
      allowsMidTermReduction: false,
    });
    await sweepOn('2027-07-02');
    const closedNoEnd = await h.ctx.sql.query<{ closed_on: string | null; closed_reason: string | null }>(
      `SELECT closed_on::text, closed_reason FROM subscription_lines WHERE subscription_id = $1`,
      [subNoEnd],
    );
    expect(closedNoEnd.rows).toEqual([{ closed_on: '2027-06-30', closed_reason: 'ENDED' }]);
  });
});
