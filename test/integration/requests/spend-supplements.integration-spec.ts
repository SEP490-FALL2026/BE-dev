import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface SupplementWire {
  number: number;
  reason: string;
  changedBy: { employeeId: string };
  expectedSpendOn: { before: string; after: string };
  budgetYear: { before: number; after: number };
  amount: { before: { amount: string }; after: { amount: string } };
}

describe('the supplementary file of the head over PostgreSQL (US-06-14 AC-13, AC-15; US-05-04 AC-16)', () => {
  let plan: string;
  let design: Unit;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10)); // 1 000 000 VND a seat a month
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    design = await h.departmentWithHead('P-DES');
    await h.budgetFor(design, { total: 1000 * M });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A request whose money was to go out in a year that has ended: it stopped when it was sent on. */
  const closed = async () => {
    const id = await h.paidRequest(design, plan, { year: h.year - 1, dueOn: `${h.year - 1}-12-20`, amount: 20 * M });
    await h.sendOn([id], design.head.account).expect(201);

    return id;
  };
  const supplement = (id: string, body: object = {}, account = design.head.account) =>
    h.addSupplement(
      id,
      { expectedSpendOn: `${h.year}-11-15`, reason: 'The purchase moved to this year', ...body },
      account,
    );
  const history = async (id: string, account = design.head.account) =>
    h.dataOf<{ items: SupplementWire[] }>(await h.supplements(id, account).expect(200)).items;
  const checks = async (id: string) =>
    (
      await h.ctx.sql.query<{ number: number; route: string }>(
        `SELECT number, route FROM request_budget_checks WHERE request_id = $1 ORDER BY number`,
        [id],
      )
    ).rows;

  describe('a year that has ended (AC-15)', () => {
    it('changes the day, prices the request again for it and keeps what it was before and after', async () => {
      const id = await closed();

      const response = await supplement(id).expect(201);

      expect(h.dataOf<{ supplement: SupplementWire }>(response).supplement).toMatchObject({
        number: 1,
        reason: 'The purchase moved to this year',
        changedBy: { employeeId: design.head.employeeId },
        expectedSpendOn: { before: `${h.year - 1}-12-20`, after: `${h.year}-11-15` },
        budgetYear: { before: h.year - 1, after: h.year },
        // What the plan costs for the term, which is what the request is priced at once the day changes.
        amount: { before: { amount: String(20 * M) }, after: { amount: String(1 * M) } },
      });
      expect(await history(id)).toHaveLength(1);
      const request = h.dataOf<{ request: { expectedSpendOn: string; budgetYear: number } }>(
        await h.fetch(id, design.head.account).expect(200),
      ).request;
      expect(request).toMatchObject({ expectedSpendOn: `${h.year}-11-15`, budgetYear: h.year });
    });

    it('is checked again as a whole when the head sends it on, on the budget of the new year, and the first check stays', async () => {
      const id = await closed();
      await supplement(id).expect(201);

      // The line chosen for the year that ended no longer fits: the head chooses again before it can go.
      const first = await h.sendOn([id], design.head.account).expect(201);
      const stopped = h.dataOf<{ items: Array<{ outcome: string; stopReason: string | null }> }>(
        await h.batchItems(h.dataOf<{ batch: { id: string } }>(first).batch.id, design.head.account).expect(200),
      ).items;
      expect(stopped).toEqual([expect.objectContaining({ outcome: 'STOPPED', stopReason: 'PLAN_LINE_REQUIRED' })]);

      await h.setPlanLine(id, { planLine: { position: 1 } }, design.head.account).expect(200);
      const second = h.dataOf<{ batch: { id: string } }>(await h.sendOn([id], design.head.account).expect(201)).batch;
      const items = h.dataOf<{ items: Array<{ outcome: string }> }>(
        await h.batchItems(second.id, design.head.account).expect(200),
      ).items;

      expect(items).toEqual([expect.objectContaining({ outcome: 'SENT_TO_APPROVER' })]);
      expect(await checks(id)).toEqual([
        expect.objectContaining({ number: 1, route: 'BLOCKED' }),
        expect.objectContaining({ number: 2, route: 'SPEND_APPROVAL' }),
      ]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
    });

    it('keeps every supplementary file, the oldest first, and numbers them', async () => {
      const id = await closed();
      await supplement(id, { expectedSpendOn: `${h.year}-11-15` }).expect(201);
      await supplement(id, { expectedSpendOn: `${h.year}-12-02`, reason: 'A month later' }).expect(201);

      const items = await history(id);

      expect(items.map((item) => [item.number, item.expectedSpendOn.before, item.expectedSpendOn.after])).toEqual([
        [1, `${h.year - 1}-12-20`, `${h.year}-11-15`],
        [2, `${h.year}-11-15`, `${h.year}-12-02`],
      ]);
    });
  });

  describe('what it needs and who makes it', () => {
    it.each([
      ['no reason', { reason: undefined }],
      ['a blank reason', { reason: '   ' }],
      ['no day', { expectedSpendOn: undefined }],
      ['a day that is not a day', { expectedSpendOn: '2026-02-30' }],
      ['a field that is not there', { amount: 5 }],
    ])('is not made with %s', async (_name, over) => {
      const id = await closed();

      const response = await supplement(id, over).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await history(id)).toEqual([]);
    });

    it('is not made to the day it already is, and nothing is written', async () => {
      const id = await closed();

      const response = await supplement(id, { expectedSpendOn: `${h.year - 1}-12-20` }).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.SUPPLEMENT_NO_CHANGE');
      expect(await history(id)).toEqual([]);
    });

    it('is the only way to change the day once the request is sent on: it is not made while the request is decided (US-05-04 AC-16)', async () => {
      const id = await h.paidRequest(design, plan, { amount: 10 * M });
      await h.sendOn([id], design.head.account).expect(201);

      const response = await supplement(id).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.SUPPLEMENT_NOT_IN_QUEUE');
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
    });

    it('is only for the head of the department of the request', async () => {
      const id = await closed();
      const other = await h.departmentWithHead('P-OTH');

      await supplement(id, {}, other.head.account).expect(404);
      await supplement(id, {}, design.member.account).expect(403);
      await supplement(id, {}, h.finance).expect(403);
      await supplement(id, {}, h.boss.account).expect(404);
      expect(await history(id)).toEqual([]);
    });

    it('is read by the people who may read the request, and by nobody else', async () => {
      const id = await closed();
      await supplement(id).expect(201);

      await h.supplements(id, design.member.account).expect(200);
      await h.supplements(id, design.head.account).expect(200);
      await h.supplements(id, h.finance).expect(404);
      await h.supplements(id, h.boss.account).expect(404);
    });

    it('is not made for a request that has no price', async () => {
      const id = await closed();
      await h.ctx.sql.query(
        `UPDATE access_requests SET pricing_status = 'MISSING', price_missing_reason = 'AWAITING_QUOTE', amount_minor = NULL, amount_currency = NULL, unit_price_minor = NULL, billing_cycle = NULL, payment_schedule = NULL WHERE id = $1`,
        [id],
      );

      const response = await supplement(id).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.SUPPLEMENT_NOT_PRICED');
    });
  });
});
