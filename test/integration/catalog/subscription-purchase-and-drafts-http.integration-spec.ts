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

  describe('a perpetual purchase (AC-8)', () => {
    it('stores 50 licenses at 12.500.000 đ bought 15/03/2026, with no term, no milestone and no warning', async () => {
      const { planId } = await plan({ kind: 'LICENSED', type: 'K4' });
      today('2026-03-15');

      const created = dataOf<SubscriptionWire>(
        await create({
          planId,
          kind: 'PERPETUAL',
          purchasedQuantity: 50,
          unitPrice: { amount: '12500000', currency: 'VND' },
          startDate: '2026-03-15',
        }).expect(201),
      );

      expect(created).toMatchObject({
        kind: 'PERPETUAL',
        status: 'ACTIVE',
        purchasedQuantity: 50,
        unitPrice: { amount: '12500000', currency: 'VND' },
        originalPrice: null,
        endDate: null,
        renewalDate: null,
        autoRenew: false,
        billingCycle: null,
        noticeDeadline: { value: null, source: 'NOT_APPLICABLE' },
        alerts: { baseDate: null, dates: [] },
        warnings: [],
      });
    });

    it.each([
      ['an end date', { endDate: '2027-01-01' }, ['endDate']],
      ['a renewal date', { renewalDate: '2027-01-01' }, ['renewalDate']],
      ['a deadline', { noticeDeadline: '2026-12-01' }, ['noticeDeadline']],
      ['a notice period', { noticePeriodDays: 30 }, ['noticePeriodDays']],
      ['a billing cycle', { billingCycle: 'ANNUAL' }, ['billingCycle']],
      ['auto renewal', { autoRenew: true }, ['autoRenew']],
      ['a mid-term reduction', { allowsMidTermReduction: true }, ['allowsMidTermReduction']],
      ['an end date and auto renewal', { endDate: '2027-01-01', autoRenew: true }, ['endDate', 'autoRenew']],
    ])(
      'refuses %s: 422 SUBSCRIPTION.PERPETUAL_HAS_NO_TERM naming the field, and stores nothing',
      async (_name, extra, fields) => {
        const { planId } = await plan({ kind: 'LICENSED', type: 'K4' });
        const before = await n('subscriptions');

        const response = await create({ planId, kind: 'PERPETUAL', startDate: '2026-03-15', ...extra }).expect(422);

        expect(codeOf(response)).toBe('SUBSCRIPTION.PERPETUAL_HAS_NO_TERM');
        expect(detailsOf(response)).toEqual({ fields });
        expect(await n('subscriptions')).toBe(before);
      },
    );

    it('is for licensed software only, and a perpetual purchase cannot be given a term later', async () => {
      const saas = await plan({ kind: 'SAAS' });
      const licensed = await plan({ kind: 'LICENSED', type: 'K4' });

      expect(codeOf(await create({ planId: saas.planId, kind: 'PERPETUAL' }).expect(422))).toBe(
        'SUBSCRIPTION.PERPETUAL_NEEDS_LICENSED_APPLICATION',
      );
      const purchase = await subscription(licensed.planId, {
        kind: 'PERPETUAL',
        startDate: '2026-03-15',
        purchasedQuantity: 5,
      });
      const response = await patch(purchase.id, { endDate: '2027-01-01' }).expect(422);
      expect(codeOf(response)).toBe('SUBSCRIPTION.PERPETUAL_HAS_NO_TERM');
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

    it('needs no exchange rate: a priced subscription is active at once whatever rates are entered, and an edit of the price takes the day of the edit', async () => {
      const { planId } = await plan();
      today('2026-09-01');

      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: VND_30M,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });
      today('2026-09-02');
      const edited = dataOf<SubscriptionWire>(
        await patch(created.id, { unitPrice: { amount: '31000000', currency: 'VND' } }).expect(200),
      );

      expect(created.status).toBe('ACTIVE');
      expect(edited).toMatchObject({ status: 'ACTIVE', unitPrice: { amount: '31000000', currency: 'VND' } });
      expect(await snapshotOf(created.id)).toMatchObject({
        price_recorded_on: '2026-09-02',
        price_rate_date: '2026-09-02',
        price_reporting_minor: '31000000',
        price_rate_source: 'SAME_CURRENCY',
      });
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
      const kept = dataOf<SubscriptionWire>(await patch(created.id, { purchasedQuantity: 11 }).expect(200));
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
      expect(entered).toMatchObject({ status: 'ACTIVE', unitPrice: { amount: '250000', currency: 'VND' } });
    });

    it('is complete only when a per-seat plan has its quantity, and a flat-rate plan needs none; supplying the rest makes it active', async () => {
      const perSeat = await plan({ pricing: 'PER_SEAT' });
      const flat = await plan({ pricing: 'FLAT_RATE', type: 'K1' });
      const whole = {
        unitPrice: { amount: '2000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: '2026-09-01',
      };

      expect(await subscription(perSeat.planId, whole)).toMatchObject({ status: 'DRAFT', missing: ['QUANTITY'] });
      expect(await subscription(flat.planId, whole)).toMatchObject({ status: 'ACTIVE', missing: [] });

      const draft = await subscription(perSeat.planId, whole);
      const done = dataOf<SubscriptionWire>(await patch(draft.id, { purchasedQuantity: 25 }).expect(200));
      expect(done).toMatchObject({ status: 'ACTIVE', missing: [], purchasedQuantity: 25 });
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
