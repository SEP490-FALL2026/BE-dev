import { GroupHarness, type Colleague } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;

interface Detail {
  spendApproval: { step: { state: string }; request: { beneficiary: unknown; lineCount: number } };
}
interface Refused {
  error: { code: string; details?: { lines?: string[]; missing?: string[]; extra?: string[]; years?: number[] } };
}

describe('the spend of the people of a request for a group, decided one by one over PostgreSQL (US-05-17 AC-9, US-06-01 AC-15)', () => {
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(100));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-S${counter}`);
  };
  const approve = (employeeId: string) => ({ employeeId, decision: 'APPROVE' });
  const refuse = (employeeId: string, reason = 'Not this quarter') => ({ employeeId, decision: 'REJECT', reason });

  /** A department with room in its budget for this year and the next, and a group of people the head sent on for the approver. */
  const waiting = async (count = 5, extra: { total?: number; members?: (u: Unit) => Promise<Colleague[]> } = {}) => {
    const u = await unit();
    const total = extra.total ?? 100_000 * M;
    await h.budgetFor(u, { total });
    await h.budgetFor(u, { total, year: h.next });
    const people = extra.members ? await extra.members(u) : await h.colleagues(u, count);
    const sent = h.dataOf<{ request: { id: string } }>(
      await h.submitGroup(h.groupBody(paid, people), u.head.account).expect(201),
    ).request;
    await h.sendOn([sent.id], u.head.account).expect(201);

    return { u, people, id: sent.id };
  };
  const total = (rows: Array<{ amount_minor: string }>) =>
    rows.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);

  describe('the approver decides the people with one record, one check and one commitment for each year (AC-9, AC-15)', () => {
    it('approves four of five and refuses one: one record, five decisions, a commitment for each year that adds up to what four cost, and a share for each of the four', async () => {
      const { u, people, id } = await waiting(5);
      const [e1, e2, e3, e4, e5] = people;

      const decided = await h
        .decideSpendLines(
          id,
          { lines: [...[e1, e2, e3, e4].map((p) => approve(p.employeeId)), refuse(e5.employeeId)] },
          h.boss.account,
        )
        .expect(200);

      expect(h.dataOf<Detail>(decided).spendApproval.request).toMatchObject({ beneficiary: null, lineCount: 5 });
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'SPEND_REJECTED']);
      const records = await h.ctx.sql.query(`SELECT 1 FROM spend_decisions WHERE request_id = $1`, [id]);
      expect(records.rowCount).toBe(1);
      const decisions = await h.ctx.sql.query<{ stage: string; decision: string }>(
        `SELECT stage::text, decision::text FROM access_request_line_decisions WHERE request_id = $1 AND stage = 'SPEND' ORDER BY employee_id`,
        [id],
      );
      expect(decisions.rowCount).toBe(5);
      expect(decisions.rows.filter((row) => row.decision === 'REJECTED')).toHaveLength(1);

      // What four people cost, however many fiscal years the twelve monthly payments fall in: more than the payments, which carry
      // the tax that is not deducted, and the commitments of the years add up to the shares of the four.
      const commitments = await h.commitments(id);
      expect(commitments.length).toBeGreaterThanOrEqual(1);
      expect(total(commitments)).toBeGreaterThanOrEqual(BigInt(4 * 12 * M));
      const shares = await h.shares(id);
      expect(total(shares)).toBe(total(commitments));
      expect(new Set(shares.map((share) => share.employee_id)).size).toBe(4);
      for (const commitment of commitments) {
        expect(total(shares.filter((share) => share.budget_year === commitment.year))).toBe(
          BigInt(commitment.amount_minor),
        );
      }
      expect(u.head.employeeId).toBeDefined();
    });

    it('holds nothing when every person is refused, and ends the request as refused', async () => {
      const { people, id } = await waiting(3);

      await h.decideSpendLines(id, { lines: people.map((p) => refuse(p.employeeId)) }, h.boss.account).expect(200);

      expect(await h.state(id)).toBe('REJECTED');
      expect(await h.lineStates(id)).toEqual(['SPEND_REJECTED', 'SPEND_REJECTED', 'SPEND_REJECTED']);
      expect(await h.commitments(id)).toEqual([]);
      expect(await h.shares(id)).toEqual([]);
    });

    it('divides a year that does not divide by the people among them, the remainder to the first, so the shares are what is held', async () => {
      const { people, id } = await waiting(3);

      await h.decideSpendLines(id, { lines: people.map((p) => approve(p.employeeId)) }, h.boss.account).expect(200);

      const commitments = await h.commitments(id);
      const shares = await h.shares(id);
      for (const commitment of commitments) {
        const mine = shares
          .filter((share) => share.budget_year === commitment.year)
          .map((share) => BigInt(share.amount_minor));
        expect(mine.reduce((sum, value) => sum + value, 0n)).toBe(BigInt(commitment.amount_minor));
        expect(mine[0] - mine[mine.length - 1]).toBeLessThanOrEqual(1n);
      }
    });

    it('asks for every person whose need is confirmed, once, and a reason for each refusal', async () => {
      const { people, id } = await waiting(3);
      const [e1, e2, e3] = people;

      const missing = await h.decideSpendLines(id, { lines: [approve(e1.employeeId)] }, h.boss.account).expect(422);
      const noReason = await h
        .decideSpendLines(
          id,
          {
            lines: [approve(e1.employeeId), approve(e2.employeeId), { employeeId: e3.employeeId, decision: 'REJECT' }],
          },
          h.boss.account,
        )
        .expect(422);

      expect((missing.body as Refused).error).toMatchObject({ code: 'GROUP_REQUEST.LINES_MISMATCH' });
      expect(h.codeOf(noReason)).toBe('VALIDATION_ERROR');
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.lineStates(id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_CONFIRMED']);
    });

    it('refuses the years that lack the money, and takes no override to get past them (QĐ-97c)', async () => {
      const { people, id } = await waiting(2, { total: 1 * M });
      const all = people.map((p) => approve(p.employeeId));
      // Less money than it costs sends it to Finance first; the approver still cannot approve past the years that lack it.
      await h
        .completeReview(id, { outcome: 'ASSESSED', opinion: 'No room: accepted', direction: 'RECOMMEND_OVERRIDE' })
        .expect(200);

      const refused = await h.decideSpendLines(id, { lines: all }, h.boss.account).expect(422);
      const years = (refused.body as Refused).error.details?.years ?? [];
      expect(h.codeOf(refused)).toBe('SPEND.OVERRIDE_REQUIRED');
      expect(years.length).toBeGreaterThanOrEqual(1);
      expect(await h.commitments(id)).toEqual([]);

      // The exception is gone: a body that carries one is not a body.
      const withOverride = await h
        .decideSpendLines(id, { lines: all, override: { reason: 'The project cannot wait', years } }, h.boss.account)
        .expect(422);
      expect(h.codeOf(withOverride)).toBe('VALIDATION_ERROR');
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.commitments(id)).toEqual([]);
    });

    it('is not for anybody but the person the step is given to, nor for one of the people', async () => {
      const { u, people, id } = await waiting(2);
      const all = people.map((p) => approve(p.employeeId));

      expect(h.codeOf(await h.decideSpendLines(id, { lines: all }, h.finance).expect(403))).toBe(
        'SPEND.NOT_THE_ASSIGNEE',
      );
      expect(h.codeOf(await h.decideSpendLines(id, { lines: all }, u.head.account).expect(403))).toBe(
        'SPEND.OWN_REQUEST',
      );
      expect(h.codeOf(await h.decideSpendLines(id, { lines: all }, people[0].account).expect(403))).toBe(
        'SPEND.OWN_REQUEST',
      );
    });

    it('refuses the decision of one person and the decision of a batch on a request for a group', async () => {
      const { u, people, id } = await waiting(2);
      const queue = h.dataOf<{ items: Array<{ requestId: string; batchId: string | null }> }>(
        await h.approvals(h.boss.account, { pageSize: 100 }).expect(200),
      ).items;
      const batchId = queue.find((item) => item.requestId === id)?.batchId as string;

      const single = await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(409);
      const batch = await h.decideBatch(batchId, { decision: 'APPROVE', requestIds: [id] }, h.boss.account).expect(200);

      expect(h.codeOf(single)).toBe('ACCESS_REQUEST.GROUP_USES_LINES');
      expect(h.dataOf<{ results: Array<{ outcome: string; reason: string | null }> }>(batch).results).toEqual([
        expect.objectContaining({ requestId: id, outcome: 'SKIPPED', reason: 'GROUP_NEEDS_LINES' }),
      ]);
      expect(await h.lineStates(id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED']);
      expect(people).toHaveLength(2);
      expect(u.head.employeeId).toBeDefined();
    });
  });

  describe('how the queues and the panel read a group (US-05-17)', () => {
    it('shows a group in the queue of the head and in the queue of the approver as one row of many people, with no one person it is for', async () => {
      const u = await unit();
      await h.roomFor(u);
      const people = await h.colleagues(u, 3);
      const id = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(paid, people), u.head.account).expect(201),
      ).request.id;

      const queued = h
        .dataOf<{ items: Array<{ requestId: string; beneficiary: unknown; lineCount: number }> }>(
          await h.spendQueue(u.head.account).expect(200),
        )
        .items.find((item) => item.requestId === id);
      await h.sendOn([id], u.head.account).expect(201);
      const waitingRow = h
        .dataOf<{ items: Array<{ requestId: string; beneficiary: unknown; lineCount: number }> }>(
          await h.approvals(h.boss.account, { pageSize: 100 }).expect(200),
        )
        .items.find((item) => item.requestId === id);
      const panel = h.dataOf<Detail>(await h.approvalOf(id, h.boss.account).expect(200));
      const lines = h.dataOf<{ items: Array<{ employee: { employeeId: string }; cost: { amount: string } | null }> }>(
        await h.linesOf(id, h.boss.account).expect(200),
      ).items;

      expect(queued).toMatchObject({ beneficiary: null, lineCount: 3 });
      expect(waitingRow).toMatchObject({ beneficiary: null, lineCount: 3 });
      expect(panel.spendApproval.request).toMatchObject({ beneficiary: null, lineCount: 3 });
      expect(lines.map((line) => [line.employee.employeeId, line.cost?.amount])).toEqual(
        people.map((person) => [person.employeeId, '12000000']),
      );
    });
  });

  describe('the spending approver among the people (US-06-08 AC-10, US-05-17 AC-18, D-S21)', () => {
    it('is never a line, so no step is given to a substitute: the group of the others goes to the spending approver, who decides it', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100_000 * M });
      await h.budgetFor(u, { total: 100_000 * M, year: h.next });
      const [e1, e2] = await h.colleagues(u, 2);
      const approver = await h.colleague(u);
      await h.setRole('SPENDING_APPROVER', approver);
      try {
        const refused = await h.submitGroup(h.groupBody(paid, [e1, e2, approver]), u.head.account).expect(422);
        expect(h.codeOf(refused)).toBe('GROUP_REQUEST.LINES_REFUSED');
        expect(h.detailsOf(refused)).toEqual({
          lines: [{ employeeId: approver.employeeId, reason: 'SPENDING_APPROVER' }],
        });

        const sent = h.dataOf<{ request: { id: string } }>(
          await h.submitGroup(h.groupBody(paid, [e1, e2]), u.head.account).expect(201),
        ).request;
        await h.sendOn([sent.id], u.head.account).expect(201);

        const steps = await h.steps(sent.id, 'SPEND_APPROVAL');
        expect(steps).toHaveLength(1);
        expect(steps[0].assignee_employee_id).toBe(approver.employeeId);
        await h
          .decideSpendLines(sent.id, { lines: [approve(e1.employeeId), approve(e2.employeeId)] }, approver.account)
          .expect(200);
        expect(await h.lineStates(sent.id)).toEqual(['APPROVED', 'APPROVED']);
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    });
  });

  describe('the same person on two steps of one request (US-06-14 AC-6)', () => {
    it('flags the need step of the line of the head as held by the person who also holds the spend step, and not the head’s own step', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100_000 * M });
      await h.budgetFor(u, { total: 100_000 * M, year: h.next });
      const [e1, e2] = await h.colleagues(u, 2);
      const sent = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(paid, [e1, e2, u.head]), u.head.account).expect(201),
      ).request;
      await h.decideLines(sent.id, { lines: [approve(u.head.employeeId)] }, h.boss.account).expect(200);
      await h.sendOn([sent.id], u.head.account).expect(201);

      const steps = await h.needSteps(sent.id);
      const spend = await h.steps(sent.id, 'SPEND_APPROVAL');

      expect(steps.map((step) => [step.assignee_employee_id, step.same_person_as_spend])).toEqual([
        [u.head.employeeId, false],
        [h.boss.employeeId, true],
      ]);
      expect(spend[0]).toMatchObject({ assignee_employee_id: h.boss.employeeId, same_person_as_spend: true });
    });
  });
});
