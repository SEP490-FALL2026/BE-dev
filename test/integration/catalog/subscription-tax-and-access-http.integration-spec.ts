import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { SubscriptionHttpHarness, type SubscriptionWire, USD_1200 } from '../../support/subscription-http-harness';

describe('subscriptions and perpetual purchases over HTTP (integration, real PostgreSQL): the tax of the vendor, who may use it, declaring and changing', () => {
  const h = new SubscriptionHttpHarness();
  const {
    server,
    as,
    dataOf,
    codeOf,
    detailsOf,
    today,
    rate,
    plan,
    create,
    patch,
    get,
    complete,
    subscription,
    n,
    auditOf,
    declareProfile,
  } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('the tax of the vendor (AC-9, AC-11)', () => {
    it('AC-9: a vendor with a T2 profile gives the subscription its profile and an estimate from it, labelled as an estimate', async () => {
      const { planId, vendorId } = await plan({ vendorName: 'Figma Tax' });
      await declareProfile(vendorId as string, {
        lines: [
          { taxType: 'GTGT', ratePercent: '10', deductible: true },
          { taxType: 'TNDN nhà thầu', ratePercent: '5', deductible: false },
        ],
      }).expect(200);
      today('2026-09-01');
      await rate('USD', '2026-09-01', '25000');

      const created = await subscription(planId, {
        purchasedQuantity: 1,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });

      expect(created.taxProfile).toEqual({ status: 'DECLARED', group: 'T2' });
      expect(created.taxEstimate).toEqual({
        basis: 'PROFILE',
        label: 'ESTIMATE',
        group: 'T2',
        taxAmount: '180.00',
        deductibleTaxAmount: '120.00',
        nonDeductibleTaxAmount: '60.00',
        estimatedCost: '1260.00',
      });
      await request(server())
        .put(`/api/v1/vendors/${vendorId}/tax-profile`)
        .set(as(h.it1))
        .send({ lines: [] })
        .expect(403);
    });

    it('AC-11: a vendor with no profile: the price is stored, the tax estimate falls back on the default with its own label, and Finance sees the vendor to declare', async () => {
      const { planId, vendorId } = await plan({ vendorName: 'Miro Inc' });
      today('2026-09-01');
      await rate('USD', '2026-09-01', '25000');

      const created = await subscription(planId, {
        purchasedQuantity: 1,
        unitPrice: { amount: '800.00', currency: 'USD' },
        billingCycle: 'ANNUAL',
        startDate: '2026-09-01',
      });

      expect(created.status).toBe('ACTIVE');
      expect(created.taxProfile).toEqual({ status: 'MISSING', group: null });
      expect(created.taxEstimate).toMatchObject({
        basis: 'DEFAULT_NO_PROFILE',
        label: 'ESTIMATE_NO_PROFILE',
        group: 'T2',
        taxAmount: '120.00',
        estimatedCost: '840.00',
      });
      const missing = dataOf<{ items: Array<{ id: string }> }>(
        await request(server())
          .get('/api/v1/vendors')
          .query({ taxProfile: 'MISSING', search: 'miro', pageSize: 100 })
          .set(as(h.finance))
          .expect(200),
      ).items.map((item) => item.id);
      expect(missing).toContain(vendorId);
    });

    it('shows no tax estimate for a subscription that has no price yet', async () => {
      const { planId } = await plan();

      expect((await subscription(planId)).taxEstimate).toBeNull();
    });
  });

  describe('who may use it (AC-10)', () => {
    it('turns Finance, an employee and the Super Admin away from declaring and changing, and lets only Finance read', async () => {
      const { planId } = await plan();
      const created = await subscription(planId);
      const before = { subscriptions: await n('subscriptions'), audit: await n('audit_events') };
      const asSuperAdmin = { Authorization: `Bearer ${h.admin}` };

      for (const account of [h.finance, h.employee]) {
        await create({ planId, kind: 'TERM' }, account).expect(403);
        await patch(created.id, { purchasedQuantity: 1 }, account).expect(403);
        await complete(created.id, account).expect(403);
      }
      await request(server())
        .post('/api/v1/subscriptions')
        .set(asSuperAdmin)
        .send({ planId, kind: 'TERM' })
        .expect(403);
      await request(server())
        .patch(`/api/v1/subscriptions/${created.id}`)
        .set(asSuperAdmin)
        .send({ purchasedQuantity: 1 })
        .expect(403);
      await request(server()).post(`/api/v1/subscriptions/${created.id}/completions`).set(asSuperAdmin).expect(403);

      expect({ subscriptions: await n('subscriptions'), audit: await n('audit_events') }).toEqual(before);
      await get(created.id, h.finance).expect(200);
      await request(server()).get('/api/v1/subscriptions').set(as(h.finance)).expect(200);
      await get(created.id, h.employee).expect(403);
      await request(server()).get('/api/v1/subscriptions').set(as(h.employee)).expect(403);
    });
  });

  describe('declaring and changing', () => {
    it('refuses a K5 plan of an internal application, a plan that does not exist, and a plan of nothing', async () => {
      const internal = await plan({ kind: 'INTERNAL' });
      const before = await n('subscriptions');

      expect(codeOf(await create({ planId: internal.planId, kind: 'TERM' }).expect(422))).toBe(
        'SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION',
      );
      expect(codeOf(await create({ planId: randomUUID(), kind: 'TERM' }).expect(422))).toBe(
        'SUBSCRIPTION.PLAN_NOT_FOUND',
      );
      expect(await n('subscriptions')).toBe(before);
    });

    it.each([
      ['a start after the end', { startDate: '2027-01-01', endDate: '2026-12-31' }, 'START_AFTER_END'],
      [
        'a renewal more than a day after the end',
        { endDate: '2026-12-31', renewalDate: '2027-01-02' },
        'RENEWAL_AFTER_END_PLUS_ONE',
      ],
      [
        'a deadline after the renewal',
        { renewalDate: '2026-12-01', noticeDeadline: '2026-12-31' },
        'NOTICE_AFTER_RENEWAL',
      ],
    ])('refuses %s: 422 SUBSCRIPTION.DATES_INVALID %s', async (_name, extra, reason) => {
      const { planId } = await plan();
      const before = await n('subscriptions');

      const response = await create({ planId, kind: 'TERM', ...extra }).expect(422);

      expect(codeOf(response)).toBe('SUBSCRIPTION.DATES_INVALID');
      expect(detailsOf(response)).toEqual({ reason });
      expect(await n('subscriptions')).toBe(before);
    });

    it('changes the dates and the flags, clears an optional date with null, and answers 200 without an audit event for no change', async () => {
      const { planId } = await plan();
      const created = await subscription(planId, { endDate: '2026-12-31', noticePeriodDays: 30 });

      const changed = dataOf<SubscriptionWire>(
        await patch(created.id, { renewalDate: '2026-12-31', autoRenew: true, allowsMidTermReduction: true }).expect(
          200,
        ),
      );
      expect(changed).toMatchObject({ renewalDate: '2026-12-31', autoRenew: true });
      const cleared = dataOf<SubscriptionWire>(
        await patch(created.id, { endDate: null, noticePeriodDays: null }).expect(200),
      );
      expect(cleared).toMatchObject({ endDate: null, noticePeriodDays: null });
      const actions = (await auditOf(created.id)).length;

      await patch(created.id, { autoRenew: true }).expect(200);

      expect(await auditOf(created.id)).toHaveLength(actions);
    });

    it('answers 404 for a missing subscription, 422 for an empty change, and 422 VALIDATION_ERROR for the plan, the kind or a required field set to null', async () => {
      const { planId } = await plan();
      const created = await subscription(planId);

      expect(codeOf(await get(randomUUID()).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
      expect(codeOf(await patch(randomUUID(), { purchasedQuantity: 1 }).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
      expect(codeOf(await complete(randomUUID()).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
      expect(codeOf(await patch(created.id, {}).expect(422))).toBe('SUBSCRIPTION.UPDATE_EMPTY');
      for (const body of [
        { planId: randomUUID() },
        { kind: 'PERPETUAL' },
        { unitPrice: null },
        { purchasedQuantity: null },
        { startDate: null },
        { billingCycle: null },
      ]) {
        expect(codeOf(await patch(created.id, body).expect(422))).toBe('VALIDATION_ERROR');
      }
    });

    it('lists by application, plan, status and kind, in pages, newest last within a plan', async () => {
      const { planId, applicationId } = await plan();
      const other = await plan();
      const first = await subscription(planId);
      const second = await subscription(planId, { purchasedQuantity: 3 });
      await subscription(other.planId);

      const byApplication = dataOf<{ items: SubscriptionWire[]; pagination: { totalItems: number } }>(
        await request(server()).get('/api/v1/subscriptions').query({ applicationId }).set(as(h.it1)).expect(200),
      );
      expect(byApplication.items.map((item) => item.id)).toEqual([first.id, second.id]);
      expect(byApplication.pagination.totalItems).toBe(2);
      const drafts = dataOf<{ items: SubscriptionWire[] }>(
        await request(server())
          .get('/api/v1/subscriptions')
          .query({ planId, status: 'DRAFT', kind: 'TERM' })
          .set(as(h.finance))
          .expect(200),
      );
      expect(drafts.items).toHaveLength(2);
      const active = dataOf<{ items: SubscriptionWire[] }>(
        await request(server())
          .get('/api/v1/subscriptions')
          .query({ planId, status: 'ACTIVE' })
          .set(as(h.it1))
          .expect(200),
      );
      expect(active.items).toEqual([]);
      const paged = dataOf<{ items: SubscriptionWire[] }>(
        await request(server())
          .get('/api/v1/subscriptions')
          .query({ planId, page: 2, pageSize: 1 })
          .set(as(h.it1))
          .expect(200),
      );
      expect(paged.items.map((item) => item.id)).toEqual([second.id]);
    });

    it('queues nothing wrongly: two simultaneous completions of one draft both answer 200 and complete it once', async () => {
      const { planId } = await plan();
      today('2026-08-20');
      const created = await subscription(planId, {
        purchasedQuantity: 1,
        unitPrice: USD_1200,
        billingCycle: 'ANNUAL',
        startDate: '2026-08-01',
      });
      await rate('USD', '2026-08-20', '25000');
      jest.restoreAllMocks();

      const results = await Promise.all([complete(created.id), complete(created.id)]);

      expect(results.map((response) => response.status)).toEqual([200, 200]);
      expect((await auditOf(created.id)).filter((event) => event.action === 'SUBSCRIPTION.COMPLETED')).toHaveLength(1);
    });
  });
});
