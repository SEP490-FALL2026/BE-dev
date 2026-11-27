import request from 'supertest';
import {
  SubscriptionHttpHarness,
  type SubscriptionWire,
  USD_1200,
  VND_30M,
} from '../../support/subscription-http-harness';

describe('subscriptions and perpetual purchases over HTTP (integration, real PostgreSQL): a perpetual purchase, drafts and the price in dong with its snapshot of the same currency', () => {
  const h = new SubscriptionHttpHarness();
  const { dataOf, codeOf, detailsOf, today, plan, create, patch, get, complete, subscription, n, auditOf } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('what is bought once is a lot of license keys (AC-8, W3-24)', () => {
    const createLot = (body: object, account = h.it1) =>
      request(h.server()).post('/api/v1/license-lots').set(h.as(account)).send(body);
    const lotBody = (planId: string, extra: object = {}) => ({
      planId,
      purchasedOn: '2026-03-15',
      licenseCount: 50,
      unitPrice: { amount: '12500000', currency: 'VND' },
      purpose: 'REPLACEMENT',
      ...extra,
    });

    it('stores 50 licenses at 12.500.000 đ bought 15/03/2026 as a lot, with no term, no milestone and no subscription', async () => {
      const { planId } = await plan({ kind: 'LICENSED', type: 'K4' });
      today('2026-03-15');
      const before = await n('subscriptions');

      const created = dataOf<{ id: string }>(await createLot(lotBody(planId)).expect(201));

      const lot = dataOf<{ licenseCount: number; free: number; unitPrice: { amount: string; currency: string } }>(
        await request(h.server()).get(`/api/v1/license-lots/${created.id}`).set(h.as(h.it1)).expect(200),
      );
      expect(lot).toMatchObject({ licenseCount: 50, free: 50 });
      expect(Number(lot.unitPrice.amount)).toBe(12500000);
      expect(lot.unitPrice.currency).toBe('VND');
      expect(
        (
          await h.ctx.sql.query<{ purchased_on: string }>(
            `SELECT to_char(purchased_on, 'YYYY-MM-DD') AS purchased_on FROM license_lots WHERE id = $1`,
            [created.id],
          )
        ).rows[0].purchased_on,
      ).toBe('2026-03-15');
      expect(await n('subscriptions')).toBe(before);
    });

    it.each([
      ['an end date', { endDate: '2027-01-01' }],
      ['a renewal date', { renewalDate: '2027-01-01' }],
      ['a deadline', { noticeDeadline: '2026-12-01' }],
      ['a notice period', { noticePeriodDays: 30 }],
      ['a billing cycle', { billingCycle: 'ANNUAL' }],
      ['auto renewal', { autoRenew: true }],
      ['a mid-term reduction', { allowsMidTermReduction: true }],
      ['an end date and auto renewal', { endDate: '2027-01-01', autoRenew: true }],
    ])('refuses a lot with %s: 422 VALIDATION_ERROR, a lot has no term, and stores nothing', async (_name, extra) => {
      const { planId } = await plan({ kind: 'LICENSED', type: 'K4' });
      const before = await n('license_lots');

      const response = await createLot(lotBody(planId, extra)).expect(422);

      expect(codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await n('license_lots')).toBe(before);
    });

    it('refuses a perpetual purchase on the subscription route, whatever it names: 422 SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT, and stores nothing', async () => {
      const { planId } = await plan({ kind: 'LICENSED', type: 'K4' });
      const before = { subscriptions: await n('subscriptions'), lots: await n('license_lots') };

      for (const extra of [{}, { endDate: '2027-01-01' }, { billingCycle: 'ANNUAL', autoRenew: true }]) {
        const response = await create({ planId, kind: 'PERPETUAL', startDate: '2026-03-15', ...extra }).expect(422);
        expect(codeOf(response)).toBe('SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT');
      }
      expect({ subscriptions: await n('subscriptions'), lots: await n('license_lots') }).toEqual(before);
    });

    it('is for licensed software only: a lot of the plan of a SaaS application is refused, and so is a perpetual purchase of it', async () => {
      const saas = await plan({ kind: 'SAAS' });

      expect(codeOf(await create({ planId: saas.planId, kind: 'PERPETUAL' }).expect(422))).toBe(
        'SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT',
      );
      expect(codeOf(await createLot(lotBody(saas.planId)).expect(422))).toBe('LICENSE_LOT.PLAN_NOT_K4');
    });
  });

  describe('drafts, and the price in dong with its snapshot of the same currency (US-04-05, QĐ-111an)', () => {
    /** The snapshot a price is stored with, read from the table: the response no longer carries it. */
    const snapshotOf = async (id: string) =>
      (
        await h.ctx.sql.query<{
          unit_price_minor: string;
          unit_price_currency: string;
          price_recorded_on: string;
          price_rate: string;
          price_rate_date: string;
          price_rate_source: string;
          price_reporting_minor: string;
          price_reporting_currency: string;
          price_exchange_rate_id: string | null;
          original_unit_price_minor: string | null;
          original_currency: string | null;
        }>(
          `SELECT unit_price_minor::text, unit_price_currency, to_char(price_recorded_on, 'YYYY-MM-DD') AS price_recorded_on,
                  price_rate::text, to_char(price_rate_date, 'YYYY-MM-DD') AS price_rate_date, price_rate_source::text,
                  price_reporting_minor::text, price_reporting_currency, price_exchange_rate_id,
                  original_unit_price_minor::text, original_currency
             FROM subscriptions WHERE id = $1`,
          [id],
        )
      ).rows[0];

    it('AC-4: Notion, only known to be in use: a draft that says it lacks financial data and what', async () => {
      const { planId } = await plan({ vendorName: 'Notion Labs' });

      const created = await subscription(planId);

      expect(created).toMatchObject({
        status: 'DRAFT',
        missingFinancialData: true,
        missing: ['QUANTITY', 'START_DATE', 'BILLING_CYCLE', 'UNIT_PRICE'],
        unitPrice: null,
        originalPrice: null,
      });
    });

    it('QĐ-111an: 30.000.000 đ recorded on 01/09 is stored as 30.000.000 đ, active, with the snapshot of the same currency: rate 1, 01/09, no exchange rate behind it', async () => {
      const { planId } = await plan();
      today('2026-09-01');

      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: VND_30M,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });

      expect(created).toMatchObject({ status: 'ACTIVE', missing: [], unitPrice: VND_30M, originalPrice: null });
      expect(created).not.toHaveProperty('priceSnapshot');
      expect(await snapshotOf(created.id)).toEqual({
        unit_price_minor: '30000000',
        unit_price_currency: 'VND',
        price_recorded_on: '2026-09-01',
        price_rate: '1.0000000000',
        price_rate_date: '2026-09-01',
        price_rate_source: 'SAME_CURRENCY',
        price_reporting_minor: '30000000',
        price_reporting_currency: 'VND',
        price_exchange_rate_id: null,
        original_unit_price_minor: null,
        original_currency: null,
      });
    });

    it('needs no exchange rate: a priced subscription is active at once whatever rates are entered; its price is edited on its line, never on the subscription (J-2)', async () => {
      const { planId } = await plan();
      today('2026-09-01');

      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: VND_30M,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });
      today('2026-09-02');
      // The period has a line that holds the price (SPEC-B3 W3-15): a price sent to the subscription is refused and nothing moves.
      const refused = await patch(created.id, { unitPrice: { amount: '31000000', currency: 'VND' } }).expect(409);

      expect(created.status).toBe('ACTIVE');
      expect(codeOf(refused)).toBe('SUBSCRIPTION.PRICE_ON_LINES');
      expect(await snapshotOf(created.id)).toMatchObject({
        price_recorded_on: '2026-09-01',
        price_rate_date: '2026-09-01',
        price_reporting_minor: '30000000',
        price_rate_source: 'SAME_CURRENCY',
      });
      // The edit of the price goes through the line.
      const line = (
        await h.ctx.sql.query<{ id: string; updated_at: Date }>(
          `SELECT id, updated_at FROM subscription_lines WHERE subscription_id = $1`,
          [created.id],
        )
      ).rows[0];
      await request(h.server())
        .patch(`/api/v1/subscription-lines/${line.id}`)
        .set(h.as(h.it1))
        .send({
          monthlyUnitPrice: { amount: '2583334', currency: 'VND' },
          expectedUpdatedAt: line.updated_at.toISOString(),
        })
        .expect(200);
      expect(
        (
          await h.ctx.sql.query<{ monthly_unit_price_minor: string }>(
            `SELECT monthly_unit_price_minor::text FROM subscription_lines WHERE id = $1`,
            [line.id],
          )
        ).rows[0].monthly_unit_price_minor,
      ).toBe('2583334');
    });

    it('US-04-05 AC-2: what was stored does not change, however often it is read', async () => {
      const { planId } = await plan();
      today('2026-09-01');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: VND_30M,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });
      today('2026-10-01');

      const first = dataOf<SubscriptionWire>(await get(created.id).expect(200));
      const second = dataOf<SubscriptionWire>(await get(created.id).expect(200));

      expect(first.unitPrice).toEqual(VND_30M);
      expect(second).toEqual(first);
      expect(second.updatedAt).toBe(created.updatedAt);
      expect((await snapshotOf(created.id)).price_rate_date).toBe('2026-09-01');
    });

    it.each([
      ['USD', { amount: '1200.00', currency: 'USD' }],
      ['an unknown currency', { amount: '10', currency: 'XYZ' }],
    ])(
      'refuses a unit price in %s: 422 SUBSCRIPTION.PRICE_NOT_VND naming the currency, and stores nothing',
      async (_name, unitPrice) => {
        const { planId } = await plan();
        const before = { subscriptions: await n('subscriptions'), audit: await n('audit_events') };

        const response = await create({ planId, kind: 'TERM', unitPrice }).expect(422);

        expect(codeOf(response)).toBe('SUBSCRIPTION.PRICE_NOT_VND');
        expect(detailsOf(response)).toEqual({ currency: unitPrice.currency });
        expect({ subscriptions: await n('subscriptions'), audit: await n('audit_events') }).toEqual(before);
      },
    );

    it('refuses a price edit in dollars with 422 SUBSCRIPTION.PRICE_NOT_VND and changes nothing', async () => {
      const { planId } = await plan();
      today('2026-09-01');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: VND_30M,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });

      const response = await patch(created.id, { unitPrice: USD_1200 }).expect(422);

      expect(codeOf(response)).toBe('SUBSCRIPTION.PRICE_NOT_VND');
      const after = dataOf<SubscriptionWire>(await get(created.id).expect(200));
      expect(after).toMatchObject({ status: 'ACTIVE', unitPrice: VND_30M });
      expect(after.updatedAt).toBe(created.updatedAt);
      expect(await auditOf(created.id)).toHaveLength(1);
    });

    it('R-44: keeps the price the vendor quoted beside the price in dong, and an edit can change it, leave it alone or take it away', async () => {
      const { planId } = await plan();
      today('2026-09-01');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: { amount: '1200000', currency: 'VND' },
        originalPrice: { amount: '48.00', currency: 'USD' },
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });

      expect(created).toMatchObject({
        status: 'ACTIVE',
        unitPrice: { amount: '1200000', currency: 'VND' },
        originalPrice: { amount: '48.00', currency: 'USD' },
      });
      expect(await snapshotOf(created.id)).toMatchObject({
        original_unit_price_minor: '4800',
        original_currency: 'USD',
        price_reporting_minor: '1200000',
      });

      const changed = dataOf<SubscriptionWire>(
        await patch(created.id, { originalPrice: { amount: '50.00', currency: 'USD' } }).expect(200),
      );
      expect(changed.originalPrice).toEqual({ amount: '50.00', currency: 'USD' });
      // A change of something else leaves it alone (the seats are no longer edited here: W3-27).
      const kept = dataOf<SubscriptionWire>(await patch(created.id, { autoRenew: true }).expect(200));
      expect(kept.originalPrice).toEqual({ amount: '50.00', currency: 'USD' });
      const cleared = dataOf<SubscriptionWire>(await patch(created.id, { originalPrice: null }).expect(200));
      expect(cleared.originalPrice).toBeNull();
      const events = await auditOf(created.id);
      expect(JSON.stringify(events[1].after)).toContain('5000 USD');
      expect(await snapshotOf(created.id)).toMatchObject({ original_unit_price_minor: null, original_currency: null });
    });

    it('refuses an original price that is negative, over-precise or in a currency the system does not know', async () => {
      const { planId } = await plan();
      const before = await n('subscriptions');
      const body = { planId, kind: 'TERM', unitPrice: VND_30M };

      expect(codeOf(await create({ ...body, originalPrice: { amount: '-1.00', currency: 'USD' } }).expect(422))).toBe(
        'MONEY_OUT_OF_RANGE',
      );
      expect(codeOf(await create({ ...body, originalPrice: { amount: '1.005', currency: 'USD' } }).expect(422))).toBe(
        'MONEY_SCALE_EXCEEDED',
      );
      expect(codeOf(await create({ ...body, originalPrice: { amount: '10', currency: 'XYZ' } }).expect(422))).toBe(
        'CURRENCY_NOT_SUPPORTED',
      );
      expect(await n('subscriptions')).toBe(before);
    });

    it('a draft an earlier release left in dollars lacks its price: it cannot be completed until the price is entered again in dong', async () => {
      const { planId } = await plan();
      const draftId = await h.wholeDraft(planId);
      await h.ctx.sql.query(
        `UPDATE subscriptions SET unit_price_minor = 1000, unit_price_currency = 'USD', price_rate = NULL, price_rate_date = NULL,
                price_rate_source = NULL, price_reporting_minor = NULL, price_reporting_currency = NULL WHERE id = $1`,
        [draftId],
      );

      const stored = dataOf<SubscriptionWire>(await get(draftId).expect(200));
      expect(stored).toMatchObject({
        status: 'DRAFT',
        missing: ['UNIT_PRICE'],
        unitPrice: { amount: '10.00', currency: 'USD' },
      });
      const early = await complete(draftId).expect(422);
      expect(codeOf(early)).toBe('SUBSCRIPTION.STILL_DRAFT');
      expect(detailsOf(early)).toEqual({ missing: ['UNIT_PRICE'] });

      const entered = dataOf<SubscriptionWire>(
        await patch(draftId, { unitPrice: { amount: '250000', currency: 'VND' } }).expect(200),
      );
      // The price is kept as a monthly price (20.833 in the stored draft) and the year is 12 times it: 249.996 (SPEC-B1 W3-02).
      expect(entered).toMatchObject({ status: 'ACTIVE', unitPrice: { amount: '249996', currency: 'VND' } });
    });

    it('is complete only when a per-seat plan has its quantity, and a flat-rate plan needs none; supplying the rest makes it active', async () => {
      const perSeat = await plan({ pricing: 'PER_SEAT' });
      // A plan of personal accounts (K1) has no subscription since W3-27: the flat-rate plan is one of seats too.
      const flat = await plan({ pricing: 'FLAT_RATE' });
      const whole = {
        unitPrice: { amount: '2000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: '2026-09-01',
      };

      expect(await subscription(perSeat.planId, whole)).toMatchObject({ status: 'DRAFT', missing: ['QUANTITY'] });
      expect(await subscription(flat.planId, whole)).toMatchObject({ status: 'ACTIVE', missing: [] });

      // The quantity is not supplied by an edit any more (the seats are bought on the lines, W3-27): the edit is refused, the draft stays a draft,
      // and a declaration that gives the seats at once is active.
      // One live subscription of a plan per workspace (W3-14): the second draft is of a plan of its own.
      const draft = await subscription((await plan({ pricing: 'PER_SEAT' })).planId, whole);
      expect(codeOf(await h.changeSeats(draft.id, { purchasedQuantity: 25 }, 409))).toBe(
        'SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER',
      );
      expect(dataOf<SubscriptionWire>(await get(draft.id).expect(200))).toMatchObject({
        status: 'DRAFT',
        missing: ['QUANTITY'],
      });
      const perSeatTwo = await plan({ pricing: 'PER_SEAT' });
      expect(await subscription(perSeatTwo.planId, { ...whole, purchasedQuantity: 25 })).toMatchObject({
        status: 'ACTIVE',
        missing: [],
        purchasedQuantity: 25,
      });
    });

    it('refuses a price that is negative, too large or over-precise in dong, in another currency, or not an amount', async () => {
      const { planId } = await plan();
      const before = await n('subscriptions');

      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '-1', currency: 'VND' } }).expect(422)),
      ).toBe('MONEY_OUT_OF_RANGE');
      expect(
        codeOf(
          await create({ planId, kind: 'TERM', unitPrice: { amount: '1000000000000001', currency: 'VND' } }).expect(
            422,
          ),
        ),
      ).toBe('MONEY_OUT_OF_RANGE');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '1.5', currency: 'VND' } }).expect(422)),
      ).toBe('MONEY_SCALE_EXCEEDED');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '1.005', currency: 'USD' } }).expect(422)),
      ).toBe('SUBSCRIPTION.PRICE_NOT_VND');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: 'abc', currency: 'VND' } }).expect(422)),
      ).toBe('VALIDATION_ERROR');
      expect(await n('subscriptions')).toBe(before);
    });
  });
});
