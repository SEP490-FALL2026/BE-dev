import { addDays } from '../../../src/core/business-date';
import { monthsBeginningIn, termEndOf, termRunOf } from '../../../src/core/term-limit';
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

  const keyPlan = async (): Promise<string> => {
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

    return key;
  };

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

  describe('the time of use in months instead of an end date (QĐ-111i, FR-2.8, INV-07)', () => {
    const year = Number(h.today().slice(0, 4));
    /** A plan of the kind asked for, with a subscription of 1 000 000 a seat a month. */
    const planOfKind = async (type: 'K1' | 'K2'): Promise<string> => h.planOf(await h.subscription(10, type));
    it('QĐ-111i: the end date is not a field of the form any more, on the preview and on the sending', async () => {
      const body = { planId: plan, businessReason: 'Design', expectedEndDate: '2027-03-31' };

      const sending = await h.submit(body, design.member.account).expect(422);
      const preview = await h
        .previewRequest({ planId: plan, expectedEndDate: '2027-03-31' }, design.member.account)
        .expect(422);

      expect(h.codeOf(sending)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(preview)).toBe('VALIDATION_ERROR');
    });

    it('QĐ-111i: K2 takes 1 to 12 months or none; the months are stored, the end date of the request stays empty', async () => {
      const twelve = await h.submit(h.form(plan, { termMonths: 12 }), design.member.account).expect(201);
      const none = await h.submit(h.form(plan, { termMonths: null }), design.head.account).expect(201);
      const many = await h.submit(h.form(plan, { termMonths: 13 }), design.member.account);
      const zero = await h.submit(h.form(plan, { termMonths: 0 }), design.member.account);

      const ids = [twelve, none].map((response) => h.dataOf<{ request: { id: string } }>(response).request.id);
      const stored = await h.ctx.sql.query<{ term_months: number | null; expected_end_date: string | null }>(
        `SELECT term_months, expected_end_date FROM access_requests WHERE id = ANY($1)`,
        [ids],
      );
      expect(stored.rows.map((row) => [row.term_months, row.expected_end_date])).toEqual(
        expect.arrayContaining([
          [12, null],
          [null, null],
        ]),
      );
      for (const refused of [many, zero]) {
        expect(refused.status).toBe(422);
        expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE');
      }
    });

    it('QĐ-111i: K1 asks for 1 to 9 months and takes no right with no end', async () => {
      const monthly = await planOfKind('K1');
      const asked = async (body: Record<string, unknown>) => h.submit(h.form(monthly, body), design.member.account);

      const none = await asked({});
      const explicitNone = await asked({ termMonths: null });
      const ten = await asked({ termMonths: 10 });
      const nine = await asked({ termMonths: 9 });

      expect([none.status, h.codeOf(none)]).toEqual([422, 'ACCESS_REQUEST.TERM_REQUIRED']);
      expect([explicitNone.status, h.codeOf(explicitNone)]).toEqual([422, 'ACCESS_REQUEST.TERM_REQUIRED']);
      expect([ten.status, h.codeOf(ten)]).toEqual([422, 'ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE']);
      expect(nine.status).toBe(201);
    });

    it('QĐ-111i: K4 is bought once and asks no time of use', async () => {
      const key = await keyPlan();

      const given = await h.submit(h.form(key, { termMonths: 3 }), design.member.account).expect(422);
      const none = await h.submit(h.form(key, {}), design.head.account);

      expect(h.codeOf(given)).toBe('ACCESS_REQUEST.TERM_NOT_ASKED');
      expect(none.status).toBe(201);
    });

    describe('T-R38: a person with a term is cut at the end of the contract, never refused for it (R-38, R-39)', () => {
      let intern: Awaited<ReturnType<SpendHarness['staff']>>;
      let contractEnd: string;

      beforeAll(async () => {
        intern = await h.staff(design.department, 'AMT-INTERN');
        contractEnd = addDays(h.today(), 75);
        await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN', contract_end_date = $2 WHERE id = $1`, [
          intern.employeeId,
          contractEnd,
        ]);
      });

      it('9 months of K2 run past the contract: 201, cut at the contract, the months that have begun counted, the amount by the year', async () => {
        const run = termRunOf({ start: h.today(), months: 9, contractEndDate: contractEnd });
        const thisYear = monthsBeginningIn({ start: h.today(), end: run.end, year });
        const nextYear = monthsBeginningIn({ start: h.today(), end: run.end, year: year + 1 });

        const preview = await h.previewed(intern, plan, { termMonths: 9 });
        const sent = await h.submit(h.form(plan, { termMonths: 9 }), intern.account);

        expect(run.cutAt).toBe(contractEnd);
        expect(preview).toMatchObject({ canSubmit: true, termRefusal: null, termMonths: 9 });
        expect(preview.cost).toMatchObject({
          termCutAt: contractEnd,
          months: run.startedMonths,
          currentYear: { year, months: thisYear, amount: { amount: String(M * thisYear) } },
        });
        if (nextYear > 0) {
          expect(preview.cost?.nextYear).toMatchObject({
            from: `${year + 1}-01-01`,
            months: nextYear,
            amount: { amount: String(M * nextYear) },
            estimate: true,
          });
        }
        expect(sent.status).toBe(201);
        const request = h.dataOf<{
          request: { cost: unknown; termMonths: number | null; expectedEndDate: string | null };
        }>(sent).request;
        expect(request).toMatchObject({
          termMonths: 9,
          expectedEndDate: null,
          cost: { termCutAt: contractEnd, months: run.startedMonths },
        });
      });

      it('a term that ends before the contract is not cut', async () => {
        const preview = await h.previewed(intern, plan, { termMonths: 1 });

        expect(preview.cost).toMatchObject({ termCutAt: null, months: 1 });
      });

      it('INV-07: a plan bought once asks no months, so a person with a term gets it with the end of their contract known, and is refused when it is not', async () => {
        const key = await keyPlan();
        const unknown = await h.staff(design.department, 'AMT-INTERN2');
        await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN' WHERE id = $1`, [unknown.employeeId]);

        const known = await h.submit(h.form(key), intern.account);
        const refused = await h.submit(h.form(key), unknown.account).expect(422);
        const preview = await h.previewed(unknown, key);

        expect(known.status).toBe(201);
        expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.TERM_LONG_TERM_NOT_ALLOWED');
        expect(preview).toMatchObject({ canSubmit: false, termRefusal: 'TERM_LONG_TERM_NOT_ALLOWED' });
      });

      it('no end for a person with a term is refused: nothing said is a missing field, null is the answer that is refused (INV-07)', async () => {
        const missing = await h.submit(h.form(plan), intern.account).expect(422);
        const longTerm = await h.submit(h.form(plan, { termMonths: null }), intern.account).expect(422);
        const preview = await h.previewed(intern, plan, { termMonths: null });

        expect(h.codeOf(missing)).toBe('ACCESS_REQUEST.TERM_REQUIRED');
        expect(h.codeOf(longTerm)).toBe('ACCESS_REQUEST.TERM_LONG_TERM_NOT_ALLOWED');
        expect(preview).toMatchObject({ canSubmit: false, termRefusal: 'TERM_LONG_TERM_NOT_ALLOWED' });
      });
    });

    it('R-46: a right with no end holds twelve months of the next year, shown in the preview with the months of this year', async () => {
      const preview = await h.previewed(design.member, plan, { termMonths: null });

      expect(preview.cost).toMatchObject({
        termCutAt: null,
        months: null,
        currentYear: { year, months: monthsLeft, amount: { amount: String(M * monthsLeft) } },
        nextYear: { from: `${year + 1}-01-01`, months: 12, amount: { amount: String(12 * M) }, estimate: true },
      });
    });

    it('P2-02: the preview shows what a year of the plan costs at the vendor beside the amount of the months left', async () => {
      const preview = await h.previewed(design.member, plan);

      expect(preview.annualVendorAmount).toEqual({ amount: String(12 * M), currency: 'VND' });
      expect(preview.pricing).toMatchObject({ months: monthsLeft, amount: { amount: String(M * monthsLeft) } });
    });
  });

  describe('RQ-2.4: the part of the year after is kept when the spend is approved (QĐ-111k, R-46)', () => {
    const year = Number(h.today().slice(0, 4));
    const approved = async (body: Record<string, unknown>): Promise<string> => {
      const sent = await h.sent(design.member, plan, body);
      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);
      // What the request kept when it was sent is made stale, as if the approval came on another day.
      await h.ctx.sql.query(`UPDATE access_requests SET next_year_amount_minor = 1 WHERE id = $1`, [sent.id]);
      await h.route(sent.id, design.head.account);
      await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

      return sent.id;
    };
    const keptOf = async (id: string): Promise<string | null> =>
      (
        await h.ctx.sql.query<{ kept: string | null }>(
          `SELECT next_year_amount_minor::text AS kept FROM access_requests WHERE id = $1`,
          [id],
        )
      ).rows[0].kept;

    it('a time of use of 6 months keeps the price of a month times the months that begin the year after, or nothing when none does', async () => {
      const run = termRunOf({ start: h.today(), months: 6, contractEndDate: null });
      const nextMonths = monthsBeginningIn({ start: h.today(), end: run.end, year: year + 1 });

      const id = await approved({ termMonths: 6 });

      expect(await keptOf(id)).toBe(nextMonths > 0 ? String(M * nextMonths) : null);
    });

    it('a right with no end keeps twelve months at the price of the day it is approved, even when it is the same amount for this year (R-46)', async () => {
      const id = await approved({ termMonths: null });

      expect(await keptOf(id)).toBe(String(12 * M));
    });

    it('the spending approver reads the cost by the year beside the estimate of tax, the part of the year after included', async () => {
      const sent = await h.sent(design.member, plan, { termMonths: null });
      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);
      await h.route(sent.id, design.head.account);

      const detail = h.dataOf<{ spendApproval: { termCost: unknown; cost: unknown } }>(
        await h.approvalOf(sent.id, h.boss.account).expect(200),
      ).spendApproval;

      expect(detail.termCost).toMatchObject({
        currentYear: { year, months: monthsLeft },
        nextYear: { from: `${year + 1}-01-01`, months: 12, amount: { amount: String(12 * M) }, estimate: true },
        termCutAt: null,
        months: null,
      });
      expect(Object.keys(detail)).toEqual(expect.arrayContaining(['cost', 'termCost']));
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

    it('L2-38, QĐ-111i: gives a time of use to a request that had none, prices it again for those months and keeps the end, as the months would end today, before and after', async () => {
      const id = await queued();

      const made = h.dataOf<{ supplement: SupplementWire }>(await file(id, { termMonths: 1 }).expect(201)).supplement;

      expect(made).toMatchObject({ number: 1, expectedEndDate: { before: null, after: termEndOf(h.today(), 1) } });
      expect(Number(made.amount.after.amount)).toBeLessThanOrEqual(Number(made.amount.before.amount));
      const request = h.dataOf<{
        request: { termMonths: number | null; expectedEndDate: string | null; pricing: { months: number } };
      }>(await h.fetch(id, design.head.account).expect(200)).request;
      expect(request).toMatchObject({ termMonths: 1, expectedEndDate: null, pricing: { months: 1 } });
    });

    it('L2-38: refuses a time of use that is not shorter than the one the request has', async () => {
      const id = await queued();
      await file(id, { termMonths: 3 }).expect(201);

      const same = await file(id, { termMonths: 3 }).expect(409);
      const longer = await file(id, { termMonths: 6 }).expect(409);

      expect(h.codeOf(same)).toBe('SPEND.SUPPLEMENT_TERM_NOT_REDUCED');
      expect(h.codeOf(longer)).toBe('SPEND.SUPPLEMENT_TERM_NOT_REDUCED');
    });

    it('L2-38: refuses a time of use that is not 1 to 12 whole months, and a file that names nothing to change', async () => {
      const id = await queued();

      const zero = await file(id, { termMonths: 0 }).expect(409);
      const far = await file(id, { termMonths: 13 }).expect(409);
      const nothing = await file(id, {}).expect(422);
      const endDate = await file(id, { expectedEndDate: addDays(h.today(), 20) }).expect(422);

      expect(h.codeOf(zero)).toBe('SPEND.SUPPLEMENT_TERM_MONTHS_OUT_OF_RANGE');
      expect(h.codeOf(far)).toBe('SPEND.SUPPLEMENT_TERM_MONTHS_OUT_OF_RANGE');
      expect(h.codeOf(nothing)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(endDate)).toBe('VALIDATION_ERROR');
    });

    it('QĐ-111i: a plan bought once takes no months, so a file that gives some is refused', async () => {
      const key = await keyPlan();
      const sent = await h.sent(design.member, key);
      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);

      const refused = await file(sent.id, { termMonths: 3 }).expect(409);

      expect(h.codeOf(refused)).toBe('SPEND.SUPPLEMENT_TERM_NOT_ASKED');
    });

    it('L2-38: a request of an older release that carries an end date takes only months that end sooner than that day', async () => {
      const id = await queued();
      await h.ctx.sql.query(`UPDATE access_requests SET term_months = NULL, expected_end_date = $2 WHERE id = $1`, [
        id,
        addDays(h.today(), 60),
      ]);

      const longer = await file(id, { termMonths: 6 }).expect(409);
      const shorter = await file(id, { termMonths: 1 }).expect(201);

      expect(h.codeOf(longer)).toBe('SPEND.SUPPLEMENT_TERM_NOT_REDUCED');
      expect(shorter.status).toBe(201);
    });

    it('L2-38: is for a request back in the queue of the head, not for one being decided', async () => {
      const sent = await h.sent(design.member, plan);

      const early = await file(sent.id, { termMonths: 1 }).expect(409);

      expect(h.codeOf(early)).toBe('SPEND.SUPPLEMENT_NOT_IN_QUEUE');
    });
  });
});
