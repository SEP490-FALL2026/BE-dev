import request from 'supertest';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface YearRowWire {
  year: number;
  cost: { amount: string };
  code: string | null;
  remaining: { amount: string } | null;
  shareBasisPoints: number | null;
}

describe('the check of the budget by year over PostgreSQL (US-06-12 AC-11 to AC-18)', () => {
  let plan: string;
  let taxedPlan: string;
  let unpricedPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    taxedPlan = await h.planOf(await h.subscription(10));
    unpricedPlan = await h.plan('K2');
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    await h
      .declareTaxProfile((await h.vendorOf(taxedPlan)).id, [
        { taxType: 'GTGT', ratePercent: '10', deductible: true },
        { taxType: 'TNDN nhà thầu', ratePercent: '5', deductible: false },
      ])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-Y${counter}`);
  };
  const checked = async (requestId: string, u: Unit) => {
    const outcome = await h.route(requestId, u.head.account);
    if (outcome.status !== 'ROUTED') throw new Error(`not checkable: ${outcome.reason}`);

    return outcome;
  };
  const years = async (requestId: string) =>
    h.dataOf<{ items: YearRowWire[] }>(await h.checkYears(requestId).expect(200)).items;
  const checkWire = async (requestId: string) =>
    h.dataOf<{ budgetCheck: { outcome: string; bindingTotal: { amount: string }; yearCount: number } }>(
      await h.checkOf(requestId).expect(200),
    ).budgetCheck;
  const rows = (table: string) => h.budgetRows(table);

  describe('the year is the year of the day the money goes out (AC-11, AC-12)', () => {
    it('uses the budget of the next year for a payment in it, and leaves this year as it was (AC-11)', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M });
      const id = await h.paidRequest(u, plan, { year: h.next, amount: 10 * M });

      await checked(id, u);

      expect(await years(id)).toEqual([expect.objectContaining({ year: h.next, code: 'NO_ACTIVE_BUDGET' })]);
      const table = h.dataOf<{ items: Array<{ costCenter: { id: string }; remaining: { amount: string } }> }>(
        await h.table(h.finance, { year: h.year, pageSize: 100 }).expect(200),
      );
      expect(table.items.find((row) => row.costCenter.id === u.department.unitId)?.remaining.amount).toBe(
        String(100 * M),
      );
    });

    it('leaves what was spent in another year out of what is left, and makes no request or commitment (AC-12)', async () => {
      const u = await unit();
      const version = await h.budgetFor(u, { total: 100 * M });
      await h.commit(u, version.id, h.year - 1, 90 * M, 'EXPENSED');
      const id = await h.paidRequest(u, plan, { amount: 15 * M });
      const [requests, commitments] = [await h.requestRows(), await rows('budget_commitments')];

      await checked(id, u);

      expect((await years(id))[0]).toMatchObject({ code: 'BUDGET_OK', remaining: { amount: String(100 * M) } });
      expect([await h.requestRows(), await rows('budget_commitments')]).toEqual([requests, commitments]);
    });

    it('counts what is held and what is spent once each, and a commitment that is released not at all', async () => {
      const u = await unit();
      const version = await h.budgetFor(u, { total: 100 * M, held: 30 * M, spent: 20 * M });
      await h.ctx.sql.query(
        `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, released_minor, released_at, currency, state, attached_version_id, attached_at)
         VALUES (gen_random_uuid(), $1, $7, $2, $3, $4, $4, now(), $5, 'RELEASED', $6, now())`,
        [
          h.seed.organizationId,
          u.department.unitId,
          h.year,
          99 * M,
          h.reporting,
          version.id,
          await h.fixtureRequestId(),
        ],
      );
      const id = await h.paidRequest(u, plan, { amount: 10 * M });

      await checked(id, u);

      expect((await years(id))[0].remaining).toEqual({ amount: String(50 * M), currency: 'VND' });
      // Finance reads the same figures in the table of budgets: held and spent apart, and what is left.
      const table = h.dataOf<{ items: Array<Record<string, unknown> & { costCenter: { id: string } }> }>(
        await h.table(h.finance, { year: h.year, pageSize: 100 }).expect(200),
      );
      expect(table.items.find((row) => row.costCenter.id === u.department.unitId)).toMatchObject({
        committed: { amount: String(30 * M) },
        spent: { amount: String(20 * M) },
        remaining: { amount: String(50 * M) },
        overCommitted: false,
      });
    });
  });

  describe('a request has one amount for one year (QĐ-109; was AC-15, AC-16, AC-18 over several years)', () => {
    it('QĐ-109: checks the one year of the amount on its own slice (AC-15)', async () => {
      // Rewritten from "every year on its own slice": the schedule over years is gone, so is the year without a budget it made.
      const u = await unit();
      await h.budgetFor(u, { total: 5_000_000 });
      const id = await h.paidRequest(u, plan, { amount: 2_400_000, year: h.year });

      const outcome = await checked(id, u);

      expect(outcome.outcome).toBe('WITHIN_BASE');
      expect(await years(id)).toEqual([
        expect.objectContaining({ year: h.year, code: 'BUDGET_OK', shareBasisPoints: 4800 }),
      ]);
      expect(await checkWire(id)).toMatchObject({ bindingTotal: { amount: '2400000' }, yearCount: 1 });
    });

    it('QĐ-109: has no forecast of a later payment to check or to add to what binds (AC-18)', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M });
      const id = await h.paidRequest(u, plan, { amount: 2_400_000, year: h.year });

      const outcome = await checked(id, u);

      expect(outcome.outcome).toBe('WITHIN_BASE');
      expect(await years(id)).toEqual([expect.objectContaining({ year: h.year, code: 'BUDGET_OK' })]);
      expect(await checkWire(id)).toMatchObject({ bindingTotal: { amount: '2400000' }, yearCount: 1 });
    });
  });

  describe('what the amount costs the company (FR-3.2, QĐ-109)', () => {
    it('is the price before tax: no estimate of the tax that is not deducted is added to the amount that is checked', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M });
      const taxed = await h.paidRequest(u, taxedPlan, { amount: 20 * M });
      const plain = await h.paidRequest(u, plan, { amount: 20 * M });

      await checked(taxed, u);
      await checked(plain, u);

      expect((await years(taxed))[0].cost).toEqual({ amount: String(20 * M), currency: 'VND' });
      expect((await years(plain))[0].cost).toEqual({ amount: String(20 * M), currency: 'VND' });
    });
  });

  describe('a request that cannot be checked is not a case for the check (AC-13, AC-17)', () => {
    it('stays as it is with no check, no step and no number when it has no price', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M });
      const sent = await h.sent(u.member, unpricedPlan);
      await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);

      const outcome = await h.route(sent.id, u.head.account);

      expect(outcome).toEqual({ status: 'NOT_CHECKABLE', reason: 'PRICE_MISSING' });
      expect(await h.state(sent.id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(sent.id, 'FINANCE_REVIEW')).toEqual([]);
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toEqual([]);
      const checks = await h.ctx.sql.query(`SELECT 1 FROM request_budget_checks WHERE request_id = $1`, [sent.id]);
      expect(checks.rowCount).toBe(0);
    });

    it('is checked once the price is there, and the head did not type any amount', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M });
      const sent = await h.sent(u.member, unpricedPlan);
      await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      expect(await h.route(sent.id, u.head.account)).toMatchObject({ status: 'NOT_CHECKABLE' });

      await h.setPayments(sent.id, { amount: 10 * M });

      expect(await h.route(sent.id, u.head.account)).toMatchObject({ status: 'ROUTED', outcome: 'WITHIN_BASE' });
    });

    it('is not checked in a currency with no rate for the day, and is converted when there is one', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M });
      const id = await h.paidRequest(u, plan, { amount: 100_000, currency: 'USD' }); // 1 000 USD, written in cents

      expect(await h.route(id, u.head.account)).toEqual({ status: 'NOT_CHECKABLE', reason: 'RATE_MISSING' });
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');

      await request(h.server())
        .post('/api/v1/exchange-rates')
        .set(h.as(h.finance))
        .send({ currency: 'USD', rateDate: h.today(), rate: '25000' })
        .expect(201);
      await checked(id, u);

      expect((await years(id))[0].cost.amount).toBe(String(25_000_000));
    });
  });
});
