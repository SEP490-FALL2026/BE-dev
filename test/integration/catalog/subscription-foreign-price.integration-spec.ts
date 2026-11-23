import request from 'supertest';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * B1A-03 (FIX-B1, `QĐ-111an`, ADR-0007): the migration of FX-1 leaves a subscription whose price is in a foreign currency and has no rate to
 * be turned into dong as it was (an `ACTIVE` one stays `ACTIVE`, D-3(3)). Such a price is no price of the new flow: the plan it is the only
 * source of has none, and a change of the subscription never lowers it to a draft without saying so (it names what is missing, 422).
 */
describe('a subscription still priced in a foreign currency (B1A-03, QĐ-111an)', () => {
  const patch = (id: string, body: object) =>
    request(h.server()).patch(`/api/v1/subscriptions/${id}`).set(h.as(h.it1)).send(body);
  const priceOf = (planId: string, on?: string) =>
    h.ctx.app.get(CatalogApi, { strict: false }).getPlanPrice(planId, undefined, on);
  const stored = async (id: string) =>
    (
      await h.ctx.sql.query<{
        status: string;
        purchased_quantity: number;
        unit_price_currency: string;
        unit_price_minor: string;
        updated_at: Date;
      }>(
        `SELECT status::text, purchased_quantity, unit_price_currency, unit_price_minor::text, updated_at
           FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const audits = async (id: string): Promise<number> =>
    (await h.ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE resource_id = $1`, [id]))
      .rows[0].n;

  /** An active subscription an earlier release priced in dollars and left so: written by SQL, no route can make it any more. */
  const pricedInDollars = async (type: 'K1' | 'K2' = 'K2'): Promise<{ id: string; planId: string }> => {
    const id = await h.subscription(10, type);
    const { rows } = await h.ctx.sql.query<{ plan_id: string }>(
      `UPDATE subscriptions SET unit_price_currency = 'USD', unit_price_minor = 2000 WHERE id = $1 RETURNING plan_id`,
      [id],
    );

    return { id, planId: rows[0].plan_id };
  };

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('prices no plan: the price of the plan is read from the subscriptions in dong only, on a day or without one', async () => {
    const { planId, id } = await pricedInDollars();
    expect((await stored(id)).status).toBe('ACTIVE');

    expect(await priceOf(planId)).toBeNull();
    expect(await priceOf(planId, '2026-06-01')).toBeNull();
  });

  it('still prices the plan of a subscription in dong (the reads above are not simply empty)', async () => {
    const id = await h.subscription(10, 'K2');
    const { rows } = await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [
      id,
    ]);

    expect((await priceOf(rows[0].plan_id))?.unitPrice.currency).toBe('VND');
    expect((await priceOf(rows[0].plan_id, '2026-06-01'))?.unitPrice.currency).toBe('VND');
  });

  it('is never lowered to a draft by a change that gives no price: 422 SUBSCRIPTION.STILL_DRAFT naming the price, it stays active and nothing is written', async () => {
    const { id } = await pricedInDollars();
    const before = { row: await stored(id), audit: await audits(id) };

    const response = await h.changeSeats(id, { purchasedQuantity: 11 }, 422);

    expect(h.codeOf(response)).toBe('SUBSCRIPTION.STILL_DRAFT');
    expect(h.detailsOf(response)).toEqual({ missing: ['UNIT_PRICE'] });
    expect(await stored(id)).toEqual(before.row);
    expect(await audits(id)).toBe(before.audit);
  });

  it('is brought back by entering the price in dong: it stays active, priced in dong, and prices the plan again', async () => {
    const { id, planId } = await pricedInDollars();

    const response = await patch(id, { unitPrice: { amount: '508000', currency: 'VND' } }).expect(200);

    expect(h.dataOf<{ status: string }>(response).status).toBe('ACTIVE');
    const after = await stored(id);
    expect(after).toMatchObject({ status: 'ACTIVE', unit_price_currency: 'VND' });
    expect(after.unit_price_minor).not.toBe('2000');
    expect((await priceOf(planId))?.unitPrice).toMatchObject({ currency: 'VND' });
    expect((await priceOf(planId))?.unitPrice.amountMinor.toString()).toBe(after.unit_price_minor);
  });
});
