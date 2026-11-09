import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;
/** The months of a group that names no end date: the months left of the year, the month of today counted whole (`BR-MF1-06`). */
const monthsLeft = h.monthsOf(12);

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
        pricing: { status: 'PRICED', amount: { amount: String(3 * M * monthsLeft) }, unitPrice: { amount: '1000000' } },
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

    it('takes no term over twelve months, and no confirmation in words that would lift the limit (QĐ-98)', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const rows = await h.requestRows();

      const long = await h.submitGroup(h.groupBody(paid, [e1, e2], { termMonths: 13 }), u.head.account).expect(422);
      const confirmed = await h
        .submitGroup(
          h.groupBody(paid, [e1, e2], { termMonths: 12, termConfirmation: { reason: 'A long project' } }),
          u.head.account,
        )
        .expect(422);

      // An end date past a year from today is refused as the domain says it (`US-05-23` AC-9), the confirmation in words as a field that is gone.
      expect(h.codeOf(long)).toBe('GROUP_REQUEST.TERM_BEYOND_LIMIT');
      expect(h.codeOf(confirmed)).toBe('VALIDATION_ERROR');
      expect(await h.requestRows()).toBe(rows);
      expect((await sent(u.head.account, h.groupBody(paid, [e1, e2], { termMonths: 12 }))).type).toBe('GROUP_GRANT');
    });
  });

  describe('the head among the people (US-05-03 AC-8, US-05-17 AC-3, AC-16)', () => {
    it('BR-MF1-02 refuses the head in their own group before creating requests or steps', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);

      const before = await h.requestRows();
      const response = await h.submitGroup(h.groupBody(paid, [e1, e2, u.head]), u.head.account).expect(422);
      expect(response.body as Refused).toMatchObject({
        error: {
          code: 'GROUP_REQUEST.LINES_REFUSED',
          details: { lines: [{ employeeId: u.head.employeeId, reason: 'HEAD_IN_GROUP' }] },
        },
      });
      expect(await h.requestRows()).toBe(before);
    });

    it('BR-MF1-02 check reports HEAD_IN_GROUP before the head can submit a line for themselves', async () => {
      const u = await unit();
      const [e1] = await h.colleagues(u, 1);
      const checked = h.dataOf<CheckWire>(
        await h.checkGroup(h.groupBody(paid, [e1, u.head]), u.head.account).expect(200),
      );
      expect(checked.lines).toContainEqual({
        employeeId: u.head.employeeId,
        ok: false,
        reason: 'HEAD_IN_GROUP',
        manyPaidSoftware: null,
      });
    });

    it('refuses a request of the head alone: a group names two people at least, and the request of one is an individual one (QĐ-100aa)', async () => {
      const u = await unit();
      const rows = await h.requestRows();

      const refused = await h.submitGroup(h.groupBody(paid, [u.head]), u.head.account).expect(422);

      expect(refused.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.TOO_FEW_LINES', details: { min: 2 } },
      });
      expect(await h.requestRows()).toBe(rows);
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

    it('BR-MF1-02 an employee cannot include the head in the group either', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);

      const before = await h.requestRows();
      const response = await h.submitGroup(h.groupBody(paid, [e1, e2, u.head]), e1.account).expect(422);
      expect(response.body as Refused).toMatchObject({
        error: {
          code: 'GROUP_REQUEST.LINES_REFUSED',
          details: { lines: [{ employeeId: u.head.employeeId, reason: 'HEAD_IN_GROUP' }] },
        },
      });
      expect(await h.requestRows()).toBe(before);
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
        // An intern has a term: the group has to name the end date for them (`FR-2.8`).
        [e2.employeeId, false, 'TERM_REQUIRED'],
        [e3.employeeId, false, 'EMAIL_REQUIRED'],
      ]);
      expect(refused.body as Refused).toMatchObject({
        error: {
          code: 'GROUP_REQUEST.LINES_REFUSED',
          details: {
            lines: [
              { employeeId: outsider.employeeId, reason: 'OUTSIDE_DEPARTMENT' },
              { employeeId: e2.employeeId, reason: 'TERM_REQUIRED' },
              { employeeId: e3.employeeId, reason: 'EMAIL_REQUIRED' },
            ],
          },
        },
      });
      expect(await h.requestRows()).toBe(rows);
    });

    it('FR-2.8: needs the end date of the group for an intern, takes it for every line, and takes no end date of one line alone', async () => {
      // Rewritten from "takes no end day of an intern from the sender" (Q-03): the group names one end date for all of its people now.
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN' WHERE id = $1`, [e2.employeeId]);
      const perLine = {
        ...h.groupBody(paid, [e1, e2]),
        lines: [{ employeeId: e1.employeeId }, { employeeId: e2.employeeId, expectedEndDate: '2099-12-31' }],
      };

      const refusedLine = await h.submitGroup(perLine, u.head.account).expect(422);
      const refusedNone = await h.submitGroup(h.groupBody(paid, [e1, e2]), u.head.account).expect(422);
      const request = await sent(u.head.account, h.groupBody(paid, [e1, e2], { expectedEndDate: h.today() }));

      expect(h.codeOf(refusedLine)).toBe('VALIDATION_ERROR');
      expect(refusedNone.body as Refused).toMatchObject({
        error: {
          code: 'GROUP_REQUEST.LINES_REFUSED',
          details: { lines: [{ employeeId: e2.employeeId, reason: 'TERM_REQUIRED' }] },
        },
      });
      expect((await h.lineRows(request.id)).map((line) => line.expected_end_date)).toEqual([h.today(), h.today()]);
    });

    it('names a person twice, and refuses a plan that is not for a group by what it grants and never by its name', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const dupe = await h
        .submitGroup(
          {
            ...h.groupBody(paid, [e1, e2]),
            lines: [{ employeeId: e1.employeeId }, { employeeId: e2.employeeId }, { employeeId: e2.employeeId }],
          },
          u.head.account,
        )
        .expect(422);
      // One person named twice is one person: fewer than the two a group needs.
      const twiceOnly = await h
        .submitGroup(
          { ...h.groupBody(paid, [e1]), lines: [{ employeeId: e1.employeeId }, { employeeId: e1.employeeId }] },
          u.head.account,
        )
        .expect(422);
      const single = await h.planOf(await h.subscription(10, 'K1'));
      const internal = await h.plan('K5');

      const k1 = await h.submitGroup(h.groupBody(single, [e1, e2]), u.head.account).expect(422);
      const free = await h.submitGroup(h.groupBody(internal, [e1, e2]), u.head.account).expect(422);

      expect(dupe.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.DUPLICATE_LINE', details: { employeeIds: [e2.employeeId] } },
      });
      expect(twiceOnly.body as Refused).toMatchObject({ error: { code: 'GROUP_REQUEST.TOO_FEW_LINES' } });
      expect(k1.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.PLAN_NOT_ELIGIBLE', details: { reason: 'KIND_NOT_MULTI_SEAT' } },
      });
      expect(free.body as Refused).toMatchObject({
        error: { code: 'GROUP_REQUEST.PLAN_NOT_ELIGIBLE', details: { reason: 'NOT_PAID_SOFTWARE' } },
      });
      const checked = h.dataOf<CheckWire>(
        await h.checkGroup(h.groupBody(single, [e1, e2]), u.head.account).expect(200),
      );
      expect(checked.plan).toEqual({ eligible: false, reason: 'KIND_NOT_MULTI_SEAT' });
    });

    it('refuses a person who holds a seat of the plan and one for whom a request for it is open', async () => {
      const u = await unit();
      const [e1, e2, e3, e4] = await h.colleagues(u, 4);
      const subscription = await h.subscription(10);
      const plan = await h.planOf(subscription);
      await h.written({ subscriptionId: subscription }, [
        { employee_code: e1.code, account_identifier: `${e1.code.toLowerCase()}@acme.vn` },
      ]);
      await sent(u.head.account, h.groupBody(plan, [e3, e4]));

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
        amountPerPerson: { amount: String(M * monthsLeft) },
        pricing: { status: 'PRICED', amount: { amount: String(2 * M * monthsLeft) } },
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
      expect(ids).toEqual(expect.arrayContaining([e1.employeeId, e2.employeeId]));
      expect(ids).not.toContain(u.head.employeeId);
      expect(ids).not.toContain(left.employeeId);
      for (const item of page.items) expect(Object.keys(item).sort()).toEqual(['employeeId', 'fullName', 'workEmail']);
      const searched = h.dataOf<{ items: Array<{ employeeId: string }> }>(
        await h.candidates(e1.account, { q: e2.code.toLowerCase() }).expect(200),
      );
      expect(searched.items.map((item) => item.employeeId)).toEqual([e2.employeeId]);
    });
  });

  describe('the spending approver is no party of a group (US-05-17 AC-18, US-05-02 AC-13, US-03-02 AC-15)', () => {
    /** The spending approver is a person of this department for the length of a test, and the installation's approver again after. */
    const withApproverIn = async (
      u: Unit,
      test: (approver: Awaited<ReturnType<GroupHarness['colleague']>>) => Promise<void>,
    ) => {
      const approver = await h.colleague(u);
      await h.setRole('SPENDING_APPROVER', approver);
      try {
        await test(approver);
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    };

    it('refuses the candidate list to the spending approver with REQUEST_PARTY.INELIGIBLE', async () => {
      const refused = await h.candidates(h.boss.account).expect(422);

      expect(h.codeOf(refused)).toBe('REQUEST_PARTY.INELIGIBLE');
      expect(h.detailsOf(refused)).toEqual({
        reason: 'SPENDING_APPROVER',
        party: 'REQUESTER',
        employeeIds: [h.boss.employeeId],
      });
    });

    it('leaves the spending approver out of the candidates before the page is cut, so the total is right', async () => {
      const u = await unit();
      await h.colleagues(u, 2);
      const page = async () =>
        h.dataOf<{ items: Array<{ employeeId: string }>; pagination: { totalItems: number } }>(
          await h.candidates(u.head.account, { pageSize: 2 }).expect(200),
        ).pagination.totalItems;
      const before = await page();

      await withApproverIn(u, async (approver) => {
        const listed = h.dataOf<{ items: Array<{ employeeId: string }>; pagination: { totalItems: number } }>(
          await h.candidates(u.head.account, { q: approver.code.toLowerCase() }).expect(200),
        );

        expect(listed.items).toEqual([]);
        expect(listed.pagination.totalItems).toBe(0);
        // A person of the department was added and nobody is listed more: the approver is not counted.
        expect(await page()).toBe(before);
      });
    });

    it('gives the line of the spending approver a reason of its own, in the check and in the sending, and leaves the other lines as they were', async () => {
      const u = await unit();
      const [e1] = await h.colleagues(u, 1);
      const other = await unit();
      const [outsider] = await h.colleagues(other, 1);
      const rows = await h.requestRows();
      await withApproverIn(u, async (approver) => {
        const body = h.groupBody(paid, [e1, approver, outsider]);

        const checked = h.dataOf<CheckWire>(await h.checkGroup(body, u.head.account).expect(200));
        const refused = await h.submitGroup(body, u.head.account).expect(422);

        expect(checked.lines.map((line) => [line.employeeId, line.ok, line.reason])).toEqual([
          [e1.employeeId, true, null],
          [approver.employeeId, false, 'SPENDING_APPROVER'],
          [outsider.employeeId, false, 'OUTSIDE_DEPARTMENT'],
        ]);
        expect(refused.body as Refused).toMatchObject({
          error: {
            code: 'GROUP_REQUEST.LINES_REFUSED',
            details: {
              lines: [
                { employeeId: approver.employeeId, reason: 'SPENDING_APPROVER' },
                { employeeId: outsider.employeeId, reason: 'OUTSIDE_DEPARTMENT' },
              ],
            },
          },
        });
      });
      expect(await h.requestRows()).toBe(rows);
    });

    it('refuses the group the spending approver sends, in the check and in the sending, with the answer of every other route', async () => {
      const [e1, e2] = await h.colleagues(await unit(), 2);
      const rows = await h.requestRows();
      const body = h.groupBody(paid, [e1, e2]);

      for (const refused of [await h.checkGroup(body, h.boss.account), await h.submitGroup(body, h.boss.account)]) {
        expect(refused.status).toBe(422);
        expect(h.codeOf(refused)).toBe('REQUEST_PARTY.INELIGIBLE');
        expect(h.detailsOf(refused)).toEqual({
          reason: 'SPENDING_APPROVER',
          party: 'REQUESTER',
          employeeIds: [h.boss.employeeId],
        });
      }
      expect(await h.requestRows()).toBe(rows);
    });
  });

  describe('the plan of a group is read from the plan, whatever it is called (AC-14)', () => {
    it('takes a plan of the kind of grant that gives each person an account, renamed or not', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      await h.ctx.sql.query(`UPDATE plans SET name = 'Anything else entirely' WHERE id = $1`, [paid]);

      const request = await sent(u.head.account, h.groupBody(paid, [e1, e2]));

      expect(request.type).toBe('GROUP_GRANT');
    });
  });
});
