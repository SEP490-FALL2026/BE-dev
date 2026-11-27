import request from 'supertest';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * Plan price resolution and J-2 price editing rules on real PostgreSQL: prices in dong price plans for requests,
 * lined periods refuse PATCH /subscriptions/:id pricing with 409 SUBSCRIPTION.PRICE_ON_LINES and update via
 * PATCH /subscription-lines/:id, while unlined draft periods update price via PATCH /subscriptions/:id.
 * (Legacy USD active-term cases removed per SPEC-B1:61-68 M1 pre-check, CHECK `subscriptions_active_term_monthly_price`,
 * and VND write guard.)
 */
describe('subscription plan price resolution and J-2 price editing rules', () => {
  const patch = (id: string, body: object) =>
    request(h.server()).patch(`/api/v1/subscriptions/${id}`).set(h.as(h.it1)).send(body);
  const planOf = async (id: string): Promise<string> =>
    (await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [id])).rows[0]
      .plan_id;
  const priceOf = (planId: string, on?: string) =>
    h.ctx.app.get(CatalogApi, { strict: false }).getPlanPrice(planId, undefined, on);
  const stored = async (id: string) =>
    (
      await h.ctx.sql.query<{
        status: string;
        purchased_quantity: number;
        unit_price_currency: string;
        unit_price_minor: string;
        monthly_unit_price_minor: string | null;
        updated_at: Date;
      }>(
        `SELECT status::text, purchased_quantity, unit_price_currency, unit_price_minor::text,
                monthly_unit_price_minor::text, updated_at
           FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('prices the plan of a subscription in dong, on a day or without one', async () => {
    const id = await h.subscription(10, 'K2');
    const planId = await planOf(id);

    expect((await priceOf(planId))?.unitPrice.currency).toBe('VND');
    expect((await priceOf(planId, '2026-06-01'))?.unitPrice.currency).toBe('VND');
  });

  it('J-2: lined K2 period refuses price via PATCH /subscriptions/:id with 409 SUBSCRIPTION.PRICE_ON_LINES and updates via PATCH /subscription-lines/:id', async () => {
    const linedId = await h.subscription(10, 'K2');
    const planId = await planOf(linedId);
    const linedBefore = await stored(linedId);
    const { rows: lineRows } = await h.ctx.sql.query<{ id: string; updated_at: Date }>(
      `SELECT id, updated_at FROM subscription_lines WHERE subscription_id = $1`,
      [linedId],
    );
    const line = lineRows[0];

    const blocked = await patch(linedId, {
      monthlyUnitPrice: { amount: '600000', currency: 'VND' },
      expectedUpdatedAt: linedBefore.updated_at.toISOString(),
    }).expect(409);
    expect(h.codeOf(blocked)).toBe('SUBSCRIPTION.PRICE_ON_LINES');
    expect((await stored(linedId)).unit_price_minor).toBe(linedBefore.unit_price_minor);

    await request(h.server())
      .patch(`/api/v1/subscription-lines/${line.id}`)
      .set(h.as(h.it1))
      .send({
        monthlyUnitPrice: { amount: '600000', currency: 'VND' },
        expectedUpdatedAt: line.updated_at.toISOString(),
      })
      .expect(200);

    expect((await priceOf(planId))?.monthlyPriceMinor).toBe(600_000n);
  });

  it('J-2: unlined draft K2 period accepts price in dong via PATCH /subscriptions/:id and updates the plan/request price', async () => {
    const draftId = await h.draftSubscription('K2');
    const planId = await planOf(draftId);
    expect(await priceOf(planId)).toBeNull();

    await patch(draftId, {
      monthlyUnitPrice: { amount: '508000', currency: 'VND' },
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 1,
      startDate: '2026-01-05',
      expectedUpdatedAt: (await stored(draftId)).updated_at.toISOString(),
    }).expect(200);

    const response = await request(h.server())
      .post(`/api/v1/subscriptions/${draftId}/completions`)
      .set(h.as(h.it1))
      .expect(200);

    expect(h.dataOf<{ status: string }>(response).status).toBe('ACTIVE');
    const after = await stored(draftId);
    expect(after).toMatchObject({
      status: 'ACTIVE',
      unit_price_currency: 'VND',
      monthly_unit_price_minor: '508000',
    });
    expect((await priceOf(planId))?.monthlyPriceMinor).toBe(508_000n);
  });
});
