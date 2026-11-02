import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;

interface Refused {
  error: { code: string; details?: { missing?: string[]; extra?: string[] } };
}

describe('the edges of a request for a group over PostgreSQL (US-05-17 AC-5, AC-8, AC-9, AC-16, US-06-08 AC-10)', () => {
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-Y${counter}`);
    await h.roomFor(made);

    return made;
  };
  const approve = (employeeId: string) => ({ employeeId, decision: 'APPROVE' });

  it('prices and chains a group of five for a subscription with only three seats left, as paid software with a spend step (AC-5)', async () => {
    const u = await unit();
    const people = await h.colleagues(u, 5);
    const subscription = await h.subscription(10);
    const plan = await h.planOf(subscription);
    // Seven seats of the ten are held by other people of the department: three are left, for five people.
    const holders = await h.colleagues(u, 7);
    await h.written(
      { subscriptionId: subscription },
      holders.map((person) => ({
        employee_code: person.code,
        account_identifier: `${person.code.toLowerCase()}@acme.vn`,
      })),
    );

    const checked = h.dataOf<{
      hasSpendStep: boolean;
      lineCount: number;
      pricing: { status: string; amount: { amount: string } };
    }>(await h.checkGroup(h.groupBody(plan, people), u.head.account).expect(200));
    const sent = h.dataOf<{ request: { branch: string; state: string; policy: { hasSpendStep: boolean } } }>(
      await h.submitGroup(h.groupBody(plan, people), u.head.account).expect(201),
    ).request;

    expect(checked).toMatchObject({
      hasSpendStep: true,
      lineCount: 5,
      pricing: { status: 'PRICED', amount: { amount: '60000000' } },
    });
    expect(sent).toMatchObject({
      branch: 'PAID_IN_CATALOG',
      state: 'AWAITING_SPEND_SUBMISSION',
      policy: { hasSpendStep: true },
    });
  });

  it('closes the step of the head when every person of it was withdrawn, and keeps the request for the line that is left (FR-3.16, US-05-17)', async () => {
    const u = await unit();
    const plan = await h.planOf(await h.subscription(10));
    const [e1, e2] = await h.colleagues(u, 2);
    const id = h.dataOf<{ request: { id: string } }>(
      await h.submitGroup(h.groupBody(plan, [e1, e2, u.head]), e1.account).expect(201),
    ).request.id;

    await h.withdrawLine(id, e1.employeeId, {}, e1.account).expect(200);
    await h.withdrawLine(id, e2.employeeId, {}, e1.account).expect(200);

    expect((await h.needSteps(id)).map((step) => step.state)).toEqual(['CLOSED', 'PENDING']);
    expect(await h.lineStates(id)).toEqual(['WITHDRAWN', 'WITHDRAWN', 'AWAITING_NEED']);
    expect(await h.state(id)).toBe('PENDING');
  });

  it('reads the seats of one person of a group for the head who holds their step, and for nobody else (US-05-04 AC-3)', async () => {
    const u = await unit();
    const plan = await h.planOf(await h.subscription(10));
    const [e1, e2] = await h.colleagues(u, 2);
    const id = h.dataOf<{ request: { id: string } }>(
      await h.submitGroup(h.groupBody(plan, [e1, e2, u.head]), e1.account).expect(201),
    ).request.id;
    const outsider = await h.colleague(await unit());

    await h.similarSeats(id, u.head.account, { employeeId: e1.employeeId }).expect(200);
    const unnamed = await h.similarSeats(id, u.head.account).expect(422);
    const own = await h.similarSeats(id, u.head.account, { employeeId: u.head.employeeId }).expect(404);
    const notHolder = await h.similarSeats(id, e2.account, { employeeId: e1.employeeId }).expect(403);
    await h.similarSeats(id, outsider.account, { employeeId: e1.employeeId }).expect(404);

    expect(h.codeOf(unnamed)).toBe('ACCESS_REQUEST.EMPLOYEE_REQUIRED');
    expect(h.codeOf(own)).toBe('ACCESS_REQUEST.NOT_FOUND');
    expect(h.codeOf(notHolder)).toBe('ACCESS_REQUEST.NOT_THE_ASSIGNEE');
  });

  it('measures the time of a group like any request: where it waited and, once every grant is done, how long it took (US-05-15 AC-1)', async () => {
    const u = await unit();
    const subscription = await h.subscription(10);
    const plan = await h.planOf(subscription);
    const people = await h.colleagues(u, 2);
    const id = await h.groupApproved(u, plan, people);
    for (const person of people) {
      const task = h.dataOf<{ task: { id: string } }>(
        await h
          .grantLine({ requestId: id, beneficiaryEmployeeId: person.employeeId, subscriptionId: subscription }, h.it1)
          .expect(201),
      ).task;
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Invited by work email' }).expect(200);
    }

    const timings = h.dataOf<{
      timings: { countedInKpi: boolean; grantCompletedAt: string | null; segments: Record<string, object | null> };
    }>(await h.timings(id, u.head.account).expect(200)).timings;

    expect(timings.countedInKpi).toBe(true);
    expect(timings.grantCompletedAt).not.toBeNull();
    expect(
      Object.entries(timings.segments)
        .filter(([, segment]) => segment !== null)
        .map(([kind]) => kind),
    ).toEqual(expect.arrayContaining(['NEED', 'SPEND_DECISION', 'GRANT']));
  });

  it('keeps the end day of a person who is not staff on their line and on their seat (AC-8)', async () => {
    const u = await unit();
    const subscription = await h.subscription(10);
    const plan = await h.planOf(subscription);
    const [e1, e2] = await h.colleagues(u, 2);
    await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN' WHERE id = $1`, [e2.employeeId]);
    const sent = h.dataOf<{ request: { id: string } }>(
      await h
        .submitGroup(
          h.groupBody(plan, [e1, e2], {
            lines: [{ employeeId: e1.employeeId }, { employeeId: e2.employeeId, expectedEndDate: '2099-12-31' }],
          }),
          u.head.account,
        )
        .expect(201),
    ).request;
    await h.setPlanLine(sent.id, { offPlan: true }, u.head.account).expect(200);
    await h.sendOn([sent.id], u.head.account).expect(201);
    await h
      .decideSpendLines(sent.id, { lines: [approve(e1.employeeId), approve(e2.employeeId)] }, h.boss.account)
      .expect(200);

    await h
      .grantLine({ requestId: sent.id, beneficiaryEmployeeId: e2.employeeId, subscriptionId: subscription }, h.it1)
      .expect(201);
    await h
      .grantLine({ requestId: sent.id, beneficiaryEmployeeId: e1.employeeId, subscriptionId: subscription }, h.it1)
      .expect(201);

    const seats = await h.ctx.sql.query<{ employee_id: string; expected_end_date: string | null }>(
      `SELECT employee_id, expected_end_date::text FROM license_assignments WHERE employee_id = ANY($1::uuid[])`,
      [[e1.employeeId, e2.employeeId]],
    );
    expect(Object.fromEntries(seats.rows.map((row) => [row.employee_id, row.expected_end_date]))).toEqual({
      [e1.employeeId]: null,
      [e2.employeeId]: '2099-12-31',
    });
  });

  it('refuses the head who declares their own line in the step of the others: it is not a line of that step (AC-16)', async () => {
    const u = await unit();
    const plan = await h.planOf(await h.subscription(10));
    const [e1, e2] = await h.colleagues(u, 2);
    const id = h.dataOf<{ request: { id: string } }>(
      await h.submitGroup(h.groupBody(plan, [e1, e2, u.head]), e1.account).expect(201),
    ).request.id;

    const attempt = await h
      .decideLines(
        id,
        {
          lines: [approve(e1.employeeId), approve(e2.employeeId), approve(u.head.employeeId)],
          spend: { offPlan: true },
        },
        u.head.account,
      )
      .expect(422);

    expect((attempt.body as Refused).error).toMatchObject({
      code: 'GROUP_REQUEST.LINES_MISMATCH',
      details: { extra: [u.head.employeeId] },
    });
    expect(await h.lineStates(id)).toEqual(['AWAITING_NEED', 'AWAITING_NEED', 'AWAITING_NEED']);
  });

  it('checks the people approved again when the approver decides: an exception that Finance has not looked at goes back, and nobody is decided (AC-9)', async () => {
    counter += 1;
    const u = await h.departmentWithHead(`P-Y${counter}`);
    const plan = await h.planOf(await h.subscription(100));
    const people = await h.colleagues(u, 2);
    const version = await h.budgetFor(u, { total: 1_000_000 * M, percent: 1 });
    const following = await h.budgetFor(u, { total: 1_000_000 * M, percent: 1, year: h.next });
    const id = await h.groupWaiting(u, plan, people);
    const spent = await h.steps(id, 'SPEND_APPROVAL');
    expect(spent).toHaveLength(1);
    // Money is held against the budget after the request was sent on, so the check made again is not an ordinary one any more.
    await h.commit(u, version.id, h.year, 999_000 * M, 'HELD');
    await h.commit(u, following.id, h.next, 999_000 * M, 'HELD');

    const bounced = await h
      .decideSpendLines(id, { lines: people.map((person) => approve(person.employeeId)) }, h.boss.account)
      .expect(409);

    expect(h.codeOf(bounced)).toBe('SPEND.RECHECKED_NEEDS_FINANCE_REVIEW');
    expect(await h.lineStates(id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED']);
    expect(await h.commitments(id)).toEqual([]);
    expect((await h.steps(id, 'SPEND_APPROVAL')).map((step) => step.state)).toEqual(['CLOSED']);
    expect((await h.steps(id, 'FINANCE_REVIEW')).map((step) => step.state)).toEqual(['PENDING']);
  });

  it('has no line of the spending approver any more: the group is refused for that line, and nothing is written (US-05-17 AC-18, D-S21)', async () => {
    const u = await unit();
    const plan = await h.planOf(await h.subscription(10));
    const [e1] = await h.colleagues(u, 1);
    const approver = await h.colleague(u);
    await h.setRole('SPENDING_APPROVER', approver);
    const rows = await h.requestRows();
    try {
      const refused = await h.submitGroup(h.groupBody(plan, [e1, approver]), u.head.account).expect(422);

      expect(h.codeOf(refused)).toBe('GROUP_REQUEST.LINES_REFUSED');
      expect(h.detailsOf(refused)).toEqual({
        lines: [{ employeeId: approver.employeeId, reason: 'SPENDING_APPROVER' }],
      });
      expect(await h.requestRows()).toBe(rows);
    } finally {
      await h.setRole('SPENDING_APPROVER', h.boss);
    }
  });
});
