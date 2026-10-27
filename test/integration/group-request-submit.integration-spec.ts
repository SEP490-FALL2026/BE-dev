import { GroupHarness } from '../support/group-harness';
import type { Unit } from '../support/spend-harness';

const h = new GroupHarness();

interface RequestWire {
  id: string;
  type: string;
  state: string;
  branch: string;
  requester: { employeeId: string };
  beneficiary: { employeeId: string } | null;
  lineCount: number;
  pricing: { status: string; amount: { amount: string } | null; unitPrice: { amount: string } | null };
  needStep: { state: string; routingRow: number; assignee: { employeeId: string } | null };
}
interface CheckWire {
  plan: { eligible: boolean; reason: string | null };
  tooManyLines: { max: number } | null;
  lines: Array<{ employeeId: string; ok: boolean; reason: string | null }>;
  lineCount: number;
  hasSpendStep: boolean;
  pricing: { status: string; amount: { amount: string } | null };
  amountPerPerson: { amount: string; currency: string } | null;
}
interface Refused {
  error: {
    code: string;
    details?: {
      max?: number;
      employeeIds?: string[];
      reason?: string;
      lines?: Array<{ employeeId: string; reason: string }>;
    };
  };
}

describe('a request for a group of people, sent and checked over PostgreSQL (US-05-17)', () => {
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

    return h.departmentWithHead(`P-G${counter}`);
  };
  const sent = async (account: Parameters<GroupHarness['submitGroup']>[1], body: object) =>
    h.dataOf<{ request: RequestWire }>(await h.submitGroup(body, account).expect(201)).request;

  describe('a head sends for the people of the department (AC-1, AC-2, AC-13)', () => {
    it('makes one request of three lines, each confirmed by the head in the moment of sending, with one amount for all three', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);

      const request = await sent(u.head.account, h.groupBody(paid, [e1, e2, e3]));

      expect(request).toMatchObject({
        type: 'GROUP_GRANT',
        branch: 'PAID_IN_CATALOG',
        state: 'AWAITING_SPEND_SUBMISSION',
        requester: { employeeId: u.head.employeeId },
        beneficiary: null,
        lineCount: 3,
        pricing: { status: 'PRICED', amount: { amount: '36000000' }, unitPrice: { amount: '1000000' } },
      });
      expect(await h.lineStates(request.id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_CONFIRMED']);
      const steps = await h.needSteps(request.id);
      expect(steps).toEqual([
        expect.objectContaining({ state: 'APPROVED', routing_row: 5, assignee_employee_id: u.head.employeeId }),
      ]);
      const decisions = await h.ctx.sql.query<{
        stage: string;
        decision: string;
        decider_role: string;
        decided_by_employee_id: string;
      }>(
        `SELECT stage::text, decision::text, decider_role::text, decided_by_employee_id FROM access_request_line_decisions WHERE request_id = $1`,
        [request.id],
      );
      expect(decisions.rows).toHaveLength(3);
      expect(
        decisions.rows.every(
          (row) => row.stage === 'NEED' && row.decision === 'APPROVED' && row.decider_role === 'MANAGER',
        ),
      ).toBe(true);
      expect(decisions.rows.every((row) => row.decided_by_employee_id === u.head.employeeId)).toBe(true);
      // Nobody confirms it again, and the spend step opens only when the head sends it on.
      expect(await h.steps(request.id, 'SPEND_APPROVAL')).toEqual([]);
      const people = await h.ctx.sql.query(`SELECT 1 FROM access_request_beneficiaries WHERE request_id = $1`, [
        request.id,
      ]);
      expect(people.rowCount).toBe(3);
    });

    it('writes the people and the routing of the lines in the Audit Trail, so that each person can be told', async () => {
      const u = await unit();
      const people = await h.colleagues(u, 2);

      const request = await sent(u.head.account, h.groupBody(paid, people));

      const trail = await h.trail(request.id);
      const submitted = trail.find((event) => event.action === 'ACCESS_REQUEST.SUBMITTED');
      expect(submitted?.after).toMatchObject({
        type: 'GROUP_GRANT',
        lineCount: 2,
        requesterEmployeeId: u.head.employeeId,
        beneficiaryEmployeeIds: people.map((person) => person.employeeId),
      });
      const routed = trail.find((event) => event.action === 'ACCESS_REQUEST.LINES_ROUTED');
      expect((routed?.after as { lines: unknown[] }).lines).toHaveLength(2);
      expect(trail.map((event) => event.action)).toEqual(
        expect.arrayContaining(['ACCESS_REQUEST.NEED_STEP_ROUTED', 'ACCESS_REQUEST.NEED_APPROVED']),
      );
    });

    it('takes twenty-five people of the department in one transaction, and refuses a hundred and one', async () => {
      const u = await unit();
      const people = await h.colleagues(u, 25);

      const request = await sent(u.head.account, h.groupBody(paid, people));
      expect(request.lineCount).toBe(25);
      expect(await h.lineStates(request.id)).toHaveLength(25);

      const many = Array.from({ length: 101 }, (_, index) => ({
        employeeId: people[index % people.length].employeeId,
      }));
      const refused = await h.submitGroup({ ...h.groupBody(paid, people), lines: many }, u.head.account).expect(422);
      expect(refused.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.TOO_MANY_LINES', details: { max: 100 } },
      });
    }, 120000);

    it('asks the head who sends a term over twelve months to confirm it in so many words', async () => {
      const u = await unit();
      const [e1] = await h.colleagues(u, 1);
      const rows = await h.requestRows();

      const refused = await h.submitGroup(h.groupBody(paid, [e1], { termMonths: 18 }), u.head.account).expect(422);
      expect(h.codeOf(refused)).toBe('GROUP_REQUEST.TERM_CONFIRMATION_REQUIRED');
      expect(await h.requestRows()).toBe(rows);

      const confirmed = await sent(
        u.head.account,
        h.groupBody(paid, [e1], { termMonths: 18, termConfirmation: { reason: 'A long project' } }),
      );
      const record = await h.ctx.sql.query<{ term_confirmation_reason: string | null }>(
        `SELECT term_confirmation_reason FROM approval_records WHERE request_id = $1`,
        [confirmed.id],
      );
      expect(record.rows[0].term_confirmation_reason).toBe('A long project');
    });
  });

  describe('the head among the people (US-05-03 AC-8, US-05-17 AC-3, AC-16)', () => {
    it('confirms the others by sending and gives the line of the head to the person who decides a head of their own request', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);

      const request = await sent(u.head.account, h.groupBody(paid, [e1, e2, u.head]));

      expect(request.state).toBe('PENDING');
      const steps = await h.needSteps(request.id);
      expect(steps.map((step) => [step.state, step.routing_row, step.assignee_employee_id])).toEqual([
        ['APPROVED', 5, u.head.employeeId],
        ['PENDING', 2, h.boss.employeeId],
      ]);
      const lines = await h.lineRows(request.id);
      expect(lines.map((line) => [line.employee_id, line.state, line.need_step_id])).toEqual([
        [e1.employeeId, 'NEED_CONFIRMED', steps[0].id],
        [e2.employeeId, 'NEED_CONFIRMED', steps[0].id],
        [u.head.employeeId, 'AWAITING_NEED', steps[1].id],
      ]);
    });

    it('lets the head decide none of their own line', async () => {
      const u = await unit();
      const [e1] = await h.colleagues(u, 1);
      const request = await sent(u.head.account, h.groupBody(paid, [e1, u.head]));

      const attempt = await h
        .decideLines(request.id, { lines: [{ employeeId: u.head.employeeId, decision: 'APPROVE' }] }, u.head.account)
        .expect(403);

      expect(h.codeOf(attempt)).toBe('ACCESS_REQUEST.OWN_REQUEST');
      expect(await h.lineStates(request.id)).toEqual(['NEED_CONFIRMED', 'AWAITING_NEED']);
    });

    it('sends a request of the head alone as a line of their own, decided by the spending approver, with no step for others', async () => {
      const u = await unit();

      const request = await sent(u.head.account, h.groupBody(paid, [u.head]));

      expect(request.state).toBe('PENDING');
      expect((await h.needSteps(request.id)).map((step) => [step.state, step.routing_row])).toEqual([['PENDING', 2]]);
      expect(await h.lineStates(request.id)).toEqual(['AWAITING_NEED']);
    });
  });

  describe('an Employee sends for the people of the department (US-05-17 AC-11, US-05-03 AC-14)', () => {
    it('gives every person to the head of the department, with nobody confirmed and the people named kept in the Audit Trail', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);

      const request = await sent(e1.account, h.groupBody(paid, [e1, e2, e3]));

      expect(request).toMatchObject({
        type: 'GROUP_GRANT',
        state: 'PENDING',
        requester: { employeeId: e1.employeeId },
        needStep: { state: 'PENDING', routingRow: 9, assignee: { employeeId: u.head.employeeId } },
      });
      expect(await h.lineStates(request.id)).toEqual(['AWAITING_NEED', 'AWAITING_NEED', 'AWAITING_NEED']);
      expect(
        (await h.trail(request.id)).find((event) => event.action === 'ACCESS_REQUEST.SUBMITTED')?.after,
      ).toMatchObject({
        beneficiaryEmployeeIds: [e1.employeeId, e2.employeeId, e3.employeeId],
      });
      const decisions = await h.ctx.sql.query(`SELECT 1 FROM access_request_line_decisions WHERE request_id = $1`, [
        request.id,
      ]);
      expect(decisions.rowCount).toBe(0);
    });

    it('gives the line of the head to the spending approver in a second step, and the others to the head, when the head is named', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);

      const request = await sent(e1.account, h.groupBody(paid, [e1, e2, u.head]));

      const steps = await h.needSteps(request.id);
      expect(steps.map((step) => [step.state, step.routing_row, step.assignee_employee_id])).toEqual([
        ['PENDING', 9, u.head.employeeId],
        ['PENDING', 2, h.boss.employeeId],
      ]);
    });

    it('stops an Employee at ten people and names the most', async () => {
      const u = await unit();
      const people = await h.colleagues(u, 11);

      const refused = await h.submitGroup(h.groupBody(paid, people), people[0].account).expect(422);

      expect(refused.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.TOO_MANY_LINES', details: { max: 10 } },
      });
      expect((await h.submitGroup(h.groupBody(paid, people.slice(0, 10)), people[0].account)).status).toBe(201);
    });
  });

  describe('what is refused as a person is added (AC-2, AC-8, AC-12, AC-14, AC-15)', () => {
    it('says every reason of every person and writes nothing, in the check and in the sending', async () => {
      const u = await unit();
      const other = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const [outsider] = await h.colleagues(other, 1);
      await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN' WHERE id = $1`, [e2.employeeId]);
      await h.ctx.sql.query(`UPDATE employees SET work_email = NULL WHERE id = $1`, [e3.employeeId]);
      const rows = await h.requestRows();
      const body = h.groupBody(paid, [e1, outsider, e2, e3]);

      const checked = h.dataOf<CheckWire>(await h.checkGroup(body, u.head.account).expect(200));
      const refused = await h.submitGroup(body, u.head.account).expect(422);

      expect(checked.lines.map((line) => [line.employeeId, line.ok, line.reason])).toEqual([
        [e1.employeeId, true, null],
        [outsider.employeeId, false, 'OUTSIDE_DEPARTMENT'],
        [e2.employeeId, false, 'END_DATE_REQUIRED'],
        [e3.employeeId, false, 'EMAIL_REQUIRED'],
      ]);
      expect(refused.body as Refused).toMatchObject({
        error: {
          code: 'GROUP_REQUEST.LINES_REFUSED',
          details: {
            lines: [
              { employeeId: outsider.employeeId, reason: 'OUTSIDE_DEPARTMENT' },
              { employeeId: e2.employeeId, reason: 'END_DATE_REQUIRED' },
              { employeeId: e3.employeeId, reason: 'EMAIL_REQUIRED' },
            ],
          },
        },
      });
      expect(await h.requestRows()).toBe(rows);
    });

    it('gives the intern a day of their own, which the line and the seat keep', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN' WHERE id = $1`, [e2.employeeId]);

      const request = await sent(
        u.head.account,
        h.groupBody(paid, [e1, e2], {
          lines: [{ employeeId: e1.employeeId }, { employeeId: e2.employeeId, expectedEndDate: '2099-12-31' }],
        }),
      );

      expect((await h.lineRows(request.id)).map((line) => line.expected_end_date)).toEqual([null, '2099-12-31']);
    });

    it('names a person twice, and refuses a plan that is not for a group by what it grants and never by its name', async () => {
      const u = await unit();
      const [e1] = await h.colleagues(u, 1);
      const dupe = await h
        .submitGroup(
          { ...h.groupBody(paid, [e1]), lines: [{ employeeId: e1.employeeId }, { employeeId: e1.employeeId }] },
          u.head.account,
        )
        .expect(422);
      const single = await h.planOf(await h.subscription(10, 'K1'));
      const internal = await h.plan('K5');

      const k1 = await h.submitGroup(h.groupBody(single, [e1]), u.head.account).expect(422);
      const free = await h.submitGroup(h.groupBody(internal, [e1]), u.head.account).expect(422);

      expect(dupe.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.DUPLICATE_LINE', details: { employeeIds: [e1.employeeId] } },
      });
      expect(k1.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.PLAN_NOT_ELIGIBLE', details: { reason: 'KIND_NOT_MULTI_SEAT' } },
      });
      expect(free.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.PLAN_NOT_ELIGIBLE', details: { reason: 'NOT_PAID_SOFTWARE' } },
      });
      const checked = h.dataOf<CheckWire>(await h.checkGroup(h.groupBody(single, [e1]), u.head.account).expect(200));
      expect(checked.plan).toEqual({ eligible: false, reason: 'KIND_NOT_MULTI_SEAT' });
    });

    it('refuses a person who holds a seat of the plan and one for whom a request for it is open', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const subscription = await h.subscription(10);
      const plan = await h.planOf(subscription);
      await h.written({ subscriptionId: subscription }, [
        { employee_code: e1.code, account_identifier: `${e1.code.toLowerCase()}@acme.vn` },
      ]);
      await sent(u.head.account, h.groupBody(plan, [e3]));

      const checked = h.dataOf<CheckWire>(
        await h.checkGroup(h.groupBody(plan, [e1, e2, e3]), u.head.account).expect(200),
      );

      expect(checked.lines.map((line) => [line.employeeId, line.reason])).toEqual([
        [e1.employeeId, 'HAS_ACCESS'],
        [e2.employeeId, null],
        [e3.employeeId, 'HAS_OPEN_REQUEST'],
      ]);
    });

    it('shows the cost for one person and for all and whether it has a spend step, and says nothing of a toolset (QĐ-87h)', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);

      const checked = h.dataOf<CheckWire>(await h.checkGroup(h.groupBody(paid, [e1, e2]), u.head.account).expect(200));
      const old = await h.submitGroup(h.groupBody(paid, [e1, e2], { outsideStandardReason: 'old' }), u.head.account);

      expect(checked).toMatchObject({
        hasSpendStep: true,
        lineCount: 2,
        amountPerPerson: { amount: '12000000' },
        pricing: { status: 'PRICED', amount: { amount: '24000000' } },
      });
      expect(Object.keys(checked)).not.toContain('outsideStandard');
      expect([old.status, h.codeOf(old)]).toEqual([422, 'VALIDATION_ERROR']);
    });
  });

  describe('who may be named (AC-12)', () => {
    it('lists the people of the department of the caller who work here, by name and work email and nothing else', async () => {
      const u = await unit();
      const [e1, e2, left] = await h.colleagues(u, 3);
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);

      const page = h.dataOf<{ items: Array<Record<string, unknown>>; pagination: { totalItems: number } }>(
        await h.candidates(e1.account).expect(200),
      );

      const ids = page.items.map((item) => item.employeeId);
      expect(ids).toEqual(expect.arrayContaining([e1.employeeId, e2.employeeId, u.head.employeeId]));
      expect(ids).not.toContain(left.employeeId);
      for (const item of page.items) expect(Object.keys(item).sort()).toEqual(['employeeId', 'fullName', 'workEmail']);
      const searched = h.dataOf<{ items: Array<{ employeeId: string }> }>(
        await h.candidates(e1.account, { q: e2.code.toLowerCase() }).expect(200),
      );
      expect(searched.items.map((item) => item.employeeId)).toEqual([e2.employeeId]);
    });
  });

  describe('the plan of a group is read from the plan, whatever it is called (AC-14)', () => {
    it('takes a plan of the kind of grant that gives each person an account, renamed or not', async () => {
      const u = await unit();
      const [e1] = await h.colleagues(u, 1);
      await h.ctx.sql.query(`UPDATE plans SET name = 'Anything else entirely' WHERE id = $1`, [paid]);

      const request = await sent(u.head.account, h.groupBody(paid, [e1]));

      expect(request.type).toBe('GROUP_GRANT');
    });
  });
});
