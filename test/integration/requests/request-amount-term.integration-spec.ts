import { addDays } from '../../../src/core/business-date';
import { maxEndDateOf } from '../../../src/modules/requests/access-request/pricing.policy';
import { declareApplication, declarePlan, declareSubscription } from '../../support/builders/catalog.builder';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface SupplementWire {
  number: number;
  expectedEndDate: { before: string | null; after: string | null };
  amount: { before: { amount: string }; after: { amount: string } };
}

/**
 * The amount and the term of a request, over PostgreSQL (`BR-MF1-06`, `BR-MF1-07`, `QĐ-104a`, `QĐ-109e`, `P1-06`, `P2-02`): one amount for
 * one year, worked out from the main subscription of the plan, whichever department sends; an end date instead of months; the amount worked
 * out again at every check of the budget; a supplementary file that shortens the term.
 */
describe('the amount and the term of a request (integration, real PostgreSQL)', () => {
  let plan: string;
  let design: Awaited<ReturnType<SpendHarness['departmentWithHead']>>;

  /** The months left of the calendar year of today, the month of today counted whole (`BR-MF1-06a`). */
  const monthsLeft = 12 - Number(h.today().slice(5, 7)) + 1;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10)); // 1 000 000 VND a seat a month
    design = await h.departmentWithHead('P-AMT');
    await h.budgetFor(design, { total: 1000 * M });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const subscribe = (planId: string, over: Record<string, unknown>) =>
    declareSubscription(h.ctx, h.it1.accessToken, {
      ownerDepartmentId: h.seed.departmentId,
      planId,
      kind: 'TERM',
      billingCycle: 'MONTHLY',
      startDate: '2026-01-05',
      purchasedQuantity: 5,
      ...over,
    });

  describe('the price: the main subscription of the plan, whichever department sends (BR-MF1-07, S1-02)', () => {
    it('BR-MF1-07: with several subscriptions and no flag is the one with the highest price a month', async () => {
      const shared = await h.plan('K2');
      await subscribe(shared, { unitPrice: { amount: '1000000', currency: 'VND' } });
      await subscribe(shared, { unitPrice: { amount: '3000000', currency: 'VND' } });

      const sent = await h.sent(design.member, shared);

      expect(sent.pricing).toMatchObject({ kind: 'RECURRING', unitPrice: { amount: '3000000' }, months: monthsLeft });
      expect(sent.pricing.amount).toEqual({ amount: String(3 * M * monthsLeft), currency: 'VND' });
    });

    it('BR-MF1-07: with a subscription flagged primary is that one, whatever the others cost', async () => {
      const shared = await h.plan('K2');
      const cheap = await subscribe(shared, { unitPrice: { amount: '1000000', currency: 'VND' } });
      await subscribe(shared, { unitPrice: { amount: '3000000', currency: 'VND' } });
      await h.ctx.sql.query(`UPDATE subscriptions SET is_primary_for_plan = true WHERE id = $1`, [cheap]);

      const sent = await h.sent(design.member, shared);

      expect(sent.pricing).toMatchObject({ unitPrice: { amount: '1000000' } });
    });

    it('BR-MF1-07: a one-time price (a perpetual license, a key) is the price of the purchase, with no months (QĐ-106d)', async () => {
      const application = await declareApplication(h.ctx, h.it1.accessToken, {
        name: h.unique('Licensed'),
        kind: 'LICENSED',
        vendorName: h.unique('Vendor'),
        dataSensitivity: 'LOW',
        communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
      });
      const key = await declarePlan(h.ctx, h.it1.accessToken, {
        applicationId: application,
        name: h.unique('Key'),
        provisioningType: 'K4',
        pricingModel: 'PER_SEAT',
        controlLevel: 'FULL',
      });
      await subscribe(key, {
        kind: 'PERPETUAL',
        billingCycle: undefined,
        unitPrice: { amount: '500000', currency: 'VND' },
      });

      const sent = await h.sent(design.member, key);
      const preview = await h.previewed(design.member, key);

      expect(sent.pricing).toMatchObject({ kind: 'ONE_TIME', months: null, amount: { amount: '500000' } });
      expect(preview.annualVendorAmount).toEqual({ amount: '500000', currency: 'VND' });
    });
  });

  describe('the end date instead of the months (QĐ-104a, FR-2.8, US-05-23 AC-9)', () => {
    it('BR-MF1-06: takes the last day a right may end, a year from today less a day, and refuses the day after and a day gone by', async () => {
      const longest = maxEndDateOf(h.today());

      expect((await h.submit(h.form(plan, { expectedEndDate: longest }), design.member.account)).status).toBe(201);
      const late = await h
        .submit(h.form(plan, { expectedEndDate: addDays(longest, 1) }), design.member.account)
        .expect(422);
      const gone = await h
        .submit(h.form(plan, { expectedEndDate: addDays(h.today(), -1) }), design.member.account)
        .expect(422);

      expect(h.codeOf(late)).toBe('ACCESS_REQUEST.END_DATE_OUT_OF_RANGE');
      expect(h.detailsOf(late)).toMatchObject({ maxEndDate: longest });
      expect(h.codeOf(gone)).toBe('ACCESS_REQUEST.END_DATE_OUT_OF_RANGE');
    });

    it('FR-2.8: a contractor, a freelancer or an intern cannot send, or be previewed as able to send, with no end date', async () => {
      const intern = await h.staff(design.department, 'AMT-INTERN');
      await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN' WHERE id = $1`, [intern.employeeId]);

      const preview = await h.previewed(intern, plan);
      const refused = await h.submit(h.form(plan), intern.account).expect(422);
      const sent = await h.submit(h.form(plan, { expectedEndDate: h.today() }), intern.account);

      expect(preview).toMatchObject({ termRequired: true, canSubmit: false, maxEndDate: maxEndDateOf(h.today()) });
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.TERM_REQUIRED');
      expect(sent.status).toBe(201);
    });

    it('P2-02: the preview shows what a year of the plan costs at the vendor beside the amount of the months left', async () => {
      const preview = await h.previewed(design.member, plan);

      expect(preview.annualVendorAmount).toEqual({ amount: String(12 * M), currency: 'VND' });
      expect(preview.pricing).toMatchObject({ months: monthsLeft, amount: { amount: String(M * monthsLeft) } });
    });
  });

  describe('the amount is worked out again at every check of the budget (QĐ-109e, M-18)', () => {
    it('BR-MF1-06a: a check writes the amount of its day over the amount sent, and says so in the audit trail', async () => {
      const sent = await h.sent(design.member, plan);
      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);
      // The amount sent is made stale: another month, another price, as if the request had waited since another month.
      await h.ctx.sql.query(
        `UPDATE access_requests SET amount_minor = 1, amount_months = 12, unit_price_minor = 1 WHERE id = $1`,
        [sent.id],
      );

      const outcome = await h.route(sent.id, design.head.account);

      expect(outcome.status).toBe('ROUTED');
      const wire = await h.fetch(sent.id, design.head.account).expect(200);
      expect(h.dataOf<{ request: { pricing: unknown } }>(wire).request.pricing).toMatchObject({
        months: monthsLeft,
        amount: { amount: String(M * monthsLeft) },
        unitPrice: { amount: String(M) },
      });
      const events = (await h.auditEvents('ACCESS_REQUEST', sent.id)).filter(
        (event) => event.action === 'ACCESS_REQUEST.REPRICED',
      );
      expect(events).toHaveLength(1);
      expect(events[0].after).toMatchObject({
        trigger: 'SUBMISSION',
        checkDate: h.today(),
        beforeAmountMinor: '1',
        afterAmountMinor: String(M * monthsLeft),
      });
    });

    it('is not written again by a check that finds the same amount', async () => {
      const sent = await h.sent(design.member, plan);
      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);

      await h.route(sent.id, design.head.account);

      const events = (await h.auditEvents('ACCESS_REQUEST', sent.id)).filter(
        (event) => event.action === 'ACCESS_REQUEST.REPRICED',
      );
      expect(events).toHaveLength(0);
    });
  });

  describe('the supplementary file that shortens the term (L2-38, P1-06)', () => {
    const queued = async (): Promise<string> => {
      const sent = await h.sent(design.member, plan);
      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);

      return sent.id;
    };
    const file = (id: string, body: object) =>
      h.addSupplement(id, { reason: 'The work ends sooner', ...body }, design.head.account);

    it('L2-38: gives an end to a request that had none, prices it again to that end and keeps the end date before and after', async () => {
      const id = await queued();

      const made = h.dataOf<{ supplement: SupplementWire }>(
        await file(id, { expectedEndDate: h.today() }).expect(201),
      ).supplement;

      expect(made).toMatchObject({ number: 1, expectedEndDate: { before: null, after: h.today() } });
      expect(Number(made.amount.after.amount)).toBeLessThanOrEqual(Number(made.amount.before.amount));
      const request = h.dataOf<{ request: { expectedEndDate: string | null; pricing: { months: number } } }>(
        await h.fetch(id, design.head.account).expect(200),
      ).request;
      expect(request).toMatchObject({ expectedEndDate: h.today(), pricing: { months: 1 } });
    });

    it('L2-38: refuses an end date that is not earlier than the one the request has', async () => {
      const id = await queued();
      await file(id, { expectedEndDate: addDays(h.today(), 20) }).expect(201);

      const same = await file(id, { expectedEndDate: addDays(h.today(), 20) }).expect(409);
      const later = await file(id, { expectedEndDate: addDays(h.today(), 30) }).expect(409);

      expect(h.codeOf(same)).toBe('SPEND.SUPPLEMENT_TERM_NOT_REDUCED');
      expect(h.codeOf(later)).toBe('SPEND.SUPPLEMENT_TERM_NOT_REDUCED');
    });

    it('L2-38: refuses an end date before today or more than a year from today, and a file that names nothing to change', async () => {
      const id = await queued();

      const gone = await file(id, { expectedEndDate: addDays(h.today(), -1) }).expect(409);
      const far = await file(id, { expectedEndDate: addDays(maxEndDateOf(h.today()), 1) }).expect(409);
      const nothing = await file(id, {}).expect(422);

      expect(h.codeOf(gone)).toBe('SPEND.SUPPLEMENT_END_DATE_OUT_OF_RANGE');
      expect(h.codeOf(far)).toBe('SPEND.SUPPLEMENT_END_DATE_OUT_OF_RANGE');
      expect(h.codeOf(nothing)).toBe('VALIDATION_ERROR');
    });

    it('L2-38: is for a request back in the queue of the head, not for one being decided', async () => {
      const sent = await h.sent(design.member, plan);

      const early = await file(sent.id, { expectedEndDate: h.today() }).expect(409);

      expect(h.codeOf(early)).toBe('SPEND.SUPPLEMENT_NOT_IN_QUEUE');
    });
  });
});
