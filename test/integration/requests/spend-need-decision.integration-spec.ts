import request from 'supertest';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface RequestSpendWire {
  state: string;
  budgetYear: number | null;
  pricing: { amount: { amount: string } | null };
  spend: { stage: string } | null;
}

describe('the need step of a request that costs money over PostgreSQL (US-05-04 AC-11, US-06-14 AC-8)', () => {
  let plan: string;
  let design: Unit;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    design = await h.departmentWithHead('P-DES');
    await h.budgetFor(design, { total: 100 * M });
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

  describe('what the head decides when they approve (AC-11, QĐ-101n)', () => {
    it('keeps the decision alone, and the request goes to their queue to be sent on (AC-11)', async () => {
      const sent = await sentBy(design);

      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);

      const read = await wire(sent.id);
      expect(read).toMatchObject({ state: 'AWAITING_SPEND_SUBMISSION', spend: { stage: 'NOT_SUBMITTED' } });
      // No line of the plan, no flag of "outside the plan" and no day of spending is kept on the request.
      for (const key of ['planLineAttached', 'offPlan', 'expectedSpendOn']) expect(read).not.toHaveProperty(key);
      const queue = h.dataOf<{ items: Array<{ requestId: string; readyToSubmit: boolean }> }>(
        await h.spendQueue(design.head.account, { pageSize: 100 }).expect(200),
      );
      expect(queue.items).toContainEqual(expect.objectContaining({ requestId: sent.id, readyToSubmit: true }));
      // The approver has nothing of it until the head sends it on (US-06-14 AC-2).
      await h.checkOf(sent.id, h.boss.account).expect(404);
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toEqual([]);
    });

    it('works the budget year out from today, since the head is not asked for a day of spending', async () => {
      const sent = await sentBy(design);

      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);

      expect((await wire(sent.id)).budgetYear).toBe(Number(h.today().slice(0, 4)));
    });

    it.each([
      ['a line of the plan', { planLine: { position: 1 } }],
      ['"outside the plan"', { offPlan: true }],
      ['an empty object', {}],
      ['a day of spending', { expectedSpendOn: '2026-12-01' }],
    ])('does not take %s: the object of spending is gone', async (_name, spend) => {
      const sent = await sentBy(design);

      const response = await h.decide(sent.id, { decision: 'APPROVE', spend }, design.head.account).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await wire(sent.id)).toMatchObject({ state: 'PENDING' });
      expect(await decisions(sent.id)).toBe(0);
    });

    it('does not take it with a refusal, for free software or from the approver either', async () => {
      const refused = await sentBy(design);
      const free = await h.sent(await h.staff(design.department, 'P-DES-FREE'), await h.plan('K5'));
      const headOwn = await h.sent(design.head, plan, { termMonths: 1 });
      const spend = { offPlan: true };

      const refusal = await h
        .decide(refused.id, { decision: 'REJECT', reason: 'No', spend }, design.head.account)
        .expect(422);
      const internal = await h.decide(free.id, { decision: 'APPROVE', spend }, design.head.account).expect(422);
      const byApprover = await h.decide(headOwn.id, { decision: 'APPROVE', spend }, h.boss.account).expect(422);

      for (const response of [refusal, internal, byApprover]) expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
    });

    it('has no route to choose a line of the plan or to list the lines of the plan', async () => {
      const sent = await sentBy(design);
      const as = h.as(design.head.account);

      await request(h.server()).put(`/api/v1/access-requests/${sent.id}/plan-line`).set(as).send({}).expect(404);
      await request(h.server()).get(`/api/v1/access-requests/${sent.id}/plan-line-suggestions`).set(as).expect(404);
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
      // The head of a request that costs money confirms the need alone: no line of the plan is chosen (QĐ-101n).
      await h.decide(sent.id, { decision: 'APPROVE' }, newHead.account).expect(200);
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
      await h.decide(proposed.id, { decision: 'APPROVE' }, newHead.account).expect(200);

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
