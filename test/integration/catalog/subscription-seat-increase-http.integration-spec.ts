import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * X-IT.7 (`QĐ-110v`, S-4, SPEC P24), real PostgreSQL: a rise of the seats bought of a `K2` or `K4` pool is told to the IT Admin who answers for the
 * subscription (never to the one who raised it), to the other IT Admins when nobody usable answers, and never for a `K1` purchase, a fall, no change
 * or a number that was not known before. It is a notice in the inbox, never a step to approve.
 */
describe('the notice of a rise of the seats bought of a subscription (X-IT.7)', () => {
  let it2: ApiAccount;
  let it3: ApiAccount;

  const patch = (account: ApiAccount, subscriptionId: string, body: object) =>
    request(h.server()).patch(`/api/v1/subscriptions/${subscriptionId}`).set(h.as(account)).send(body);

  /** The notices of the subscription, with who got each: the inbox only grows, so every case works on a subscription of its own. */
  const noticesOf = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id, params FROM in_app_notifications
          WHERE code = 'SUBSCRIPTION_SEATS_INCREASED' AND subject_id = $1 ORDER BY created_at, id`,
        [subscriptionId],
      )
    ).rows;

  const answerFor = (subscriptionId: string, holder: ApiAccount | null) =>
    h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
      subscriptionId,
      holder?.employeeId ?? null,
    ]);

  beforeAll(async () => {
    await h.start();
    it2 = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT2', email: 'it2@acme.vn', role: 'IT_ADMIN' });
    it3 = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT3', email: 'it3@acme.vn', role: 'IT_ADMIN' });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('tells the IT Admin who answers for a K2 pool of a rise made by another IT Admin, with both numbers and who raised it', async () => {
    const subscriptionId = await h.subscription(10, 'K2');
    await answerFor(subscriptionId, it2);

    await patch(h.it1, subscriptionId, { purchasedQuantity: 14 }).expect(200);

    const notices = await noticesOf(subscriptionId);
    expect(notices).toHaveLength(1);
    expect(notices[0].recipient_employee_id).toBe(it2.employeeId);
    expect(notices[0].params).toMatchObject({
      subscriptionId,
      fromQuantity: 10,
      toQuantity: 14,
      requestId: null,
      changedByEmployeeId: h.it1.employeeId,
    });
  });

  it('tells nobody when the IT Admin who answers for the pool raised it themselves', async () => {
    const subscriptionId = await h.subscription(10, 'K2');

    await patch(h.it1, subscriptionId, { purchasedQuantity: 12 }).expect(200);

    expect(await noticesOf(subscriptionId)).toEqual([]);
  });

  it('tells nobody of a fall, of no change, or of a change that is not the quantity', async () => {
    const subscriptionId = await h.subscription(10, 'K2');
    await answerFor(subscriptionId, it2);

    await patch(h.it1, subscriptionId, { purchasedQuantity: 8 }).expect(200);
    await patch(h.it1, subscriptionId, { purchasedQuantity: 8 }).expect(200);
    await patch(h.it1, subscriptionId, { autoRenew: true }).expect(200);

    expect(await noticesOf(subscriptionId)).toEqual([]);
  });

  it('tells the IT Admin who answers for a K4 pool too', async () => {
    const subscriptionId = await h.subscription(3, 'K4');
    await answerFor(subscriptionId, it3);

    await patch(h.it1, subscriptionId, { purchasedQuantity: 5 }).expect(200);

    const notices = await noticesOf(subscriptionId);
    expect(notices.map((notice) => notice.recipient_employee_id)).toEqual([it3.employeeId]);
    expect(notices[0].params).toMatchObject({ fromQuantity: 3, toQuantity: 5 });
  });

  it('S-4: a K1 purchase tells nobody, whoever answers for it', async () => {
    const subscriptionId = await h.subscription(5, 'K1');
    await answerFor(subscriptionId, it2);

    await patch(h.it1, subscriptionId, { purchasedQuantity: 9 }).expect(200);

    expect(await noticesOf(subscriptionId)).toEqual([]);
  });

  it('tells every other IT Admin who works when nobody answers for the pool', async () => {
    const subscriptionId = await h.subscription(10, 'K2');
    // The one who answers has no account that can act now: the notice goes to the common queue of the IT Admins who work, but the one who raised it.
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [it2.employeeId]);
    await answerFor(subscriptionId, it2);

    await patch(h.it1, subscriptionId, { purchasedQuantity: 11 }).expect(200);

    const told = (await noticesOf(subscriptionId)).map((notice) => notice.recipient_employee_id);
    expect(told).toEqual([it3.employeeId]);
    await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE employee_id = $1`, [it2.employeeId]);
  });
});
