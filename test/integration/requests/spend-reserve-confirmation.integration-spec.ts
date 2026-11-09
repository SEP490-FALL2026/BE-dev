import { BudgetCheckRepo } from '../../../src/modules/requests/spend/budget-check.repo';
import { PendingSpendContributions } from '../../../src/modules/budgets/public/budgets.extension-points';
import { StatusHarness } from '../../support/status-harness';
import type { Unit } from '../../support/spend-harness';

const h = new StatusHarness();
const M = 1_000_000;

interface ResultWire {
  requestId: string;
  outcome: string;
  stopReason: string | null;
  reserveConfirmation: string;
}
interface QueueItemWire {
  requestId: string;
  stage: string;
  budgetOutcome: string | null;
  blockedReasons: string[];
  overBy: { amount: string } | null;
}

/**
 * The three outcomes of the check, the confirmation of the reserve by the head, and what the approval makes of them over PostgreSQL
 * (BR-MF1-06e..i, BR-MF1-07c, RV-09, RV-10, RV-11, M-11, M-12, A5-2).
 */
describe('the confirmation of the reserve and the check at the decision (integration, real PostgreSQL)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** Base 100, reserve 10, 20 held and 40 spent: 40 left of the base and 50 with the reserve (millions). */
  const unit = async (extra: Record<string, number> = {}): Promise<{ u: Unit; versionId: string }> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-RC${counter}`);
    const version = await h.budgetFor(u, { total: 100 * M, reserve: 10 * M, held: 20 * M, spent: 40 * M, ...extra });

    return { u, versionId: version.id };
  };
  const approver = () => h.deciderOf();
  const results = (response: { body: unknown }) => h.dataOf<{ results: ResultWire[] }>(response as never).results;
  /** A request that uses the reserve, sent on without a line of reason: it waits in the queue of its head. */
  const usingReserve = async (u: Unit, amount = 45 * M): Promise<string> => {
    const id = await h.paidRequest(u, plan, { amount });
    const [item] = results(await h.sendOn([id], u.head.account).expect(201));
    expect(item.outcome).toBe('AWAITING_RESERVE_CONFIRMATION');

    return id;
  };
  const confirmations = async (requestId: string) =>
    (
      await h.ctx.sql.query<{
        spend_step_id: string;
        check_id: string;
        reason: string;
        confirmed_by_employee_id: string;
      }>(
        `SELECT spend_step_id, check_id, reason, confirmed_by_employee_id FROM request_reserve_confirmations WHERE request_id = $1`,
        [requestId],
      )
    ).rows;
  const checks = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ number: number; trigger: string; outcome: string | null; cost_center_id: string | null }>(
        `SELECT number, trigger::text, outcome::text, cost_center_id FROM request_budget_checks WHERE request_id = $1 ORDER BY number`,
        [requestId],
      )
    ).rows;
  const commitmentsOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ cost_center_id: string; year: number; amount_minor: string }>(
        `SELECT cost_center_id, year, amount_minor::text FROM budget_commitments WHERE request_id = $1 ORDER BY year`,
        [requestId],
      )
    ).rows;

  describe('BR-MF1-06g: a batch of three requests, one of each outcome (US-06-14 AC-9)', () => {
    it('BR-MF1-06g: sends the one within the base to the approver, keeps the one that uses the reserve in the queue and stops the blocked one, and tells the right people', async () => {
      const { u } = await unit();
      const within = await h.paidRequest(u, plan, { amount: 10 * M });
      const reserve = await h.paidRequest(u, plan, { amount: 35 * M });
      const blocked = await h.paidRequest(u, plan, { amount: 45 * M });

      const response = await h.sendOn([within, reserve, blocked], u.head.account).expect(201);

      expect(results(response)).toEqual([
        { requestId: within, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
        {
          requestId: reserve,
          outcome: 'AWAITING_RESERVE_CONFIRMATION',
          stopReason: null,
          reserveConfirmation: 'NOT_GIVEN',
        },
        { requestId: blocked, outcome: 'STOPPED', stopReason: 'OVER_RESERVE', reserveConfirmation: 'NOT_GIVEN' },
      ]);
      expect(await h.steps(within, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
      ]);
      expect(await h.steps(reserve, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.steps(blocked, 'SPEND_APPROVAL')).toEqual([]);
      expect([await h.state(within), await h.state(reserve), await h.state(blocked)]).toEqual([
        'AWAITING_SPEND_DECISION',
        'AWAITING_SPEND_SUBMISSION',
        'AWAITING_SPEND_SUBMISSION',
      ]);
      // The batch is only an envelope: the items say how each fared.
      const batchId = h.dataOf<{ batch: { id: string } }>(response).batch.id;
      const items = h.dataOf<{ items: Array<{ requestId: string; outcome: string; stopReason: string | null }> }>(
        await h.batchItems(batchId, u.head.account).expect(200),
      ).items;
      expect(items.map((item) => [item.outcome, item.stopReason])).toEqual([
        ['SENT_TO_APPROVER', null],
        ['AWAITING_RESERVE_CONFIRMATION', null],
        ['STOPPED', 'OVER_RESERVE'],
      ]);

      await h.project();
      // The one who asked is told of the one that is blocked; Finance, who has no step, is told of none of the three.
      const checkCodes = async (employeeId: string, id: string) =>
        (await h.codesFor(employeeId, id)).filter((code) => /BUDGET|RESERVE|RETURNED_AT_DECISION/.test(code));
      expect(await checkCodes(u.member.employeeId, blocked)).toEqual(['REQUEST_BUDGET_BLOCKED']);
      expect(await checkCodes(u.member.employeeId, reserve)).toEqual([]);
      for (const id of [within, reserve, blocked]) expect(await h.codesFor(h.finance.employeeId, id)).toEqual([]);
      const [notice] = await h.noticesOf(u.member.employeeId, 'REQUEST_BUDGET_BLOCKED');
      expect(notice.params).toEqual({ requestId: blocked, reasons: 'OVER_RESERVE' });
    });

    it('BR-MF1-06h, RV-11: the queue says which request needs a line of reason (the outcome a check now gives), and how far over', async () => {
      const { u } = await unit();
      const reserve = await h.paidRequest(u, plan, { amount: 45 * M });
      const blocked = await h.paidRequest(u, plan, { amount: 80 * M });
      const within = await h.paidRequest(u, plan, { amount: 5 * M });

      const items = h.dataOf<{ items: QueueItemWire[] }>(await h.spendQueue(u.head.account).expect(200)).items;
      const of = (id: string) => items.find((item) => item.requestId === id) as QueueItemWire;

      expect(of(within)).toMatchObject({ budgetOutcome: 'WITHIN_BASE', blockedReasons: [], overBy: null });
      expect(of(reserve)).toMatchObject({ budgetOutcome: 'USES_RESERVE', overBy: { amount: String(5 * M) } });
      expect(of(blocked)).toMatchObject({
        budgetOutcome: 'BLOCKED',
        blockedReasons: ['OVER_RESERVE'],
        overBy: { amount: String(30 * M) },
      });
      // Never what is left of the budget.
      expect(JSON.stringify(items)).not.toMatch(/remaining/i);
    });
  });

  describe('BR-MF1-06h: spendReserveConfirm', () => {
    it('US-06-16 AC-1: opens the spend step with the confirmation kept on it, counts the SLA from the confirmation, and the approval keeps the flag and the reason', async () => {
      const { u } = await unit();
      const id = await usingReserve(u);
      const before = new Date();

      const response = await h.confirmReserve(id, { reason: 'Cần cho đợt phát hành' }, u.head.account).expect(200);

      expect(h.dataOf<{ reserveConfirmation: object }>(response).reserveConfirmation).toEqual({
        requestId: id,
        result: 'SPEND_STEP_OPENED',
        budgetOutcome: 'USES_RESERVE',
        blockedReasons: [],
        confirmationKept: true,
      });
      const [step] = await h.steps(id, 'SPEND_APPROVAL');
      expect(step).toMatchObject({ state: 'PENDING', assignee_employee_id: h.boss.employeeId });
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      const [confirmation] = await confirmations(id);
      const stepRow = await h.ctx.sql.query<{ id: string; created_at: Date }>(
        `SELECT id, created_at FROM access_request_steps WHERE request_id = $1 AND kind = 'SPEND_APPROVAL'`,
        [id],
      );
      expect(confirmation).toMatchObject({
        spend_step_id: stepRow.rows[0].id,
        reason: 'Cần cho đợt phát hành',
        confirmed_by_employee_id: u.head.employeeId,
      });
      // The SLA of the step is counted from the confirmation: the step was made by it, not by the batch before it.
      expect(stepRow.rows[0].created_at.getTime()).toBeGreaterThanOrEqual(before.getTime() - 2000);
      expect((await checks(id)).map((check) => [check.trigger, check.outcome])).toEqual([
        ['SUBMISSION', 'USES_RESERVE'],
        ['RESERVE_CONFIRMATION', 'USES_RESERVE'],
      ]);

      // The approver sees the confirmation with the snapshot, and an approval keeps it (US-06-16 AC-24, US-06-17 AC-3).
      const detail = h.dataOf<{ spendApproval: { budgetSnapshot: Record<string, unknown> } }>(
        await h.approvalOf(id, approver()).expect(200),
      ).spendApproval.budgetSnapshot;
      expect(detail).toMatchObject({
        outcome: 'USES_RESERVE',
        reserveConfirmation: { reason: 'Cần cho đợt phát hành' },
        base: { amount: String(100 * M) },
        reserve: { amount: String(10 * M) },
      });
      await h.decideSpend(id, { decision: 'APPROVE' }, approver()).expect(200);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      const [approved] = await h.audit('ACCESS_REQUEST.SPEND_APPROVED', stepRow.rows[0].id);
      expect(approved.after).toMatchObject({ usesReserve: true, reserveReason: 'Cần cho đợt phát hành' });
      expect(await commitmentsOf(id)).toEqual([
        expect.objectContaining({ year: h.year, amount_minor: String(45 * M) }),
      ]);
    });

    it('BR-MF1-06h: is for the head of the department and nobody else: every other role, and the head of another department, are refused', async () => {
      const { u } = await unit();
      const { u: other } = await unit();
      const id = await usingReserve(u);

      for (const account of [h.it1, h.finance, u.member.account, h.boss.account]) {
        const response = await h.confirmReserve(id, { reason: 'Gấp' }, account).expect(403);
        expect(h.codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
      }
      const response = await h.confirmReserve(id, { reason: 'Gấp' }, other.head.account).expect(403);
      expect(h.codeOf(response)).toBe('SPEND.NOT_HEAD');
      expect(await confirmations(id)).toEqual([]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
    });

    it('QT 1.6: the head does not confirm what is given to them: 403 SPEND.RESERVE_CONFIRMER_IS_BENEFICIARY', async () => {
      const { u } = await unit();
      const id = await usingReserve(u);
      // Only a head who is one of the people the request is for is a party to it: the head who sent a request for their people confirms it.
      await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
        id,
        u.head.employeeId,
      ]);

      const response = await h.confirmReserve(id, { reason: 'Gấp' }, u.head.account).expect(403);

      expect(h.codeOf(response)).toBe('SPEND.RESERVE_CONFIRMER_IS_BENEFICIARY');
      expect(await confirmations(id)).toEqual([]);
    });

    it('BR-MF1-06h: answers 409 SPEND.RESERVE_NOT_PENDING for a request that does not wait for it: never checked, within the base, withdrawn', async () => {
      const { u } = await unit();
      const withdrawn = await usingReserve(u, 45 * M);
      await h.withdrawRequest(withdrawn, { reason: 'Moved to next year' }, u.head.account).expect(200);
      const unchecked = await h.paidRequest(u, plan, { amount: 45 * M });
      const within = await h.paidRequest(u, plan, { amount: 5 * M });
      await h.sendOn([within], u.head.account).expect(201);

      for (const id of [unchecked, within, withdrawn]) {
        const response = await h.confirmReserve(id, { reason: 'Gấp' }, u.head.account).expect(409);
        expect(h.codeOf(response)).toBe('SPEND.RESERVE_NOT_PENDING');
      }
      expect(await confirmations(unchecked)).toEqual([]);
      expect(await confirmations(within)).toEqual([]);
      expect(await h.steps(within, 'SPEND_APPROVAL')).toHaveLength(1);
    });

    it('BR-MF1-06h: a second confirmation of a request that was confirmed is 409, and the first stays', async () => {
      const { u } = await unit();
      const id = await usingReserve(u);
      await h.confirmReserve(id, { reason: 'Một' }, u.head.account).expect(200);

      const again = await h.confirmReserve(id, { reason: 'Hai' }, u.head.account).expect(409);

      expect(h.codeOf(again)).toBe('SPEND.RESERVE_NOT_PENDING');
      expect((await confirmations(id)).map((row) => row.reason)).toEqual(['Một']);
    });

    it('BR-MF1-06h: checks again for the day of the confirmation: when it is blocked now, the answer is 200 BLOCKED, no step is opened and nothing is kept', async () => {
      const { u, versionId } = await unit();
      const id = await usingReserve(u);
      // Between the batch and the confirmation 30 more of the year are held: what is left with the reserve is now 20.
      await h.commit(u, versionId, h.year, 30 * M, 'HELD');

      const response = await h.confirmReserve(id, { reason: 'Gấp' }, u.head.account).expect(200);

      expect(h.dataOf<{ reserveConfirmation: object }>(response).reserveConfirmation).toMatchObject({
        result: 'BLOCKED',
        budgetOutcome: 'BLOCKED',
        blockedReasons: ['OVER_RESERVE'],
        confirmationKept: false,
      });
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await confirmations(id)).toEqual([]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect((await checks(id)).map((check) => check.outcome)).toEqual(['USES_RESERVE', 'BLOCKED']);
    });

    it('DA3-01, QĐ-109e: works the amount out again for the day of the confirmation (the check writes it when it changed, ACCESS_REQUEST.REPRICED)', async () => {
      counter += 1;
      const u = await h.departmentWithHead(`P-RC${counter}`);
      // Priced by the real rule: the spec writes no amount, it only tampers with the one the request holds between the batch and the confirmation.
      const sent = await h.sent(u.member, plan, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      const amountOf = async () =>
        Number(
          (
            await h.ctx.sql.query<{ amount_minor: string }>(
              `SELECT amount_minor::text FROM access_requests WHERE id = $1`,
              [sent.id],
            )
          ).rows[0].amount_minor,
        );
      const amount = await amountOf();
      expect(amount).toBeGreaterThan(1);
      // A budget that leaves the request one over the base and within the reserve.
      await h.budgetFor(u, { total: amount - 1, reserve: amount });
      const [item] = results(await h.sendOn([sent.id], u.head.account).expect(201));
      expect(item.outcome).toBe('AWAITING_RESERVE_CONFIRMATION');
      await h.ctx.sql.query(`UPDATE access_requests SET amount_minor = amount_minor + 12345 WHERE id = $1`, [sent.id]);
      expect(await amountOf()).toBe(amount + 12345);

      await h.confirmReserve(sent.id, { reason: 'Cần' }, u.head.account).expect(200);

      expect(await amountOf()).toBe(amount);
      const repriced = (await h.audit('ACCESS_REQUEST.REPRICED', sent.id)).filter(
        (row) => row.after?.trigger === 'RESERVE_CONFIRMATION',
      );
      expect(repriced).toHaveLength(1);
      expect(repriced[0].after).toMatchObject({
        beforeAmountMinor: String(amount + 12345),
        afterAmountMinor: String(amount),
      });
    });
  });

  describe('RV-11: reserveConfirmations in the body of spendBatchSubmit', () => {
    it('applies a confirmation to the request whose check uses the reserve, and says IGNORED for one that does not: no step needs a reason within the base', async () => {
      const { u } = await unit();
      // The one within the base is checked first: what waits to be decided is deducted from what is left for the next one (BR-MF1-06f).
      const within = await h.paidRequest(u, plan, { amount: 5 * M });
      const reserve = await h.paidRequest(u, plan, { amount: 45 * M });

      const response = await h
        .sendOn([within, reserve], u.head.account, [
          { requestId: reserve, reason: 'Cần cho dự án' },
          { requestId: within, reason: 'Không cần' },
        ])
        .expect(201);

      expect(results(response)).toEqual([
        { requestId: within, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'IGNORED' },
        { requestId: reserve, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'APPLIED' },
      ]);
      expect((await confirmations(reserve)).map((row) => row.reason)).toEqual(['Cần cho dự án']);
      expect(await confirmations(within)).toEqual([]);
      expect(await h.state(reserve)).toBe('AWAITING_SPEND_DECISION');
    });

    it('says IGNORED for a confirmation given to a request that is blocked, which stays in the queue', async () => {
      const { u } = await unit();
      const blocked = await h.paidRequest(u, plan, { amount: 80 * M });

      const response = await h.sendOn([blocked], u.head.account, [{ requestId: blocked, reason: 'Gấp' }]).expect(201);

      expect(results(response)).toEqual([
        { requestId: blocked, outcome: 'STOPPED', stopReason: 'OVER_RESERVE', reserveConfirmation: 'IGNORED' },
      ]);
      expect(await confirmations(blocked)).toEqual([]);
    });

    it('answers 422 SPEND_BATCH.CONFIRMATION_NOT_IN_BATCH for a confirmation of a request that is not in the batch, and writes nothing', async () => {
      const { u } = await unit();
      const inBatch = await h.paidRequest(u, plan, { amount: 5 * M });
      const outside = await h.paidRequest(u, plan, { amount: 45 * M });
      const batchesBefore = (await h.ctx.sql.query(`SELECT 1 FROM spend_batches`)).rowCount;

      const response = await h.sendOn([inBatch], u.head.account, [{ requestId: outside, reason: 'Gấp' }]).expect(422);

      expect(h.codeOf(response)).toBe('SPEND_BATCH.CONFIRMATION_NOT_IN_BATCH');
      expect((await h.ctx.sql.query(`SELECT 1 FROM spend_batches`)).rowCount).toBe(batchesBefore);
      expect(await checks(inBatch)).toEqual([]);
      expect(await checks(outside)).toEqual([]);
      expect(await h.state(inBatch)).toBe('AWAITING_SPEND_SUBMISSION');
    });
  });

  describe('BR-MF1-06h, concurrency: two confirmations of one request', () => {
    it('keeps one: the second finds the step open and is answered 409 SPEND.RESERVE_NOT_PENDING', async () => {
      const { u } = await unit();
      const id = await usingReserve(u);

      const answers = await h.queuedOnRequest(id, [
        () => h.confirmReserve(id, { reason: 'Một' }, u.head.account),
        () => h.confirmReserve(id, { reason: 'Hai' }, u.head.account),
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([200, 409]);
      expect(h.codeOf(answers[1])).toBe('SPEND.RESERVE_NOT_PENDING');
      expect(await confirmations(id)).toHaveLength(1);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toHaveLength(1);
    });
  });

  describe('M-11: the head changes', () => {
    it('keeps the confirmation that was written, and puts what was not confirmed in the queue of the successor, who confirms it', async () => {
      const { u } = await unit();
      const confirmed = await usingReserve(u, 45 * M);
      await h.confirmReserve(confirmed, { reason: 'Của trưởng phòng cũ' }, u.head.account).expect(200);
      // 45 now waits: what is left of the base is -5 (5 with the reserve), so the next one that uses the reserve is a small one.
      const waiting = await usingReserve(u, 4 * M);
      const successor = await h.staff(u.department, `RC-S${counter}`);
      await h.makeHead(u.department, successor);

      const queue = h.dataOf<{ items: QueueItemWire[] }>(await h.spendQueue(successor.account).expect(200)).items;
      expect(queue.map((item) => item.requestId)).toContain(waiting);
      // The confirmation stays as it was written, by the head of then.
      expect((await confirmations(confirmed)).map((row) => [row.reason, row.confirmed_by_employee_id])).toEqual([
        ['Của trưởng phòng cũ', u.head.employeeId],
      ]);
      expect(await h.steps(confirmed, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
      // The old head confirms no more; the successor does.
      await h.confirmReserve(waiting, { reason: 'Gấp' }, u.head.account).expect(403);
      await h.confirmReserve(waiting, { reason: 'Của người kế nhiệm' }, successor.account).expect(200);
      expect((await confirmations(waiting)).map((row) => row.confirmed_by_employee_id)).toEqual([successor.employeeId]);
    });
  });

  describe('BR-MF1-07c, M-12, RV-09: the check at the decision', () => {
    it('BR-MF1-07c: an approval of a request that uses the reserve with no confirmation on its step goes back to the head (409 RECHECKED_RETURNED_TO_HEAD, RESERVE_UNCONFIRMED) and the requester and the head are told', async () => {
      const { u, versionId } = await unit();
      const id = await h.paidRequest(u, plan, { amount: 5 * M });
      await h.sendOn([id], u.head.account).expect(201);
      // 38 more are held after it was sent: it now uses the reserve, and nobody confirmed that on this step.
      await h.commit(u, versionId, h.year, 38 * M, 'HELD');

      const response = await h.decideSpend(id, { decision: 'APPROVE' }, approver()).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.RECHECKED_RETURNED_TO_HEAD');
      expect((response.body as { error: { details: { reasons: string[] } } }).error.details.reasons).toEqual([
        'RESERVE_UNCONFIRMED',
      ]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'CLOSED' })]);
      expect(await commitmentsOf(id)).toEqual([]);
      await h.project();
      expect(await h.codesFor(u.member.employeeId, id)).toContain('REQUEST_RETURNED_AT_DECISION');
      expect(await h.codesFor(u.head.employeeId, id)).toContain('REQUEST_RETURNED_AT_DECISION');
      expect(await h.codesFor(h.finance.employeeId, id)).toEqual([]);
    });

    it('BR-MF1-07c: an approval of a request that is blocked now goes back with the reason, no override takes it past (there is none)', async () => {
      const { u, versionId } = await unit();
      const id = await h.paidRequest(u, plan, { amount: 5 * M });
      await h.sendOn([id], u.head.account).expect(201);
      await h.commit(u, versionId, h.year, 60 * M, 'HELD');

      const response = await h.decideSpend(id, { decision: 'APPROVE' }, approver()).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.RECHECKED_RETURNED_TO_HEAD');
      expect((response.body as { error: { details: { reasons: string[] } } }).error.details.reasons).toEqual([
        'OVER_RESERVE',
      ]);
      await h
        .decideSpend(id, { decision: 'APPROVE', override: { reason: 'x', years: [h.year] } }, approver())
        .expect(422);
    });

    it('M-12, RV-09: a Cost Center that is not the one of the check before is blocked with the reason that already exists, and the commitment held before stays where it was', async () => {
      const { u } = await unit();
      const held = await h.paidRequest(u, plan, { amount: 4 * M });
      await h.sendOn([held], u.head.account).expect(201);
      await h.decideSpend(held, { decision: 'APPROVE' }, approver()).expect(200);
      const waiting = await h.paidRequest(u, plan, { amount: 6 * M });
      await h.sendOn([waiting], u.head.account).expect(201);
      const [oldCommitment] = await commitmentsOf(held);
      expect(oldCommitment.cost_center_id).toBe(u.department.unitId);

      // The department is charged to another Cost Center from now on, which has no approved budget.
      await h.ctx.sql.query(`UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
        u.department.unitId,
      ]);
      await h.ctx.sql.query(
        `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, department_id, linked_at)
         VALUES (gen_random_uuid(), $1, $2, 'Replacement', 'UNIT', 'ACTIVE', $3, now())`,
        [h.seed.organizationId, `CC-M12-${counter}`, u.department.id],
      );

      const response = await h.decideSpend(waiting, { decision: 'APPROVE' }, approver()).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.RECHECKED_RETURNED_TO_HEAD');
      expect((response.body as { error: { details: { reasons: string[] } } }).error.details.reasons).toEqual([
        'NO_APPROVED_BUDGET',
      ]);
      expect(await h.state(waiting)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await commitmentsOf(waiting)).toEqual([]);
      // What was held before stays in the Cost Center it was held in.
      expect(await commitmentsOf(held)).toEqual([expect.objectContaining({ cost_center_id: u.department.unitId })]);
      const [last] = (await checks(waiting)).slice(-1);
      expect(last).toMatchObject({ trigger: 'SPEND_DECISION', outcome: 'BLOCKED' });
      expect(last.cost_center_id).not.toBe(u.department.unitId);
    });
  });

  describe('A5-2 (QĐ-109b): a request that costs nothing this year', () => {
    it('reaches the approver although what is left is negative, is approved, and holds no commitment (the part of next year is the commitment of 01/01)', async () => {
      const { u } = await unit({ held: 120 * M, spent: 0 });
      const id = await h.paidRequest(u, plan, { amount: 0 });

      const [item] = results(await h.sendOn([id], u.head.account).expect(201));
      expect(item).toMatchObject({ outcome: 'SENT_TO_APPROVER' });
      await h.decideSpend(id, { decision: 'APPROVE' }, approver()).expect(200);

      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      expect(await commitmentsOf(id)).toEqual([]);
      expect(await h.audit('ACCESS_REQUEST.NO_CURRENT_YEAR_COMMITMENT', id)).toHaveLength(1);
    });
  });

  describe('RV-10, BR-MF1-06f: what waits to be decided is one definition, read by the check and by the budgets', () => {
    it('counts the request within the base whose step is open and the one that uses the reserve unconfirmed, never a blocked one, one decided or one never checked, and not the request itself', async () => {
      const { u } = await unit({ total: 10 * M, reserve: 20 * M, held: 0, spent: 0 });
      const decided = await h.paidRequest(u, plan, { amount: 5 * M });
      await h.sendOn([decided], u.head.account).expect(201);
      await h.decideSpend(decided, { decision: 'APPROVE' }, approver()).expect(200); // 5 held: 5 left of the base
      const waiting = await h.paidRequest(u, plan, { amount: 3 * M });
      const reserve = await h.paidRequest(u, plan, { amount: 8 * M });
      const blocked = await h.paidRequest(u, plan, { amount: 100 * M });
      await h.paidRequest(u, plan, { amount: 1 * M }); // never checked
      const [first, second, third] = results(await h.sendOn([waiting, reserve, blocked], u.head.account).expect(201));
      expect([first.outcome, second.outcome, third.outcome]).toEqual([
        'SENT_TO_APPROVER',
        'AWAITING_RESERVE_CONFIRMATION',
        'STOPPED',
      ]);

      const repo = h.ctx.app.get(BudgetCheckRepo, { strict: false });
      const contributions = h.ctx.app.get(PendingSpendContributions, { strict: false });
      const costCenter = u.department.unitId;

      expect(await repo.pendingFor(costCenter, h.year, null)).toBe(BigInt(11 * M));
      expect(await repo.pendingFor(costCenter, h.year, waiting)).toBe(BigInt(8 * M));
      expect(await repo.pendingFor(costCenter, h.year, reserve)).toBe(BigInt(3 * M));
      // The budgets read the same number through the extension point the requests add themselves to.
      expect(contributions.names()).toContain('requests.pending-spend');
      expect(await contributions.total(costCenter, h.year)).toBe(BigInt(11 * M));
      // Another year, and another Cost Center, wait for nothing.
      expect(await repo.pendingFor(costCenter, h.year + 1, null)).toBe(0n);
      expect(await repo.pendingFor((await unit()).u.department.unitId, h.year, null)).toBe(0n);
    });
  });
});
