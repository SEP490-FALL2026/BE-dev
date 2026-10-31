import { GroupHarness, type LineWire } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

interface RequestWire {
  id: string;
  state: string;
  pricing: { amount: { amount: string } | null };
}
interface Refused {
  error: { code: string; details?: { lines?: string[]; missing?: string[]; extra?: string[] } };
}

describe('the need of the people of a request for a group, decided one by one over PostgreSQL (US-05-17, US-05-04 AC-14)', () => {
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

    return h.departmentWithHead(`P-N${counter}`);
  };
  const outPlan = { spend: { offPlan: true } };
  const approve = (employeeId: string) => ({ employeeId, decision: 'APPROVE' });
  const refuse = (employeeId: string, reason = 'No longer needed') => ({ employeeId, decision: 'REJECT', reason });
  const lineList = async (id: string, account: Parameters<GroupHarness['linesOf']>[1]) =>
    h.dataOf<{ items: LineWire[] }>(await h.linesOf(id, account).expect(200)).items;

  /** E1, E2, E3 and the head's department, with a request sent by E1 for the three. */
  const sentByEmployee = async () => {
    const u = await unit();
    const [e1, e2, e3] = await h.colleagues(u, 3);
    const request = h.dataOf<{ request: RequestWire }>(
      await h.submitGroup(h.groupBody(paid, [e1, e2, e3]), e1.account).expect(201),
    ).request;

    return { u, e1, e2, e3, request };
  };

  describe('the head decides the people of the step (AC-4, US-05-04 AC-14)', () => {
    it('approves two and refuses one with a reason: the two go on, priced again for two, and the one is told why', async () => {
      const { u, e1, e2, e3, request } = await sentByEmployee();

      const decided = await h
        .decideLines(
          request.id,
          { lines: [approve(e1.employeeId), approve(e2.employeeId), refuse(e3.employeeId)], ...outPlan },
          u.head.account,
        )
        .expect(200);

      expect(h.dataOf<{ request: RequestWire }>(decided).request).toMatchObject({
        state: 'AWAITING_SPEND_SUBMISSION',
        pricing: { amount: { amount: '24000000' } },
      });
      expect(await h.lineStates(request.id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_REJECTED']);
      const lines = await lineList(request.id, e1.account);
      expect(lines.map((line) => [line.employee.employeeId, line.state, line.needDecision?.decision])).toEqual([
        [e1.employeeId, 'NEED_CONFIRMED', 'APPROVED'],
        [e2.employeeId, 'NEED_CONFIRMED', 'APPROVED'],
        [e3.employeeId, 'NEED_REJECTED', 'REJECTED'],
      ]);
      expect(lines[2]).toMatchObject({
        endReason: 'No longer needed',
        needDecision: { reason: 'No longer needed', deciderRole: 'MANAGER' },
      });
      const step = await h.needSteps(request.id);
      expect(step.map((row) => row.state)).toEqual(['APPROVED']);
      const trail = (await h.trail(request.id)).filter((event) => event.action === 'ACCESS_REQUEST.LINE_NEED_DECIDED');
      expect(trail.map((event) => event.after)).toEqual([
        expect.objectContaining({ beneficiaryEmployeeId: e1.employeeId, decision: 'APPROVED' }),
        expect.objectContaining({ beneficiaryEmployeeId: e2.employeeId, decision: 'APPROVED' }),
        expect.objectContaining({
          beneficiaryEmployeeId: e3.employeeId,
          decision: 'REJECTED',
          reason: 'No longer needed',
        }),
      ]);
    });

    it('refuses a refusal without its reason, and saves nothing', async () => {
      const { u, e1, e2, e3, request } = await sentByEmployee();

      const attempt = await h
        .decideLines(
          request.id,
          {
            lines: [approve(e1.employeeId), approve(e2.employeeId), { employeeId: e3.employeeId, decision: 'REJECT' }],
            ...outPlan,
          },
          u.head.account,
        )
        .expect(422);

      expect(h.codeOf(attempt)).toBe('VALIDATION_ERROR');
      expect(await h.lineStates(request.id)).toEqual(['AWAITING_NEED', 'AWAITING_NEED', 'AWAITING_NEED']);
    });

    it('ends the request when every person is refused, with no spend step and no commitment', async () => {
      const { u, e1, e2, e3, request } = await sentByEmployee();

      await h
        .decideLines(
          request.id,
          { lines: [refuse(e1.employeeId, 'a'), refuse(e2.employeeId, 'b'), refuse(e3.employeeId, 'c')] },
          u.head.account,
        )
        .expect(200);

      expect(await h.state(request.id)).toBe('REJECTED');
      expect(await h.lineStates(request.id)).toEqual(['NEED_REJECTED', 'NEED_REJECTED', 'NEED_REJECTED']);
      expect((await h.needSteps(request.id)).map((row) => row.state)).toEqual(['REJECTED']);
      expect(await h.steps(request.id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.commitments(request.id)).toEqual([]);
    });

    it('asks for every person of the step, once, and names who is missing or added', async () => {
      const { u, e1, e2, request } = await sentByEmployee();
      const stranger = await h.colleague(await unit());

      const missing = await h
        .decideLines(request.id, { lines: [approve(e1.employeeId)], ...outPlan }, u.head.account)
        .expect(422);
      const extra = await h
        .decideLines(
          request.id,
          { lines: [approve(e1.employeeId), approve(e2.employeeId), approve(stranger.employeeId)], ...outPlan },
          u.head.account,
        )
        .expect(422);

      expect((missing.body as Refused).error).toMatchObject({ code: 'GROUP_REQUEST.LINES_MISMATCH' });
      expect((missing.body as Refused).error.details?.missing).toHaveLength(2);
      expect((extra.body as Refused).error.details).toMatchObject({
        missing: expect.any(Array) as string[],
        extra: [stranger.employeeId],
      });
      expect(await h.lineStates(request.id)).toEqual(['AWAITING_NEED', 'AWAITING_NEED', 'AWAITING_NEED']);
    });

    it('does not decide a step twice, and does not let a person decide their own line or one they asked for', async () => {
      const { u, e1, e2, e3, request } = await sentByEmployee();
      const all = [approve(e1.employeeId), approve(e2.employeeId), approve(e3.employeeId)];
      const stranger = await h.colleague(await unit());

      expect(h.codeOf(await h.decideLines(request.id, { lines: all, ...outPlan }, e1.account).expect(403))).toBe(
        'ACCESS_REQUEST.OWN_REQUEST',
      );
      expect(h.codeOf(await h.decideLines(request.id, { lines: all, ...outPlan }, e2.account).expect(403))).toBe(
        'ACCESS_REQUEST.OWN_REQUEST',
      );
      await h.decideLines(request.id, { lines: all, ...outPlan }, stranger.account).expect(404);
      await h.decideLines(request.id, { lines: all, ...outPlan }, h.boss.account).expect(404);
      await h.decideLines(request.id, { lines: all, ...outPlan }, u.head.account).expect(200);
      expect(h.codeOf(await h.decideLines(request.id, { lines: all, ...outPlan }, u.head.account).expect(409))).toBe(
        'ACCESS_REQUEST.STEP_NOT_PENDING',
      );
    });

    it('asks the head who approves a term over twelve months to confirm it, for the people approved', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const request = h.dataOf<{ request: RequestWire }>(
        await h.submitGroup(h.groupBody(paid, [e1, e2], { termMonths: 18 }), e1.account).expect(201),
      ).request;
      const both = [approve(e1.employeeId), approve(e2.employeeId)];

      const unconfirmed = await h.decideLines(request.id, { lines: both, ...outPlan }, u.head.account).expect(422);
      expect(h.codeOf(unconfirmed)).toBe('ACCESS_REQUEST.TERM_CONFIRMATION_REQUIRED');
      await h
        .decideLines(
          request.id,
          { lines: both, termConfirmation: { reason: 'A long project' }, ...outPlan },
          u.head.account,
        )
        .expect(200);

      const record = await h.ctx.sql.query<{ term_confirmation_reason: string | null }>(
        `SELECT term_confirmation_reason FROM approval_records WHERE request_id = $1`,
        [request.id],
      );
      expect(record.rows[0].term_confirmation_reason).toBe('A long project');
    });

    it('does not approve a person who holds a seat of the plan since the request was sent, and the others are not touched (AC-15)', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const subscription = await h.subscription(10);
      const plan = await h.planOf(subscription);
      const request = h.dataOf<{ request: RequestWire }>(
        await h.submitGroup(h.groupBody(plan, [e1, e2]), e1.account).expect(201),
      ).request;
      await h.written({ subscriptionId: subscription }, [
        { employee_code: e2.code, account_identifier: `${e2.code.toLowerCase()}@acme.vn` },
      ]);

      const attempt = await h
        .decideLines(
          request.id,
          { lines: [approve(e1.employeeId), approve(e2.employeeId)], ...outPlan },
          u.head.account,
        )
        .expect(409);

      expect(attempt.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.LINE_HOLDS_ACCESS', details: { lines: [e2.employeeId] } },
      });
      expect(await h.lineStates(request.id)).toEqual(['AWAITING_NEED', 'AWAITING_NEED']);
      await h
        .decideLines(
          request.id,
          { lines: [approve(e1.employeeId), refuse(e2.employeeId, 'Already has it')], ...outPlan },
          u.head.account,
        )
        .expect(200);
      expect(await h.lineStates(request.id)).toEqual(['NEED_CONFIRMED', 'NEED_REJECTED']);
    });

    it('refuses the routes of one person on a request for a group', async () => {
      const { u, request } = await sentByEmployee();

      const need = await h.decideNeed(request.id, { decision: 'APPROVE', ...outPlan }, u.head.account).expect(409);
      const spend = await h.decideSpend(request.id, { decision: 'APPROVE' }, h.boss.account).expect(409);

      expect(h.codeOf(need)).toBe('ACCESS_REQUEST.GROUP_USES_LINES');
      expect(h.codeOf(spend)).toBe('ACCESS_REQUEST.GROUP_USES_LINES');
    });
  });

  describe('the line of the head is decided by somebody else (US-05-03 AC-8, US-05-17 AC-3, AC-4, AC-16)', () => {
    it('keeps the whole group waiting for the line of the head, and the head decides none of it', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const request = h.dataOf<{ request: RequestWire }>(
        await h.submitGroup(h.groupBody(paid, [e1, e2, u.head]), u.head.account).expect(201),
      ).request;

      expect(await h.state(request.id)).toBe('PENDING');
      expect(
        h.codeOf(
          await h
            .decideLines(request.id, { lines: [approve(u.head.employeeId)], ...outPlan }, u.head.account)
            .expect(403),
        ),
      ).toBe('ACCESS_REQUEST.OWN_REQUEST');

      await h
        .decideLines(request.id, { lines: [refuse(u.head.employeeId, 'The head has it already')] }, h.boss.account)
        .expect(200);

      expect(await h.state(request.id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.lineStates(request.id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_REJECTED']);
      const mine = await lineList(request.id, u.head.account);
      expect(mine[2]).toMatchObject({
        state: 'NEED_REJECTED',
        endReason: 'The head has it already',
        needDecision: { deciderRole: 'SPENDING_APPROVER' },
      });
      const request2 = h.dataOf<{ request: RequestWire }>(
        await h.fetch(request.id, u.head.account).expect(200),
      ).request;
      expect(request2.pricing.amount?.amount).toBe('24000000');
    });

    it('sends the group on once both steps are decided, when an Employee sent it with the head among the people', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const request = h.dataOf<{ request: RequestWire }>(
        await h.submitGroup(h.groupBody(paid, [e1, e2, u.head]), e1.account).expect(201),
      ).request;

      await h
        .decideLines(
          request.id,
          { lines: [approve(e1.employeeId), approve(e2.employeeId)], ...outPlan },
          u.head.account,
        )
        .expect(200);
      expect(await h.state(request.id)).toBe('PENDING');
      await h.decideLines(request.id, { lines: [approve(u.head.employeeId)] }, h.boss.account).expect(200);

      expect(await h.state(request.id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.lineStates(request.id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_CONFIRMED']);
      expect((await h.needSteps(request.id)).map((row) => row.state)).toEqual(['APPROVED', 'APPROVED']);
    });
  });

  describe('when the head changes while a step waits (FR-3.16)', () => {
    it('gives the step that holds a person who has become the head to the person who decides a head’s own line, and not to them', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const request = h.dataOf<{ request: RequestWire }>(
        await h.submitGroup(h.groupBody(paid, [e1, e2]), e1.account).expect(201),
      ).request;
      expect((await h.needSteps(request.id))[0].assignee_employee_id).toBe(u.head.employeeId);

      await h.makeHead(u.department, e2);
      await h.sweep();

      const [step] = await h.needSteps(request.id);
      expect(step).toMatchObject({ state: 'PENDING', assignee_employee_id: h.boss.employeeId });
      const own = await h
        .decideLines(request.id, { lines: [approve(e1.employeeId), approve(e2.employeeId)], ...outPlan }, e2.account)
        .expect(403);
      expect(h.codeOf(own)).toBe('ACCESS_REQUEST.OWN_REQUEST');
    });
  });

  describe('who reads the people (AC-4)', () => {
    it('shows every person to the sender and the head, and only their own line to a person the request is for', async () => {
      const { u, e1, e2, request } = await sentByEmployee();

      expect(await lineList(request.id, e1.account)).toHaveLength(3);
      expect(await lineList(request.id, u.head.account)).toHaveLength(3);
      const mine = await lineList(request.id, e2.account);
      expect(mine.map((line) => line.employee.employeeId)).toEqual([e2.employeeId]);
      await h.linesOf(request.id, (await h.colleague(await unit())).account).expect(404);
    });
  });
});
