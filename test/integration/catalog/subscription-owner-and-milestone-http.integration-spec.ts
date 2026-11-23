import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { SubscriptionHttpHarness, type SubscriptionWire, VND_30M } from '../../support/subscription-http-harness';

/** What an annual subscription needs to be active (AC-1): the point of adjustment is only read for one that runs a period. */
const RUNNING_ANNUAL = {
  purchasedQuantity: 100,
  unitPrice: VND_30M,
  billingCycle: 'ANNUAL',
  startDate: '2026-01-01',
  autoRenew: true,
};

describe('subscriptions and perpetual purchases over HTTP (integration, real PostgreSQL): the owner department and the milestone for a cancellation', () => {
  const h = new SubscriptionHttpHarness();
  const { server, as, dataOf, codeOf, today, plan, create, patch, subscription, n, auditOf } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('a subscription has no owner department (QĐ-113g)', () => {
    it('refuses a department a caller names, on a declaration and on a change: the body takes no such field', async () => {
      const { planId } = await plan({ type: 'K1' });
      const created = await subscription(planId);

      const declared = await create({ planId, kind: 'TERM', ownerDepartmentId: randomUUID() }).expect(422);
      const changed = await patch(created.id, { ownerDepartmentId: randomUUID() }).expect(422);

      expect(codeOf(declared)).toBe('VALIDATION_ERROR');
      expect(codeOf(changed)).toBe('VALIDATION_ERROR');
      expect(Object.keys(created)).not.toContain('ownerDepartmentId');
    });

    it('F23: refuses to declare a subscription for a plan whose application is retired: 422 SUBSCRIPTION.APPLICATION_RETIRED, nothing is written', async () => {
      const { planId, applicationId } = await plan();
      await h.ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
        applicationId,
      ]);
      const before = { subscriptions: await n('subscriptions'), audit: await n('audit_events') };

      const response = await create({ planId, kind: 'TERM' }).expect(422);

      expect(codeOf(response)).toBe('SUBSCRIPTION.APPLICATION_RETIRED');
      expect({ subscriptions: await n('subscriptions'), audit: await n('audit_events') }).toEqual(before);
    });
  });

  describe('the milestone for a cancellation (US-04-03)', () => {
    it('AC-1: Figma, 100 seats, renewing 31/12, deadline 01/12, auto renewal: the deadline is used, the point of adjustment and the red alert count back from it', async () => {
      const { planId } = await plan({ vendorName: 'Figma Inc' });
      today('2026-09-01');

      const created = await subscription(planId, {
        purchasedQuantity: 100,
        unitPrice: VND_30M,
        billingCycle: 'ANNUAL',
        startDate: '2026-01-01',
        renewalDate: '2026-12-31',
        noticeDeadline: '2026-12-01',
        autoRenew: true,
      });

      expect(created).toMatchObject({
        status: 'ACTIVE',
        missingFinancialData: false,
        missing: [],
        purchasedQuantity: 100,
        noticeDeadline: { value: '2026-12-01', source: 'DECLARED' },
        alerts: { baseDate: '2026-12-01', dates: ['2026-11-01', '2026-11-24'] },
        warnings: [],
      });
      expect(await auditOf(created.id)).toEqual([
        expect.objectContaining({ action: 'SUBSCRIPTION.CREATED', before: null, actor_roles: ['IT_ADMIN'] }),
      ]);
    });

    it('AC-2: no deadline but a notice period of 30 days with renewal on 31/12 infers 01/12, unconfirmed; declaring it confirms and is audited', async () => {
      const { planId } = await plan();

      today('2026-09-01');

      const created = await subscription(planId, {
        ...RUNNING_ANNUAL,
        renewalDate: '2026-12-31',
        noticePeriodDays: 30,
      });

      expect(created.noticeDeadline).toEqual({ value: '2026-12-01', source: 'INFERRED_UNCONFIRMED' });
      expect(created.alerts).toEqual({ baseDate: '2026-12-01', dates: ['2026-11-01', '2026-11-24'] });

      const confirmed = dataOf<SubscriptionWire>(await patch(created.id, { noticeDeadline: '2026-12-01' }).expect(200));
      expect(confirmed.noticeDeadline).toEqual({ value: '2026-12-01', source: 'DECLARED' });
      // The PATCH writes UPDATED and NOTICE_DEADLINE_CONFIRMED in one transaction: compared as a set (P28-02).
      expect((await auditOf(created.id)).map((event) => event.action).sort()).toEqual([
        'SUBSCRIPTION.CREATED',
        'SUBSCRIPTION.NOTICE_DEADLINE_CONFIRMED',
        'SUBSCRIPTION.UPDATED',
      ]);
    });

    it('AC-3: auto renewal with no deadline and no notice period is not guessed: no deadline, no alert, a data-quality warning', async () => {
      const { planId } = await plan();

      const created = await subscription(planId, { endDate: '2026-12-31', autoRenew: true });

      expect(created.noticeDeadline).toEqual({ value: null, source: 'MISSING' });
      expect(created.alerts).toEqual({ baseDate: null, dates: [] });
      expect(created.warnings).toEqual(['NO_ALERT_ANCHOR']);
    });

    it('AC-7: Zoom ends 31/12 with no deadline, no notice period and no auto renewal: the point of adjustment counts from the end date, no warning', async () => {
      const { planId } = await plan({ pricing: 'FLAT_RATE', type: 'K2' });
      today('2026-09-01');

      // A plan paid by the month (R-E01): its payment day is the day of the end day in each month (R-1), so on 1/9 the next is 30/9 (the 31st of
      // December counted back by three months) and the point opens 7 days before it; the last payment day is the end day; no red alert for a plan by the month.
      const created = await subscription(planId, {
        endDate: '2026-12-31',
        autoRenew: false,
        billingCycle: 'MONTHLY',
        startDate: '2026-01-01',
        unitPrice: VND_30M,
      });

      expect(created.status).toBe('ACTIVE');
      expect(created.noticeDeadline).toEqual({ value: null, source: 'BY_END_DATE' });
      expect(created.alerts).toEqual({ baseDate: '2026-09-30', dates: ['2026-09-23'] });
      expect(created.warnings).toEqual([]);
    });

    it('F5: a K1 term has no point of adjustment, so its alerts are empty whatever its dates say (the renewal says NOT_POOL_TERM)', async () => {
      const { planId } = await plan({ pricing: 'FLAT_RATE', type: 'K1' });
      today('2026-09-01');

      const created = await subscription(planId, {
        endDate: '2026-12-31',
        autoRenew: false,
        billingCycle: 'MONTHLY',
        startDate: '2026-01-01',
        unitPrice: VND_30M,
      });

      expect(created.alerts).toEqual({ baseDate: null, dates: [] });
    });

    it('AC-12: a term with no deadline, no notice period, no auto renewal and no end date sets no milestone and warns', async () => {
      const { planId } = await plan();

      const created = await subscription(planId, { startDate: '2026-01-01' });

      expect(created.noticeDeadline).toEqual({ value: null, source: 'MISSING' });
      expect(created.alerts.dates).toEqual([]);
      expect(created.warnings).toEqual(['NO_ALERT_ANCHOR']);
    });

    it('has no alert dates for a subscription that runs no period: a draft, whatever its notice says', async () => {
      const { planId } = await plan();
      today('2026-09-01');

      const draft = await subscription(planId, {
        endDate: '2026-12-31',
        renewalDate: '2026-12-31',
        noticePeriodDays: 30,
      });

      expect(draft.status).toBe('DRAFT');
      expect(draft.noticeDeadline).toEqual({ value: '2026-12-01', source: 'INFERRED_UNCONFIRMED' });
      expect(draft.alerts).toEqual({ baseDate: null, dates: [] });
    });

    it('lists exactly the subscriptions that warn about having no anchor, whichever way the data is combined', async () => {
      const { planId } = await plan();
      const combos: Array<[string, object]> = [
        ['declared', { noticeDeadline: '2026-12-01', renewalDate: '2026-12-31' }],
        ['inferred from renewal', { noticePeriodDays: 30, renewalDate: '2026-12-31' }],
        ['inferred from end', { noticePeriodDays: 30, endDate: '2026-12-31' }],
        ['by end date', { endDate: '2026-12-31' }],
        ['auto renew no anchor', { autoRenew: true, endDate: '2026-12-31' }],
        ['notice period only', { noticePeriodDays: 30 }],
        ['notice period only and auto renew', { noticePeriodDays: 30, autoRenew: true }],
        ['nothing', {}],
        ['auto renew only', { autoRenew: true }],
      ];
      const made = new Map<string, SubscriptionWire>();
      for (const [name, extra] of combos) made.set(name, await subscription(planId, extra));

      const listed = dataOf<{ items: SubscriptionWire[] }>(
        await request(server())
          .get('/api/v1/subscriptions')
          .query({ planId, warning: 'NO_ALERT_ANCHOR', pageSize: 100 })
          .set(as(h.it1))
          .expect(200),
      ).items.map((item) => item.id);

      const warned = [...made.values()]
        .filter((item) => item.warnings.includes('NO_ALERT_ANCHOR'))
        .map((item) => item.id);
      expect([...listed].sort()).toEqual([...warned].sort());
      expect(warned).toHaveLength(5);
    });
  });
});
