import { SpendHarness, Unit } from '../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface RequestWire {
  id: string;
  state: string;
  branch: string;
  requester: { employeeId: string };
  beneficiary: { employeeId: string };
  delegatedBatchId: string | null;
  expectedEndDate: string | null;
  pricing: { status: string; amount: { amount: string } | null };
  needStep: { state: string; routingRow: number; assignee: { employeeId: string } | null };
  needDecision: { decision: string; decidedBy: { employeeId: string }; deciderRole: string; decidedAt: string } | null;
}
interface QueueItem {
  requestId: string;
  beneficiary: { employeeId: string };
  requester: { employeeId: string };
  delegatedBatchId: string | null;
  expectedEndDate: string | null;
}

describe('a head sends requests for the people of the department over PostgreSQL (US-03-02)', () => {
  let paidA: string;
  let paidB: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paidA = await h.planOf(await h.subscription(10));
    paidB = await h.planOf(await h.subscription(10));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-D${counter}`);
  };
  /** A colleague of the department who has a work email, a start day of today and is staff, until a test changes it. */
  const colleague = async (u: Unit) => {
    counter += 1;
    const code = `D-N${counter}`;
    const person = await h.staff(u.department, code);
    await h.ctx.sql.query(`UPDATE employees SET hire_date = current_date WHERE id = $1`, [person.employeeId]);

    return { ...person, code };
  };
  const send = (account: typeof h.finance, body: object) => h.sendDelegated(body, account);
  const form = (beneficiaries: string[], plans: Array<string | { planId: string }>, extra: object = {}) => ({
    beneficiaryEmployeeIds: beneficiaries,
    items: plans.map((plan) => (typeof plan === 'string' ? { planId: plan } : plan)),
    businessReason: 'The new designer needs the tools',
    termMonths: 6,
    ...extra,
  });
  const sent = async (account: typeof h.finance, body: object) =>
    h.dataOf<{ batchId: string; requests: RequestWire[] }>(await send(account, body).expect(201));
  const requestsOf = async (batchId: string) =>
    (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM access_requests WHERE delegated_batch_id = $1`, [batchId]))
      .rows;

  describe('what the head sends (AC-1, AC-9, US-05-03 AC-6, US-05-02 AC-5)', () => {
    it('makes one request for each tool with one code, the head as who sent it and the colleague as who it is for, each with its own branch and amount', async () => {
      const u = await unit();
      const n1 = await colleague(u);
      const internal = await h.plan('K5');

      const result = await sent(u.head.account, form([n1.employeeId], [paidA, paidB, internal]));

      expect(result.requests).toHaveLength(3);
      for (const request of result.requests) {
        expect(request).toMatchObject({
          delegatedBatchId: result.batchId,
          requester: { employeeId: u.head.employeeId },
          beneficiary: { employeeId: n1.employeeId },
          needStep: { state: 'APPROVED', routingRow: 5, assignee: { employeeId: u.head.employeeId } },
          needDecision: { decision: 'APPROVED', deciderRole: 'MANAGER', decidedBy: { employeeId: u.head.employeeId } },
        });
      }
      const byBranch = (branch: string) => result.requests.filter((request) => request.branch === branch);
      expect(byBranch('PAID_IN_CATALOG')).toHaveLength(2);
      expect(byBranch('PAID_IN_CATALOG').map((request) => request.state)).toEqual([
        'AWAITING_SPEND_SUBMISSION',
        'AWAITING_SPEND_SUBMISSION',
      ]);
      expect(byBranch('PAID_IN_CATALOG').every((request) => request.pricing.status === 'PRICED')).toBe(true);
      expect(byBranch('INTERNAL_FREE')).toEqual([
        expect.objectContaining({
          state: 'AWAITING_EXECUTION',
          pricing: expect.objectContaining({ status: 'NOT_APPLICABLE' }) as object,
        }),
      ]);
      expect((await requestsOf(result.batchId)).length).toBe(3);
      // Nothing waits for the head or anybody else to confirm the need again.
      const waiting = await h.ctx.sql.query(
        `SELECT 1 FROM access_request_steps s JOIN access_requests r ON r.id = s.request_id
          WHERE r.delegated_batch_id = $1 AND s.kind = 'NEED' AND s.state <> 'APPROVED'`,
        [result.batchId],
      );
      expect(waiting.rowCount).toBe(0);
    });

    it('says who and when in the Audit Trail, the sender and the person apart', async () => {
      const u = await unit();
      const n1 = await colleague(u);

      const [request] = (await sent(u.head.account, form([n1.employeeId], [paidA]))).requests;

      const events = await h.ctx.sql.query<{ action: string; after: Record<string, unknown> }>(
        `SELECT action, after FROM audit_events WHERE resource_id::text = $1 OR resource_id::text IN (SELECT id::text FROM access_request_steps WHERE request_id::text = $1 AND kind = 'NEED') ORDER BY occurred_at`,
        [request.id],
      );
      expect(events.rows.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'ACCESS_REQUEST.SUBMITTED',
          'ACCESS_REQUEST.NEED_STEP_ROUTED',
          'ACCESS_REQUEST.NEED_APPROVED',
        ]),
      );
      const submitted = events.rows.find((row) => row.action === 'ACCESS_REQUEST.SUBMITTED');
      expect(submitted?.after).toMatchObject({
        requesterEmployeeId: u.head.employeeId,
        beneficiaryEmployeeIds: [n1.employeeId],
        delegated: true,
      });
    });

    it('is read by the head and the colleague, and not by another employee of the department', async () => {
      const u = await unit();
      const n1 = await colleague(u);
      const [request] = (await sent(u.head.account, form([n1.employeeId], [paidA]))).requests;

      await h.fetch(request.id, u.head.account).expect(200);
      await h.fetch(request.id, n1.account).expect(200);
      await h.fetch(request.id, u.member.account).expect(404);
    });
  });

  describe('where it goes next (AC-13, AC-6)', () => {
    it('puts what costs money in the queue of the head, with no step for the spending approver, and sends the rest to the IT Admin', async () => {
      const u = await unit();
      const n1 = await colleague(u);
      const internal = await h.plan('K5');

      const result = await sent(u.head.account, form([n1.employeeId], [paidA, internal]));
      const paid = result.requests.find((request) => request.branch === 'PAID_IN_CATALOG') as RequestWire;
      const free = result.requests.find((request) => request.branch === 'INTERNAL_FREE') as RequestWire;

      const queue = h.dataOf<{ items: Array<{ requestId: string }> }>(
        await h.spendQueue(u.head.account, { pageSize: 100 }).expect(200),
      );
      expect(queue.items.map((item) => item.requestId)).toContain(paid.id);
      expect(queue.items.map((item) => item.requestId)).not.toContain(free.id);
      expect(await h.steps(paid.id, 'SPEND_APPROVAL')).toEqual([]);
      const waitingForIt = h.dataOf<{ items: QueueItem[] }>(await h.grantQueue(h.it1, { pageSize: 100 }).expect(200));
      expect(waitingForIt.items.map((item) => item.requestId)).toContain(free.id);
      expect(waitingForIt.items.map((item) => item.requestId)).not.toContain(paid.id);
    });

    it('keeps the requests of one colleague together in the queue of the IT Admin, and only the IT Admin reads it (AC-6)', async () => {
      const u = await unit();
      const n1 = await colleague(u);
      const n2 = await colleague(u);
      const first = await sent(
        u.head.account,
        form([n1.employeeId, n2.employeeId], [await h.plan('K5'), await h.plan('K5')]),
      );

      const queue = h
        .dataOf<{ items: QueueItem[] }>(await h.grantQueue(h.it1, { pageSize: 100 }).expect(200))
        .items.filter((item) => item.delegatedBatchId === first.batchId);
      expect(queue).toHaveLength(4);
      const order = queue.map((item) => item.beneficiary.employeeId);
      // Each colleague's two tools are next to each other: the people do not alternate.
      expect(new Set(order).size).toBe(2);
      expect(order[0]).toBe(order[1]);
      expect(order[2]).toBe(order[3]);
      const only = h.dataOf<{ items: QueueItem[] }>(
        await h.grantQueue(h.it1, { beneficiaryEmployeeId: n1.employeeId }).expect(200),
      );
      expect(only.items.every((item) => item.beneficiary.employeeId === n1.employeeId)).toBe(true);
      expect(only.items).toHaveLength(2);
      for (const account of [u.head.account, u.member.account, h.finance]) await h.grantQueue(account).expect(403);
    });
  });

  describe('who may send, and for whom (AC-3, AC-5, AC-11, US-05-03 AC-7)', () => {
    it('is for the head of the department of the colleague, and nobody else', async () => {
      const u = await unit();
      const other = await unit();
      const n1 = await colleague(u);

      for (const account of [u.member.account, h.it1, other.head.account]) {
        const refused = await send(account, form([n1.employeeId], [paidA]));
        expect([403, 422]).toContain(refused.status);
        expect(h.codeOf(refused)).toMatch(/^DELEGATED_REQUEST\.(NOT_HEAD|OUTSIDE_DEPARTMENT)$/);
      }
      expect(h.codeOf(await send(u.member.account, form([n1.employeeId], [paidA])).expect(403))).toBe(
        'DELEGATED_REQUEST.NOT_HEAD',
      );
    });

    it('refuses a colleague of another department and makes no request for anybody, even a valid one before it', async () => {
      const u = await unit();
      const other = await unit();
      const n1 = await colleague(u);
      const stranger = await colleague(other);
      const before = (await h.ctx.sql.query<{ count: string }>(`SELECT count(*)::text AS count FROM access_requests`))
        .rows[0].count;

      const refused = await send(u.head.account, form([n1.employeeId, stranger.employeeId], [paidA])).expect(422);

      expect(h.codeOf(refused)).toBe('DELEGATED_REQUEST.OUTSIDE_DEPARTMENT');
      expect(h.detailsOf(refused)).toMatchObject({ employeeId: stranger.employeeId });
      const after = (await h.ctx.sql.query<{ count: string }>(`SELECT count(*)::text AS count FROM access_requests`))
        .rows[0].count;
      expect(after).toBe(before);
    });

    it('is blocked for a colleague who has no work email yet, and says why', async () => {
      const u = await unit();
      const n2 = await colleague(u);
      await h.ctx.sql.query(`UPDATE employees SET work_email = NULL, normalized_work_email = NULL WHERE id = $1`, [
        n2.employeeId,
      ]);

      const refused = await send(u.head.account, form([n2.employeeId], [paidA])).expect(422);

      expect(h.codeOf(refused)).toBe('DELEGATED_REQUEST.EMAIL_REQUIRED');
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM access_request_beneficiaries WHERE employee_id = $1`, [n2.employeeId]))
          .rowCount,
      ).toBe(0);
    });

    it('refuses a colleague who left, a person who is not there, a tool the colleague holds, and a body that is not a form', async () => {
      const u = await unit();
      const gone = await colleague(u);
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [gone.employeeId]);
      const n1 = await colleague(u);

      expect(h.codeOf(await send(u.head.account, form([gone.employeeId], [paidA])).expect(409))).toBe(
        'DELEGATED_REQUEST.BENEFICIARY_NOT_ACTIVE',
      );
      await send(u.head.account, form(['00000000-0000-4000-8000-000000000000'], [paidA])).expect(422);
      await send(u.head.account, form([n1.employeeId], ['00000000-0000-4000-8000-000000000000'])).expect(404);
      for (const body of [
        {},
        form([], [paidA]),
        form([n1.employeeId], []),
        form([n1.employeeId, n1.employeeId], [paidA]),
        form([n1.employeeId], [paidA, paidA]),
        form([n1.employeeId], [paidA], { termMonths: 0 }),
        form([n1.employeeId], [paidA], { businessReason: '  ' }),
        form([n1.employeeId], [paidA], { extra: 1 }),
      ]) {
        await send(u.head.account, body).expect(422);
      }
    });
  });

  describe('no standard toolset any more (QĐ-87h)', () => {
    it('sends every tool without a reason of its own, shows no flag, and refuses the old field as a malformed body', async () => {
      const u = await unit();
      const n1 = await colleague(u);

      const given = await sent(u.head.account, form([n1.employeeId], [{ planId: paidA }, { planId: paidB }]));
      const old = await send(
        u.head.account,
        form([n1.employeeId], [{ planId: paidB, outsideStandardReason: 'Needs it for GitHub work' } as never]),
      );

      expect(given.requests).toHaveLength(2);
      expect(Object.keys(given.requests[0])).not.toContain('outsideStandard');
      expect([old.status, h.codeOf(old)]).toEqual([422, 'VALIDATION_ERROR']);
    });
  });

  describe('a person who is not staff (AC-10)', () => {
    it('needs the day the access ends, and every request carries it, and the grant takes it as the end of the seat', async () => {
      const u = await unit();
      const intern = await colleague(u);
      await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN' WHERE id = $1`, [intern.employeeId]);
      const internal = await h.plan('K5');

      expect(h.codeOf(await send(u.head.account, form([intern.employeeId], [internal])).expect(422))).toBe(
        'DELEGATED_REQUEST.END_DATE_REQUIRED',
      );
      expect(
        h.codeOf(
          await send(u.head.account, form([intern.employeeId], [internal], { expectedEndDate: '2000-01-01' })).expect(
            422,
          ),
        ),
      ).toBe('DELEGATED_REQUEST.END_DATE_TOO_EARLY');
      const result = await sent(
        u.head.account,
        form([intern.employeeId], [internal], { expectedEndDate: '2099-12-31' }),
      );
      expect(result.requests[0].expectedEndDate).toBe('2099-12-31');

      await h.grant({ requestId: result.requests[0].id }).expect(201);
      const seat = await h.ctx.sql.query<{ expected_end_date: string }>(
        `SELECT expected_end_date::text AS expected_end_date FROM license_assignments WHERE employee_id = $1`,
        [intern.employeeId],
      );
      expect(seat.rows[0].expected_end_date).toBe('2099-12-31');
    });
  });

  describe('a colleague who has not started yet (AC-4, AC-12)', () => {
    it('is of the department from when the record is written, and the access begins no earlier than the first day', async () => {
      const u = await unit();
      const n1 = await colleague(u);
      await h.ctx.sql.query(`UPDATE employees SET hire_date = current_date + 10 WHERE id = $1`, [n1.employeeId]);
      const internal = await h.plan('K5');

      const result = await sent(u.head.account, form([n1.employeeId], [internal]));

      const members = h.dataOf<{ items: Array<{ employeeCode: string }> }>(
        await h.departmentEmployees(u.department.id, h.it1).expect(200),
      );
      expect(members.items.map((item) => item.employeeCode)).toContain(n1.code);
      const early = await h.grant({ requestId: result.requests[0].id });
      expect(early.status).toBeGreaterThanOrEqual(400);
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM license_assignments WHERE employee_id = $1`, [n1.employeeId])).rowCount,
      ).toBe(0);

      await h.ctx.sql.query(`UPDATE employees SET hire_date = current_date WHERE id = $1`, [n1.employeeId]);
      await h.grant({ requestId: result.requests[0].id }).expect(201);
      const seat = await h.ctx.sql.query<{ effective_from: string; hire_date: string }>(
        `SELECT a.valid_from::text AS effective_from, e.hire_date::text AS hire_date
           FROM license_assignments a JOIN employees e ON e.id = a.employee_id WHERE a.employee_id = $1`,
        [n1.employeeId],
      );
      expect(seat.rows[0].effective_from >= seat.rows[0].hire_date).toBe(true);
    });
  });

  describe('the head among the people (AC-8, US-06-08 AC-2, AC-9)', () => {
    it('has the share of the head routed like any request of theirs, and not confirmed by the sending', async () => {
      const u = await unit();
      const n1 = await colleague(u);
      const internal = await h.plan('K5');

      const result = await sent(u.head.account, form([u.head.employeeId, n1.employeeId], [internal]));

      const own = result.requests.find(
        (request) => request.beneficiary.employeeId === u.head.employeeId,
      ) as RequestWire;
      const other = result.requests.find((request) => request.beneficiary.employeeId === n1.employeeId) as RequestWire;
      expect(own).toMatchObject({
        state: 'PENDING',
        needDecision: null,
        needStep: { state: 'PENDING', routingRow: 2, assignee: { employeeId: h.boss.employeeId } },
      });
      expect(other).toMatchObject({ state: 'AWAITING_EXECUTION', needStep: { state: 'APPROVED', routingRow: 5 } });
      expect(own.delegatedBatchId).toBe(other.delegatedBatchId);
    });

    it('gives the spend step to the substitute when the approver is the person it is for (US-06-08 AC-2)', async () => {
      const u = await unit();
      const version = await h.budgetFor(u, { total: 100 * M });
      const approver = await colleague(u);
      await h.setRole('SPENDING_APPROVER', approver);
      try {
        const [request] = (await sent(u.head.account, form([approver.employeeId], [paidA]))).requests;
        await h.setPayments(request.id, { amount: 5 * M });
        await h.attachLine(request.id, version.id, 1);
        await h.sendOn([request.id], u.head.account).expect(201);

        expect(await h.steps(request.id, 'SPEND_APPROVAL')).toEqual([
          expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.substitute.employeeId }),
        ]);
        await h.decideSpend(request.id, { decision: 'APPROVE' }, approver.account).expect(403);
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    });

    it('gives the spend step to the substitute when the approver is the head who sent, and the approver decides nothing on it', async () => {
      const row = await h.ctx.sql.query<{ id: string; cost_center_id: string }>(
        `SELECT d.id, c.id AS cost_center_id FROM departments d
           JOIN cost_centers c ON c.department_id = d.id AND c.status = 'ACTIVE' WHERE d.code = 'P-EXE'`,
      );
      const department = { id: row.rows[0].id, code: 'P-EXE', unitId: row.rows[0].cost_center_id };
      const executive = { department, head: h.boss, member: await h.staff(department, 'EXE-D7') };
      await h.ctx.sql.query(`UPDATE employees SET hire_date = current_date WHERE id = $1`, [
        executive.member.employeeId,
      ]);
      const version = await h.budgetFor(executive, { total: 100 * M });

      const [request] = (await sent(h.boss.account, form([executive.member.employeeId], [paidA]))).requests;
      expect(request.needDecision).toMatchObject({
        decision: 'APPROVED',
        decidedBy: { employeeId: h.boss.employeeId },
      });
      await h.setPayments(request.id, { amount: 5 * M });
      await h.attachLine(request.id, version.id, 1);
      await h.sendOn([request.id], h.boss.account).expect(201);

      expect(await h.steps(request.id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.substitute.employeeId }),
      ]);
      await h.decideSpend(request.id, { decision: 'APPROVE' }, h.boss.account).expect(403);
      await h.approvalOf(request.id, h.boss.account).expect(404);
    });
  });
});
