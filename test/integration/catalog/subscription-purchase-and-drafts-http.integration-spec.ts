import { SubscriptionHttpHarness, type SubscriptionWire, USD_1200 } from '../../support/subscription-http-harness';

describe('subscriptions and perpetual purchases over HTTP (integration, real PostgreSQL): a perpetual purchase, drafts and the price with its frozen conversion', () => {
  const h = new SubscriptionHttpHarness();
  const { dataOf, codeOf, detailsOf, today, rate, plan, create, patch, get, complete, subscription, n, auditOf } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('a perpetual purchase (AC-8)', () => {
    it('stores 50 licenses at 500 USD bought 15/03/2026, with no term, no milestone and no warning', async () => {
      const { planId } = await plan({ kind: 'LICENSED', type: 'K4' });
      today('2026-03-15');
      await rate('USD', '2026-03-15', '25000');

      const created = dataOf<SubscriptionWire>(
        await create({
          planId,
          kind: 'PERPETUAL',
          purchasedQuantity: 50,
          unitPrice: { amount: '500.00', currency: 'USD' },
          startDate: '2026-03-15',
        }).expect(201),
      );

      expect(created).toMatchObject({
        kind: 'PERPETUAL',
        status: 'ACTIVE',
        purchasedQuantity: 50,
        unitPrice: { amount: '500.00', currency: 'USD' },
        endDate: null,
        renewalDate: null,
        autoRenew: false,
        billingCycle: null,
        noticeDeadline: { value: null, source: 'NOT_APPLICABLE' },
        alerts: { baseDate: null, dates: [] },
        warnings: [],
      });
      expect(created.priceSnapshot).toMatchObject({
        rate: '25000',
        reportingAmount: '12500000',
        reportingCurrency: 'VND',
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

  describe('drafts, and the price with its frozen conversion (US-04-05)', () => {
    it('AC-4: Notion, only known to be in use: a draft that says it lacks financial data and what', async () => {
      const { planId } = await plan({ vendorName: 'Notion Labs' });

      const created = await subscription(planId);

      expect(created).toMatchObject({
        status: 'DRAFT',
        missingFinancialData: true,
        missing: ['QUANTITY', 'START_DATE', 'BILLING_CYCLE', 'UNIT_PRICE'],
        unitPrice: null,
        priceSnapshot: null,
      });
    });

    it('US-04-05 AC-1: 1,200 USD recorded on 01/09 at 25,000 is stored as 1,200.00 USD, rate 25,000, 01/09, 30,000,000 VND', async () => {
      const { planId } = await plan();
      today('2026-09-01');
      const rateId = await rate('USD', '2026-09-01', '25000');

      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });

      expect(created.unitPrice).toEqual(USD_1200);
      expect(created.priceSnapshot).toEqual({
        recordedOn: '2026-09-01',
        rate: '25000',
        rateDate: '2026-09-01',
        rateSource: 'MANUAL',
        reportingAmount: '30000000',
        reportingCurrency: 'VND',
        exchangeRateId: rateId,
      });
    });

    it('US-04-05 AC-1: a price in the reporting currency converts at 1 and needs no rate', async () => {
      const { planId } = await plan();

      const created = await subscription(planId, {
        purchasedQuantity: 3,
        unitPrice: { amount: '1500000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: '2026-09-01',
      });

      expect(created.status).toBe('ACTIVE');
      expect(created.priceSnapshot).toMatchObject({
        rate: '1',
        rateSource: 'SAME_CURRENCY',
        reportingAmount: '1500000',
        exchangeRateId: null,
      });
    });

    it('US-04-05 AC-2: a later rate does not change what was stored, however often it is read', async () => {
      const { planId } = await plan();
      today('2026-09-01');
      await rate('USD', '2026-09-01', '25000');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });
      await rate('USD', '2026-10-01', '26000');

      const first = dataOf<SubscriptionWire>(await get(created.id).expect(200));
      const second = dataOf<SubscriptionWire>(await get(created.id).expect(200));

      expect(first.priceSnapshot?.reportingAmount).toBe('30000000');
      expect(second.priceSnapshot).toEqual(first.priceSnapshot);
      expect(second.updatedAt).toBe(created.updatedAt);
    });

    it('US-04-05 AC-5: with no rate for the day the price is stored but not converted, the subscription is a draft, and completing it needs the rate', async () => {
      const { planId } = await plan();
      today('2026-08-15');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-08-01',
      });

      expect(created).toMatchObject({
        status: 'DRAFT',
        missingFinancialData: true,
        missing: ['EXCHANGE_RATE'],
        unitPrice: USD_1200,
        priceSnapshot: null,
      });
      const early = await complete(created.id).expect(422);
      expect(codeOf(early)).toBe('SUBSCRIPTION.STILL_DRAFT');
      expect(detailsOf(early)).toEqual({ missing: ['EXCHANGE_RATE'] });

      await rate('USD', '2026-08-15', '25100');
      jest.restoreAllMocks();
      const completed = dataOf<SubscriptionWire>(await complete(created.id).expect(200));

      expect(completed.status).toBe('ACTIVE');
      expect(completed.priceSnapshot).toMatchObject({
        recordedOn: '2026-08-15',
        rateDate: '2026-08-15',
        rate: '25100',
        reportingAmount: '30120000',
      });
      expect((await auditOf(created.id)).map((event) => event.action)).toEqual([
        'SUBSCRIPTION.CREATED',
        'SUBSCRIPTION.COMPLETED',
      ]);
      expect(dataOf<SubscriptionWire>(await complete(created.id).expect(200)).updatedAt).toBe(completed.updatedAt);
    });

    it('US-04-05 AC-7: priced on 01/10/2026 with only the rate of 01/01/2025, it waits for the rate of 01/10 and never uses the other; a later edit uses the rate of its day', async () => {
      const { planId } = await plan();
      await rate('USD', '2025-01-01', '24000');
      today('2026-11-03');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2025-01-01',
      });
      expect(created).toMatchObject({ status: 'DRAFT', priceSnapshot: null, missing: ['EXCHANGE_RATE'] });

      await rate('USD', '2026-11-03', '26000');
      const completed = dataOf<SubscriptionWire>(await complete(created.id).expect(200));
      expect(completed.priceSnapshot).toMatchObject({
        rateDate: '2026-11-03',
        rate: '26000',
        reportingAmount: '31200000',
      });

      today('2026-11-09');
      await rate('USD', '2026-11-09', '27000');
      const edited = dataOf<SubscriptionWire>(
        await patch(created.id, { unitPrice: { amount: '1300.00', currency: 'USD' } }).expect(200),
      );
      expect(edited.priceSnapshot).toMatchObject({
        recordedOn: '2026-11-09',
        rateDate: '2026-11-09',
        rate: '27000',
        reportingAmount: '35100000',
      });
      const events = await auditOf(created.id);
      const last = events[events.length - 1];
      expect(last.action).toBe('SUBSCRIPTION.UPDATED');
      expect(JSON.stringify(last.before)).toContain('31200000 VND at 26000');
      expect(JSON.stringify(last.after)).toContain('35100000 VND at 27000');

      const before = events.length;
      await patch(created.id, { unitPrice: { amount: '1300.00', currency: 'USD' } }).expect(200);
      expect(await auditOf(created.id)).toHaveLength(before);
    });

    it('does not turn an active subscription back into a draft: a price edit on a day with no rate is refused and changes nothing', async () => {
      const { planId } = await plan();
      today('2026-09-01');
      await rate('USD', '2026-09-01', '25000');
      const created = await subscription(planId, {
        purchasedQuantity: 10,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });
      today('2026-09-02');

      const response = await patch(created.id, { unitPrice: { amount: '1300.00', currency: 'USD' } }).expect(422);

      expect(codeOf(response)).toBe('SUBSCRIPTION.STILL_DRAFT');
      const after = dataOf<SubscriptionWire>(await get(created.id).expect(200));
      expect(after).toMatchObject({ status: 'ACTIVE', unitPrice: USD_1200 });
      expect(after.updatedAt).toBe(created.updatedAt);
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

    it('refuses a price that is negative, too large, over-precise or in a currency the system does not know', async () => {
      const { planId } = await plan();
      const before = await n('subscriptions');

      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '-1.00', currency: 'USD' } }).expect(422)),
      ).toBe('MONEY_OUT_OF_RANGE');
      expect(
        codeOf(
          await create({ planId, kind: 'TERM', unitPrice: { amount: '10000000000000.01', currency: 'USD' } }).expect(
            422,
          ),
        ),
      ).toBe('MONEY_OUT_OF_RANGE');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '1.005', currency: 'USD' } }).expect(422)),
      ).toBe('MONEY_SCALE_EXCEEDED');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '1.5', currency: 'VND' } }).expect(422)),
      ).toBe('MONEY_SCALE_EXCEEDED');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: '10', currency: 'XYZ' } }).expect(422)),
      ).toBe('CURRENCY_NOT_SUPPORTED');
      expect(
        codeOf(await create({ planId, kind: 'TERM', unitPrice: { amount: 'abc', currency: 'USD' } }).expect(422)),
      ).toBe('VALIDATION_ERROR');
      expect(await n('subscriptions')).toBe(before);
    });
  });
});
