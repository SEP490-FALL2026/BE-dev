import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { principal } from '../../support/ai-assist-fakes';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
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

    await h.changeSeats(subscriptionId, { purchasedQuantity: 14 });

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

    await h.changeSeats(subscriptionId, { purchasedQuantity: 12 });

    expect(await noticesOf(subscriptionId)).toEqual([]);
  });

  it('tells nobody of a fall, of no change, or of a change that is not the quantity', async () => {
    const subscriptionId = await h.subscription(10, 'K2');
    await answerFor(subscriptionId, it2);

    await h.changeSeats(subscriptionId, { purchasedQuantity: 8 });
    await h.changeSeats(subscriptionId, { purchasedQuantity: 8 });
    await patch(h.it1, subscriptionId, { autoRenew: true }).expect(200);

    expect(await noticesOf(subscriptionId)).toEqual([]);
  });

  it('tells the IT Admin who answers for a K4 pool too', async () => {
    const subscriptionId = await h.subscription(3, 'K4');
    await answerFor(subscriptionId, it3);

    await h.changeSeats(subscriptionId, { purchasedQuantity: 5 });

    const notices = await noticesOf(subscriptionId);
    expect(notices.map((notice) => notice.recipient_employee_id)).toEqual([it3.employeeId]);
    expect(notices[0].params).toMatchObject({ fromQuantity: 3, toQuantity: 5 });
  });

  it('tells nobody when the quantity of a draft changes: a draft has bought nothing yet', async () => {
    const subscriptionId = await h.draftSubscription('K2');
    await answerFor(subscriptionId, it2);

    await h.changeSeats(subscriptionId, { purchasedQuantity: 25 });

    expect(await noticesOf(subscriptionId)).toEqual([]);
  });

  it('S-4: a K1 purchase tells nobody, whoever answers for it', async () => {
    const subscriptionId = await h.subscription(5, 'K1');
    await answerFor(subscriptionId, it2);

    await h.changeSeats(subscriptionId, { purchasedQuantity: 9 });

    expect(await noticesOf(subscriptionId)).toEqual([]);
  });

  it('tells every other IT Admin who works when nobody answers for the pool', async () => {
    const subscriptionId = await h.subscription(10, 'K2');
    // The one who answers has no account that can act now: the notice goes to the common queue of the IT Admins who work, but the one who raised it.
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [it2.employeeId]);
    await answerFor(subscriptionId, it2);

    await h.changeSeats(subscriptionId, { purchasedQuantity: 11 });

    const told = (await noticesOf(subscriptionId)).map((notice) => notice.recipient_employee_id);
    expect(told).toEqual([it3.employeeId]);
    await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE employee_id = $1`, [it2.employeeId]);
  });

  /** A stale edit of a subscription is refused (optimistic check on `updatedAt`), real PostgreSQL. */
  describe('the edit of a subscription made on an old read', () => {
    const patch = (subscriptionId: string, body: object) =>
      request(h.server()).patch(`/api/v1/subscriptions/${subscriptionId}`).set(h.as(h.it1)).send(body);
    const read = async (subscriptionId: string) =>
      h.dataOf<{ updatedAt: string }>(
        await request(h.server()).get(`/api/v1/subscriptions/${subscriptionId}`).set(h.as(h.it1)).expect(200),
      ).updatedAt;
    const quantityOf = async (subscriptionId: string) =>
      (
        await h.ctx.sql.query<{ q: number }>(`SELECT purchased_quantity AS q FROM subscriptions WHERE id = $1`, [
          subscriptionId,
        ])
      ).rows[0].q;

    it('refuses the second of two edits made on the same read: 409 SUBSCRIPTION.STALE, nothing written', async () => {
      const id = await h.subscription(4, 'K2');
      const seen = await read(id);

      const first = await patch(id, {
        purchasedQuantity: 6,
        expectedUpdatedAt: seen,
        quantityChangeReason: 'More seats',
      }).expect(200);
      const second = await patch(id, {
        purchasedQuantity: 5,
        expectedUpdatedAt: seen,
        quantityChangeReason: 'More seats',
      }).expect(409);

      expect(h.codeOf(second)).toBe('SUBSCRIPTION.STALE');
      expect(h.detailsOf(second)).toMatchObject({ currentUpdatedAt: h.dataOf<{ updatedAt: string }>(first).updatedAt });
      expect(await quantityOf(id)).toBe(6);
    });

    it('refuses a change of the seats sent with no version of a read: 422 SUBSCRIPTION.VERSION_REQUIRED, nothing written', async () => {
      const id = await h.subscription(4, 'K2');

      const refused = await patch(id, { purchasedQuantity: 6, quantityChangeReason: 'More seats' }).expect(422);

      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.VERSION_REQUIRED');
      expect(await quantityOf(id)).toBe(4);
    });

    it.each(['K2', 'K1'] as const)(
      'a seat bought for a %s grant between the read and the PATCH makes the PATCH stale',
      async (type) => {
        const id = await h.subscription(4, type);
        const seen = await read(id);

        // What a grant does in its own transaction: lock the target, then buy the seat (the K1 grant takes its own seat the same way).
        const catalog = h.ctx.app.get(CatalogApi, { strict: false });
        await h.ctx.app.get(TransactionRunner).run(async (tx) => {
          await catalog.lockSeatTarget(tx, { subscriptionId: id });
          await catalog.incrementLegacyPoolSeat(tx, principal(h.it1.employeeId), id, null);
        });
        expect(await quantityOf(id)).toBe(5);

        const refused = await patch(id, {
          purchasedQuantity: 9,
          expectedUpdatedAt: seen,
          quantityChangeReason: 'More seats',
        }).expect(409);
        expect(h.codeOf(refused)).toBe('SUBSCRIPTION.STALE');
        expect(await quantityOf(id)).toBe(5);
      },
    );
  });
});
