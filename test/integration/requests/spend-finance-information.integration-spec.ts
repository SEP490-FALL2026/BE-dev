import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { BudgetInformationService } from '../../../src/modules/requests/budget-information/budget-information.service';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;
const CHECK = '23514';
const UNIQUE = '23505';
const RESTRICT = '23001';

interface QuestionWire {
  id: string;
  requestId: string;
  stepId: string;
  question: string;
  askedBy: { employeeId: string };
  state: string;
  answer: { value: string; note: string | null; answeredBy: { employeeId: string }; responseSeconds: number } | null;
  closedAt: string | null;
  closeReason: string | null;
}

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('the question of the spending approver to Finance over PostgreSQL (US-06-02, US-06-03)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-I${counter}`);
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });

    return u;
  };
  const waiting = async (u: Unit, amount = 15 * M) => h.waitingForApprover(u, plan, { amount });
  const ask = (id: string, question = 'Is there room in the budget for this?', account = h.boss.account) =>
    h.askFinance(id, { question }, account);
  const asked = async (id: string, question?: string): Promise<QuestionWire> =>
    h.dataOf<{ budgetInformation: QuestionWire }>(await ask(id, question).expect(201)).budgetInformation;
  const answer = (id: string, body: object = { answer: 'OVER_LIMIT', note: 'Over by a third' }, account = h.finance) =>
    h.answerQuestion(id, body, account);
  const approve = (id: string) => h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account);
  const stepOf = async (id: string) => {
    const { rows } = await h.ctx.sql.query<{ id: string; created_at: Date; assigned_at: Date; state: string }>(
      `SELECT id, created_at, assigned_at, state FROM access_request_steps WHERE request_id = $1 AND kind = 'SPEND_APPROVAL' ORDER BY sequence DESC LIMIT 1`,
      [id],
    );

    return rows[0];
  };
  const rowOf = async (questionId: string) => {
    const { rows } = await h.ctx.sql.query<{ state: string; close_reason: string | null; answer: string | null }>(
      `SELECT state, close_reason, answer FROM budget_information_requests WHERE id = $1`,
      [questionId],
    );

    return rows[0];
  };

  describe('asking (US-06-02 AC-1, AC-2, AC-7)', () => {
    it('reaches Finance, leaves the step with the approver and does not move its clock (AC-1)', async () => {
      const u = await unit();
      const id = await waiting(u);
      const before = await stepOf(id);

      const question = await asked(id);

      expect(question).toMatchObject({
        requestId: id,
        stepId: before.id,
        state: 'OPEN',
        answer: null,
        askedBy: { employeeId: h.boss.employeeId },
      });
      const after = await stepOf(id);
      expect(after).toMatchObject({ state: 'PENDING' });
      expect(after.created_at).toEqual(before.created_at);
      expect(after.assigned_at).toEqual(before.assigned_at);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
      ]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      const queue = h.dataOf<{ items: QuestionWire[] }>(await h.questions(h.finance, { state: 'OPEN' }).expect(200));
      expect(queue.items.map((item) => item.id)).toContain(question.id);
      const events = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE action = 'BUDGET_INFORMATION.ASKED' AND resource_id = $1`,
        [question.id],
      );
      expect(events.rowCount).toBe(1);
    });

    it('is not a gate: the approver decides with the question open, and Finance has not answered (AC-2, AC-7)', async () => {
      const u = await unit();
      const id = await waiting(u);
      const question = await asked(id);

      const view = h.dataOf<{ spendApproval: { latestBudgetInformation: QuestionWire | null } }>(
        await h.approvalOf(id, h.boss.account).expect(200),
      ).spendApproval;
      expect(view.latestBudgetInformation).toMatchObject({ id: question.id, state: 'OPEN', answer: null });
      await approve(id).expect(200);

      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      // Nobody answers in place of Finance: the question stays as it was.
      expect(await rowOf(question.id)).toMatchObject({ state: 'OPEN', answer: null });
    });

    it('is for the person who holds the pending step, once at a time, and says what it asks', async () => {
      const u = await unit();
      const id = await waiting(u);

      for (const account of [h.finance, u.head.account, h.it1, u.member.account, h.substitute.account]) {
        await ask(id, undefined, account).expect(403);
      }
      expect(h.codeOf(await ask(id, undefined, h.finance))).toBe('BUDGET_INFORMATION.NOT_THE_ASSIGNEE');
      for (const body of [
        {},
        { question: '' },
        { question: '   ' },
        { question: 'x'.repeat(2001) },
        { question: 'ok', extra: 1 },
      ]) {
        await h.askFinance(id, body, h.boss.account).expect(422);
      }
      await asked(id);
      const second = await ask(id).expect(409);
      expect(h.codeOf(second)).toBe('BUDGET_INFORMATION.ALREADY_OPEN');
    });

    it('is not put on a request with no spend step open, or one that was decided', async () => {
      const u = await unit();
      const queued = await h.paidRequest(u, plan, { amount: 15 * M });
      expect(h.codeOf(await ask(queued).expect(409))).toBe('BUDGET_INFORMATION.NO_SPEND_STEP');

      const decided = await waiting(u);
      await approve(decided).expect(200);
      expect(h.codeOf(await ask(decided).expect(409))).toBe('BUDGET_INFORMATION.NO_SPEND_STEP');
      await ask('00000000-0000-4000-8000-000000000000').expect(404);
    });
  });

  describe('answering (US-06-03 AC-1 to AC-3, AC-5)', () => {
    it('is read by the approver beside the snapshot, and changes neither the snapshot nor the step (AC-1, AC-2)', async () => {
      const u = await unit();
      const id = await waiting(u);
      const question = await asked(id);
      const yearsBefore = await h.checkYears(id, h.boss.account).expect(200);
      const stepBefore = await stepOf(id);

      const response = await answer(question.id).expect(200);

      expect(h.dataOf<{ budgetInformation: QuestionWire }>(response).budgetInformation).toMatchObject({
        id: question.id,
        state: 'ANSWERED',
        answer: { value: 'OVER_LIMIT', note: 'Over by a third', answeredBy: { employeeId: h.finance.employeeId } },
      });
      const view = h.dataOf<{
        spendApproval: { latestBudgetInformation: QuestionWire | null; step: { state: string } };
      }>(await h.approvalOf(id, h.boss.account).expect(200)).spendApproval;
      expect(view.latestBudgetInformation).toMatchObject({ state: 'ANSWERED', answer: { value: 'OVER_LIMIT' } });
      expect(view.step.state).toBe('PENDING');
      expect((await h.checkYears(id, h.boss.account).expect(200)).body).toEqual(yearsBefore.body);
      expect(await stepOf(id)).toEqual(stepBefore);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      await approve(id).expect(200);
    });

    it.each(['WITHIN_LIMIT', 'OVER_LIMIT', 'NO_BUDGET'])('takes %s, and no other value (AC-3)', async (value) => {
      const u = await unit();
      const question = await asked(await waiting(u));

      await answer(question.id, { answer: 'MAYBE' }).expect(422);
      await answer(question.id, {}).expect(422);
      await answer(question.id, { answer: value, note: 'x'.repeat(2001) }).expect(422);
      await answer(question.id, { answer: value, decision: 'APPROVE' }).expect(422);
      expect(await rowOf(question.id)).toMatchObject({ state: 'OPEN' });

      await answer(question.id, { answer: value }).expect(200);
      expect(await rowOf(question.id)).toMatchObject({ state: 'ANSWERED', answer: value });
    });

    it('is saved after the approver decided, and the decision stays (AC-5)', async () => {
      const u = await unit();
      const id = await waiting(u);
      const question = await asked(id);
      await approve(id).expect(200);

      await answer(question.id, { answer: 'WITHIN_LIMIT', note: 'Late, but within' }).expect(200);

      expect(await rowOf(question.id)).toMatchObject({ state: 'ANSWERED', answer: 'WITHIN_LIMIT' });
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      const view = h.dataOf<{ spendApproval: { decision: { decision: string } } }>(
        await h.approvalOf(id, h.boss.account).expect(200),
      ).spendApproval;
      expect(view.decision.decision).toBe('APPROVED');
    });

    it('keeps the time Finance took apart from the time the step waited (US-06-02 AC-5)', async () => {
      const u = await unit();
      const id = await waiting(u);
      const step = await stepOf(id);
      const { rows } = await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO budget_information_requests (id, request_id, step_id, asked_by_employee_id, question, asked_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Six hours ago', now() - interval '6 hours') RETURNING id`,
        [id, step.id, h.boss.employeeId],
      );

      const wire = h.dataOf<{ budgetInformation: QuestionWire }>(
        await answer(rows[0].id).expect(200),
      ).budgetInformation;

      expect(wire.answer?.responseSeconds).toBeGreaterThanOrEqual(6 * 3600);
      expect(wire.answer?.responseSeconds).toBeLessThan(6 * 3600 + 120);
      // The step has not been touched by the answer: it is still waiting and its clock still runs from when it opened.
      expect(await stepOf(id)).toMatchObject({ state: 'PENDING', created_at: step.created_at });
    });

    it('lists what one request was asked, for Finance and for the holder of its step, and for nobody else (AC-1)', async () => {
      const u = await unit();
      const id = await waiting(u);
      const first = await asked(id, 'First');
      await answer(first.id).expect(200);
      const second = await asked(id, 'Second');

      for (const account of [h.boss.account, h.finance]) {
        const listed = h.dataOf<{ items: QuestionWire[] }>(await h.questionsOf(id, account).expect(200));
        expect(listed.items.map((item) => item.id)).toEqual([first.id, second.id]);
      }
      const latest = h.dataOf<{ spendApproval: { latestBudgetInformation: QuestionWire } }>(
        await h.approvalOf(id, h.boss.account).expect(200),
      ).spendApproval.latestBudgetInformation;
      expect(latest.id).toBe(second.id);
      for (const account of [u.head.account, h.it1, u.member.account, h.substitute.account]) {
        await h.questionsOf(id, account).expect(404);
      }
    });

    it('is Finance reading and answering: nobody else lists or answers (AC-1)', async () => {
      const u = await unit();
      const question = await asked(await waiting(u));

      for (const account of [h.boss.account, u.head.account, h.it1, u.member.account]) {
        await h.questions(account).expect(403);
        expect(h.codeOf(await answer(question.id, undefined, account).expect(403))).toBeDefined();
      }
      await answer('00000000-0000-4000-8000-000000000000').expect(404);
      expect((await h.questions(h.finance, { state: 'NOPE' })).status).toBe(422);
      expect(await rowOf(question.id)).toMatchObject({ state: 'OPEN' });
    });
  });

  describe('Finance that is also the one who decides (US-06-03 AC-4)', () => {
    it('is refused when it holds the step (Finance cannot hold the role of the spending approver: QĐ-93b, US-01-03 AC-11)', async () => {
      const u = await unit();
      const id = await waiting(u);
      const question = await asked(id);
      // The step given to Finance, by a write around the application, is refused the same as before.
      await h.ctx.sql.query(`UPDATE access_request_steps SET assignee_employee_id = $2 WHERE id = $1`, [
        question.stepId,
        h.finance.employeeId,
      ]);

      expect(h.codeOf(await answer(question.id).expect(403))).toBe('BUDGET_INFORMATION.SOD_APPROVER');
      expect(await rowOf(question.id)).toMatchObject({ state: 'OPEN' });
    });
  });

  describe('a request that goes away (US-06-02 AC-4, US-06-03 AC-6, US-05-08 AC-2)', () => {
    it('closes the question that waits, with the request, and Finance can no longer answer it', async () => {
      const u = await unit();
      const id = await waiting(u);
      const question = await asked(id);

      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const information = h.ctx.app.get(BudgetInformationService, { strict: false });
      await runner.run((tx) =>
        information.closeOpen(
          tx,
          h.principal(u.head.account, ['MANAGER']),
          { id, organizationId: h.seed.organizationId },
          'REQUEST_WITHDRAWN',
          new Date(),
        ),
      );

      expect(await rowOf(question.id)).toMatchObject({ state: 'CLOSED', close_reason: 'REQUEST_WITHDRAWN' });
      const refused = await answer(question.id).expect(409);
      expect(h.codeOf(refused)).toBe('BUDGET_INFORMATION.NOT_OPEN');
      const listed = h.dataOf<{ items: QuestionWire[] }>(await h.questions(h.finance, { state: 'CLOSED' }).expect(200));
      expect(listed.items.find((item) => item.id === question.id)).toMatchObject({
        state: 'CLOSED',
        closeReason: 'REQUEST_WITHDRAWN',
        answer: null,
      });
    });

    it('is closed too when the step goes back with no decision, and an answered question stays answered', async () => {
      const u = await unit();
      const id = await h.staleRequest(u);
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date + 1 WHERE request_id = $1`,
        [id],
      );
      await h.sendOn([id], u.head.account).expect(201);
      const question = await asked(id);
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date - 1 WHERE request_id = $1`,
        [id],
      );

      await approve(id).expect(409);

      expect(await rowOf(question.id)).toMatchObject({ state: 'CLOSED', close_reason: 'STEP_CLOSED' });
      const answeredOne = await waiting(await unit());
      const kept = await asked(answeredOne);
      await answer(kept.id).expect(200);
      await approve(answeredOne).expect(200);
      expect(await rowOf(kept.id)).toMatchObject({ state: 'ANSWERED' });
    });
  });

  describe('what the database keeps (INV-05)', () => {
    const insert = (id: string, step: string, columns = '', values = '') =>
      sqlState(
        `INSERT INTO budget_information_requests (id, request_id, step_id, asked_by_employee_id, question, asked_at${columns})
         VALUES (gen_random_uuid(), $1, $2, $3, 'Question', now()${values})`,
        [id, step, h.boss.employeeId],
      );

    it('has one open question for a step, a question that says something and a state that is whole', async () => {
      const u = await unit();
      const id = await waiting(u);
      const question = await asked(id);

      expect(await insert(id, question.stepId)).toBe(UNIQUE);
      await answer(question.id).expect(200);
      expect(await insert(id, question.stepId)).toBeNull();
      expect(
        await sqlState(
          `INSERT INTO budget_information_requests (id, request_id, step_id, asked_by_employee_id, question, asked_at, state, closed_at, close_reason)
           VALUES (gen_random_uuid(), $1, $2, $3, '   ', now(), 'CLOSED', now(), 'STEP_CLOSED')`,
          [id, question.stepId, h.boss.employeeId],
        ),
      ).toBe(CHECK);
      // An answered question has its answer, its author and its time; an open one has none of them.
      expect(await insert(id, question.stepId, ', answer', ", 'OVER_LIMIT'")).toBe(CHECK);
    });

    it('is not changed or deleted once it is answered, and only ends from open', async () => {
      const u = await unit();
      const question = await asked(await waiting(u));
      await answer(question.id).expect(200);

      expect(
        await sqlState(`UPDATE budget_information_requests SET question = 'Other' WHERE id = $1`, [question.id]),
      ).toBe(RESTRICT);
      expect(
        await sqlState(`UPDATE budget_information_requests SET answer = 'NO_BUDGET' WHERE id = $1`, [question.id]),
      ).toBe(RESTRICT);
      expect(await sqlState(`DELETE FROM budget_information_requests WHERE id = $1`, [question.id])).toBe(RESTRICT);
      expect(await sqlState(`TRUNCATE budget_information_requests`)).toBe(RESTRICT);

      const open = await asked(await waiting(await unit()));
      expect(await sqlState(`UPDATE budget_information_requests SET question = 'Other' WHERE id = $1`, [open.id])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`UPDATE budget_information_requests SET asked_at = now() WHERE id = $1`, [open.id])).toBe(
        RESTRICT,
      );
    });
  });
});
