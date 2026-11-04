import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface RequestSpendWire {
  state: string;
  offPlan: boolean;
  planLineAttached: boolean;
  expectedSpendOn: string | null;
  budgetYear: number | null;
  pricing: { amount: { amount: string } | null };
  spend: { stage: string } | null;
}
interface SuggestionWire {
  position: number;
  description: string;
  plan: { planId: string } | null;
  overdue: boolean;
  suggested: boolean;
}

describe('the need step of a request that costs money over PostgreSQL (US-05-04 AC-11 to AC-16, US-06-14 AC-8)', () => {
  let plan: string;
  let otherPlan: string;
  let design: Unit;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    otherPlan = await h.planOf(await h.subscription(10));
    design = await h.departmentWithHead('P-DES');
    await h.budgetFor(design, {
      total: 100 * M,
      lines: [
        h.line({
          description: 'Figma Organization 10 seats',
          planId: plan,
          windowFrom: `${h.year}-12-01`,
          windowTo: `${h.year}-12-31`,
          quoteValidUntil: undefined,
        }),
        h.line({
          description: 'Another tool',
          planId: otherPlan,
          windowFrom: `${h.year}-11-01`,
          windowTo: `${h.year}-11-30`,
          quoteValidUntil: undefined,
        }),
      ],
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const sentBy = async (u: Unit, extra: Record<string, unknown> = {}) => {
    counter += 1;
    const member = await h.staff(u.department, `${u.department.code}-M${counter}`);

    return h.sent(member, plan, { termMonths: 1, ...extra });
  };
  const wire = async (id: string, account = design.head.account) =>
    h.dataOf<{ request: RequestSpendWire }>(await h.fetch(id, account).expect(200)).request;
  const decisions = async (id: string) =>
    Number(
      (await h.ctx.sql.query<{ count: string }>(`SELECT count(*) FROM approval_records WHERE request_id = $1`, [id]))
        .rows[0].count,
    );

  describe('what the head chooses when they approve (AC-12)', () => {
    it('is told the lines of the plan, those for the plan asked for first marked, and sees no figure of the budget', async () => {
      const sent = await sentBy(design);

      const response = await h.suggestions(sent.id, design.head.account).expect(200);

      const items = h.dataOf<{ items: SuggestionWire[] }>(response).items;
      expect(items).toEqual([
        expect.objectContaining({
          position: 1,
          description: 'Figma Organization 10 seats',
          suggested: true,
          overdue: false,
        }),
        expect.objectContaining({ position: 2, description: 'Another tool', suggested: false, overdue: false }),
      ]);
      expect(JSON.stringify(response.body)).not.toMatch(/remaining|committed|spent|held|INSUFFICIENT|HIGH_VALUE/);
    });

    it('keeps the line they chose, and the request goes to their queue (AC-11)', async () => {
      const sent = await sentBy(design);

      await h
        .decide(sent.id, { decision: 'APPROVE', spend: { planLine: { position: 1 } } }, design.head.account)
        .expect(200);

      expect(await wire(sent.id)).toMatchObject({
        state: 'AWAITING_SPEND_SUBMISSION',
        planLineAttached: true,
        offPlan: false,
        spend: { stage: 'NOT_SUBMITTED' },
      });
      const queue = h.dataOf<{ items: Array<{ requestId: string; readyToSubmit: boolean }> }>(
        await h.spendQueue(design.head.account, { pageSize: 100 }).expect(200),
      );
      expect(queue.items).toContainEqual(expect.objectContaining({ requestId: sent.id, readyToSubmit: true }));
      // The approver has nothing of it until the head sends it on (US-06-14 AC-2).
      await h.checkOf(sent.id, h.boss.account).expect(404);
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toEqual([]);
    });

    it('keeps "outside the plan" as a flag, and not as an exception', async () => {
      const sent = await sentBy(design);

      await h.decide(sent.id, { decision: 'APPROVE', spend: { offPlan: true } }, design.head.account).expect(200);

      expect(await wire(sent.id)).toMatchObject({
        planLineAttached: false,
        offPlan: true,
        state: 'AWAITING_SPEND_SUBMISSION',
      });
    });

    it('saves nothing when they choose neither', async () => {
      const sent = await sentBy(design);

      const response = await h
        .decide(sent.id, { decision: 'APPROVE', spend: undefined }, design.head.account)
        .expect(422);

      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.PLAN_LINE_REQUIRED');
      expect(await wire(sent.id)).toMatchObject({ state: 'PENDING', planLineAttached: false, offPlan: false });
      expect(await decisions(sent.id)).toBe(0);
    });

    it.each([
      ['both a line and outside the plan', { planLine: { position: 1 }, offPlan: true }],
      ['neither in the object', {}],
      ['a line of nothing', { planLine: { position: 0 } }],
      ['a day that is not a day', { offPlan: true, expectedSpendOn: '2026-13-40' }],
    ])('does not take %s', async (_name, spend) => {
      const sent = await sentBy(design);

      const response = await h.decide(sent.id, { decision: 'APPROVE', spend }, design.head.account).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await decisions(sent.id)).toBe(0);
    });

    it('refuses a line the plan does not have, and undoes the whole decision', async () => {
      const sent = await sentBy(design);

      const response = await h
        .decide(sent.id, { decision: 'APPROVE', spend: { planLine: { position: 9 } } }, design.head.account)
        .expect(422);

      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.LINE_NOT_FOUND');
      expect(await wire(sent.id)).toMatchObject({ state: 'PENDING', planLineAttached: false });
      expect(await decisions(sent.id)).toBe(0);
    });

    it('is not for a refusal, for software that is free, or for a person who is not the head', async () => {
      const refused = await sentBy(design);
      const free = await h.sent(await h.staff(design.department, 'P-DES-FREE'), await h.plan('K5'));
      // The spending approver decides the need of a head who asks for themselves, and chooses no line of the plan.
      const headOwn = await h.sent(design.head, plan, { termMonths: 1 });

      const refusal = await h
        .decide(refused.id, { decision: 'REJECT', reason: 'No', spend: { offPlan: true } }, design.head.account)
        .expect(422);
      const internal = await h
        .decide(free.id, { decision: 'APPROVE', spend: { offPlan: true } }, design.head.account)
        .expect(422);
      const approverChoice = await h
        .decide(headOwn.id, { decision: 'APPROVE', spend: { offPlan: true } }, h.boss.account)
        .expect(422);

      expect(h.codeOf(refusal)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(internal)).toBe('ACCESS_REQUEST.SPEND_NOT_APPLICABLE');
      expect(h.codeOf(approverChoice)).toBe('ACCESS_REQUEST.SPEND_NOT_APPLICABLE');
    });
  });

  describe('a line whose window has gone by (AC-13)', () => {
    it('is kept only when the head says it is still needed, and the request is then checked as overdue', async () => {
      const unit = await h.departmentWithHead('P-OD');
      const version = await h.budgetFor(unit, {
        total: 100 * M,
        lines: [
          h.line({
            description: 'Miro 5 seats',
            planId: plan,
            windowFrom: `${h.year}-01-01`,
            windowTo: `${h.year}-03-31`,
            quoteValidUntil: undefined,
          }),
        ],
      });
      const sent = await sentBy(unit);

      const refused = await h
        .decide(sent.id, { decision: 'APPROVE', spend: { planLine: { position: 1 } } }, unit.head.account)
        .expect(422);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.STILL_NEEDED_REQUIRED');
      expect(await decisions(sent.id)).toBe(0);
      const listed = h.dataOf<{ items: SuggestionWire[] }>(await h.suggestions(sent.id, unit.head.account).expect(200));
      expect(listed.items[0]).toMatchObject({ overdue: true });

      await h
        .decide(
          sent.id,
          { decision: 'APPROVE', spend: { planLine: { position: 1, stillNeeded: true } } },
          unit.head.account,
        )
        .expect(200);
      const batch = h.dataOf<{ batch: { id: string } }>(await h.sendOn([sent.id], unit.head.account).expect(201)).batch;
      const items = h.dataOf<{ items: Array<{ outcome: string }> }>(
        await h.batchItems(batch.id, unit.head.account).expect(200),
      ).items;

      expect(items).toEqual([expect.objectContaining({ outcome: 'SENT_TO_FINANCE' })]);
      expect(
        h.dataOf<{ budgetCheck: { planLineOverdue: boolean } }>(await h.checkOf(sent.id).expect(200)).budgetCheck,
      ).toMatchObject({
        planLineOverdue: true,
      });
      expect(version.id).toBeDefined();
    });
  });

  describe('the day the money goes out (AC-16)', () => {
    it('is corrected by the head when they approve: the budget year and the price follow, and the change is kept', async () => {
      const unit = await h.departmentWithHead('P-DT');
      await h.budgetFor(unit, {
        total: 100 * M,
        year: h.next,
        lines: [
          h.line({
            description: 'Figma next year',
            planId: plan,
            windowFrom: `${h.next}-02-01`,
            windowTo: `${h.next}-02-28`,
            quoteValidUntil: undefined,
          }),
        ],
      });
      const sent = await sentBy(unit, { expectedSpendOn: `${h.year}-12-01` });
      expect(await wire(sent.id, unit.head.account)).toMatchObject({
        expectedSpendOn: `${h.year}-12-01`,
        budgetYear: h.year,
      });

      await h
        .decide(
          sent.id,
          { decision: 'APPROVE', spend: { planLine: { position: 1 }, expectedSpendOn: `${h.next}-01-15` } },
          unit.head.account,
        )
        .expect(200);

      expect(await wire(sent.id, unit.head.account)).toMatchObject({
        expectedSpendOn: `${h.next}-01-15`,
        budgetYear: h.next,
        planLineAttached: true,
        state: 'AWAITING_SPEND_SUBMISSION',
      });
      const events = await h.ctx.sql.query<{
        after: { before: string; after: string; beforeBudgetYear: number; afterBudgetYear: number };
      }>(
        `SELECT after FROM audit_events WHERE resource_id = $1 AND action = 'ACCESS_REQUEST.EXPECTED_SPEND_DATE_CHANGED'`,
        [sent.id],
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].after).toMatchObject({
        before: `${h.year}-12-01`,
        after: `${h.next}-01-15`,
        beforeBudgetYear: h.year,
        afterBudgetYear: h.next,
      });
    });

    it('is checked against the lines of the year it falls in, not the year it was given first', async () => {
      const unit = await h.departmentWithHead('P-DY');
      await h.budgetFor(unit, { total: 100 * M }); // the lines of this year only
      const sent = await sentBy(unit, { expectedSpendOn: `${h.year}-12-01` });

      const refused = await h
        .decide(
          sent.id,
          { decision: 'APPROVE', spend: { planLine: { position: 1 }, expectedSpendOn: `${h.next}-01-15` } },
          unit.head.account,
        )
        .expect(422);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.LINE_NOT_FOUND');
      expect(await wire(sent.id, unit.head.account)).toMatchObject({
        state: 'PENDING',
        expectedSpendOn: `${h.year}-12-01`,
      });
    });
  });

  describe('a request nobody can send on in a batch (US-06-14 AC-8)', () => {
    it('waits for the head in a department with no head: no check, no spend step, no queue, and nobody decides its need in place of one (QĐ-93c)', async () => {
      const headless = await h.departmentWithUnit('P-HR');
      const member = await h.staff(headless, 'HR-E1');
      const newHead = await h.staff(headless, 'HR-H8');
      const bystander = await h.staff(await h.departmentWithUnit('P-FB'), 'FB-R0');
      const sent = await h.sent(member, plan, { termMonths: 1 });

      expect(await h.steps(sent.id, 'NEED')).toEqual([
        expect.objectContaining({ state: 'WAITING', assignee_employee_id: null, waiting_reason: 'NO_DEPARTMENT_HEAD' }),
      ]);
      expect(await h.state(sent.id)).toBe('WAITING_CONTROLLED');
      // Not the spending approver and not a person of another department can decide it: the request is not theirs to see.
      await h.decide(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(404);
      await h.decide(sent.id, { decision: 'APPROVE' }, bystander.account).expect(404);
      expect(await h.steps(sent.id, 'FINANCE_REVIEW')).toEqual([]);
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toEqual([]);

      // A head is named: the step goes to them, and they decide it; the request then waits in the queue of the head to be sent on.
      await h.makeHead(headless, newHead);
      expect(await h.steps(sent.id, 'NEED')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: newHead.employeeId, waiting_reason: null }),
      ]);
      // The head of a request that costs money chooses its line, or says it is outside the plan.
      await h.decide(sent.id, { decision: 'APPROVE', spend: { offPlan: true } }, newHead.account).expect(200);
      expect(await h.state(sent.id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(sent.id, 'FINANCE_REVIEW')).toEqual([]);
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toEqual([]);
    });

    it('goes straight to the approver when the check is in order and the approver approved the need of a head', async () => {
      const unit = await h.departmentWithHead('P-NS9');
      await h.budgetFor(unit, { total: 100 * M });

      const sent = await h.sent(unit.head, plan, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
      await h.setPayments(sent.id, { amount: 10 * M });
      const id = sent.id;

      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
      ]);
    });

    it('holds a proposal of new software of a department with no head until a head decides its need, and then goes to the IT Admin', async () => {
      const headless = await h.departmentWithUnit('P-HN');
      await h.setItAdminInCharge(headless, { employeeId: h.it1.employeeId, account: h.it1 });
      const proposed = await h.proposed(await h.staff(headless, 'HN-E1'));
      const newHead = await h.staff(headless, 'HN-H1');

      expect(await h.state(proposed.id)).toBe('WAITING_CONTROLLED');
      expect(await h.steps(proposed.id, 'IT_ASSESSMENT')).toEqual([]);

      await h.makeHead(headless, newHead);
      // The proposal costs money: the head chooses its line, or says it is outside the plan.
      await h.decide(proposed.id, { decision: 'APPROVE', spend: { offPlan: true } }, newHead.account).expect(200);

      expect(await h.state(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
    });

    it('waits in the queue of the head when the head approved it and is not the approver', async () => {
      const sent = await sentBy(design);

      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);

      expect(await h.state(sent.id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toEqual([]);
    });
  });
});
