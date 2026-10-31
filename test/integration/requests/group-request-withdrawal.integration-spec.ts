import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

interface TaskWire {
  id: string;
  status: string;
}
interface Refused {
  error: { code: string; details?: { assignmentId?: string; employeeIds?: string[] } };
}

describe('withdrawing one person of a request for a group, or what is left of it, over PostgreSQL (US-05-17 AC-10, US-05-08)', () => {
  let subscriptionId: string;
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(100);
    paid = await h.planOf(subscriptionId);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-X${counter}`);
    await h.roomFor(made);

    return made;
  };
  const approved = async (count = 3) => {
    const u = await unit();
    const people = await h.colleagues(u, count);

    return { u, people, id: await h.groupApproved(u, paid, people) };
  };
  const granted = async (id: string, employeeId: string) =>
    h.dataOf<{ task: TaskWire }>(
      await h.grantLine({ requestId: id, beneficiaryEmployeeId: employeeId, subscriptionId }, h.it1).expect(201),
    ).task;
  const worked = async (taskId: string) => h.claim(taskId).expect(200);
  const completed = async (taskId: string) => {
    await worked(taskId);
    await h.complete(taskId, { evidence: 'Invited by work email' }).expect(200);
  };
  const failed = async (taskId: string) => {
    await worked(taskId);
    await h.fail(taskId, { reason: 'The vendor refused the invitation' }).expect(200);
  };
  const sum = (rows: Array<{ amount_minor: string }>) =>
    rows.reduce((total, row) => total + BigInt(row.amount_minor), 0n);
  const releases = async (id: string) =>
    (
      await h.ctx.sql.query<{ reason: string; amount_minor: string }>(
        `SELECT r.reason::text, r.amount_minor::text FROM budget_commitment_releases r
           JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = $1 ORDER BY r.id`,
        [id],
      )
    ).rows;
  const taskStatuses = async (id: string) =>
    (
      await h.ctx.sql.query<{ status: string; cancelled_at: Date | null }>(
        `SELECT t.status::text, a.cancelled_at FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id
          WHERE t.request_id = $1 ORDER BY a.employee_id`,
        [id],
      )
    ).rows;
  const shareOf = async (id: string, employeeId: string) =>
    (await h.shares(id)).filter((row) => row.employee_id === employeeId);

  describe('before the spend there is no money to give back (AC-10)', () => {
    it('ends the line of the person and prices the request again for those who remain, and the others are decided as they were', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const id = await h.groupWaiting(u, paid, [e1, e2, e3]);

      await h.withdrawLine(id, e3.employeeId, { reason: 'Left the project' }, u.head.account).expect(200);

      expect(await h.lineStates(id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'WITHDRAWN']);
      const rows = await h.lineRows(id);
      expect(rows[2]).toMatchObject({ ended_by_employee_id: u.head.employeeId, end_reason: 'Left the project' });
      const request = h.dataOf<{ request: { state: string; pricing: { amount: { amount: string } } } }>(
        await h.fetch(id, u.head.account).expect(200),
      ).request;
      expect(request.pricing.amount.amount).toBe('24000000');
      expect(await h.commitments(id)).toEqual([]);
      const all = [e1, e2, e3].map((p) => ({ employeeId: p.employeeId, decision: 'APPROVE' }));
      expect(h.codeOf(await h.decideSpendLines(id, { lines: all }, h.boss.account).expect(422))).toBe(
        'GROUP_REQUEST.LINES_MISMATCH',
      );
      await h.decideSpendLines(id, { lines: all.slice(0, 2) }, h.boss.account).expect(200);
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'WITHDRAWN']);
    });

    it('withdraws everybody, which ends the request as withdrawn and closes the step the approver held', async () => {
      const u = await unit();
      const people = await h.colleagues(u, 3);
      const id = await h.groupWaiting(u, paid, people);

      await h.withdrawRequest(id, { reason: 'The project was cancelled' }, u.head.account).expect(200);

      expect(await h.state(id)).toBe('WITHDRAWN');
      expect(await h.lineStates(id)).toEqual(['WITHDRAWN', 'WITHDRAWN', 'WITHDRAWN']);
      expect((await h.steps(id, 'SPEND_APPROVAL')).map((step) => step.state)).toEqual(['CLOSED']);
      expect(await h.commitments(id)).toEqual([]);
      const row = await h.ctx.sql.query<{ withdrawn_by_employee_id: string }>(
        `SELECT withdrawn_by_employee_id FROM access_requests WHERE id = $1`,
        [id],
      );
      expect(row.rows[0].withdrawn_by_employee_id).toBe(u.head.employeeId);
    });
  });

  describe('once the spend is approved the share of the person goes back and nobody else’s does (AC-10)', () => {
    it('gives back exactly the share of the person withdrawn: the example of three million of twelve', async () => {
      const { u, people, id } = await approved(4);
      const [, , , e4] = people;
      const share = await shareOf(id, e4.employeeId);
      const held = sum(await h.commitments(id));

      await h.withdrawLine(id, e4.employeeId, {}, u.head.account).expect(200);

      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'APPROVED', 'WITHDRAWN']);
      const given = await releases(id);
      expect(given.every((row) => row.reason === 'PARTICIPANT_WITHDRAWN')).toBe(true);
      expect(sum(given)).toBe(sum(share));
      expect(sum(given) * 4n).toBe(held);
      expect((await h.shares(id)).filter((row) => row.released_at !== null).map((row) => row.employee_id)).toEqual(
        share.map((row) => row.employee_id),
      );
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
    });

    it('cancels the task and the assignment of a person nobody has worked, as cancelled and never as failed', async () => {
      const { u, people, id } = await approved(3);
      await granted(id, people[2].employeeId);

      await h.withdrawLine(id, people[2].employeeId, {}, u.head.account).expect(200);

      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'WITHDRAWN']);
      const [task] = await taskStatuses(id);
      expect(task).toMatchObject({ status: 'CANCELLED' });
      expect(task.cancelled_at).not.toBeNull();
      expect((await releases(id)).length).toBeGreaterThan(0);
    });

    it('refuses while the task is being worked and when the seat is real, saying where the seat is', async () => {
      const { u, people, id } = await approved(3);
      const running = await granted(id, people[0].employeeId);
      const finished = await granted(id, people[1].employeeId);
      await worked(running.id);
      await completed(finished.id);

      const busy = await h.withdrawLine(id, people[0].employeeId, {}, u.head.account).expect(409);
      const real = await h.withdrawLine(id, people[1].employeeId, {}, u.head.account).expect(409);

      expect(h.codeOf(busy)).toBe('ACCESS_REQUEST.GRANT_RUNNING');
      expect(h.codeOf(real)).toBe('ACCESS_REQUEST.GRANT_COMPLETED');
      expect((real.body as Refused).error.details?.assignmentId).toEqual(expect.any(String));
      expect(await h.lineStates(id)).toEqual(['EXECUTING', 'COMPLETED', 'APPROVED']);
      expect(await releases(id)).toEqual([]);
    });

    it('lets the line wait for the IT Admin when the grant had failed, and ends it, giving back the share, when the task is cancelled', async () => {
      const { u, people, id } = await approved(2);
      const task = await granted(id, people[0].employeeId);
      await failed(task.id);

      await h.withdrawLine(id, people[0].employeeId, { reason: 'Not needed any more' }, u.head.account).expect(200);
      expect(await h.lineStates(id)).toEqual(['AWAITING_IT_CLOSE', 'APPROVED']);
      expect(await releases(id)).toEqual([]);
      const again = await h.withdrawLine(id, people[0].employeeId, {}, u.head.account).expect(409);
      expect(h.codeOf(again)).toBe('ACCESS_REQUEST.WITHDRAWAL_PENDING');
      const retry = await h.retry(task.id).expect(409);
      expect(h.codeOf(retry)).toBe('PROVISIONING_TASK.WITHDRAWAL_PENDING');

      await h.cancelTask(task.id).expect(200);

      expect(await h.lineStates(id)).toEqual(['WITHDRAWN', 'APPROVED']);
      expect((await releases(id)).every((row) => row.reason === 'PARTICIPANT_WITHDRAWN')).toBe(true);
      const mine = await h.lineRows(id);
      expect(mine[0]).toMatchObject({ ended_by_employee_id: u.head.employeeId, end_reason: 'Not needed any more' });
    });

    it('is the right of the sender, not of the person withdrawn nor of a stranger', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const id = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(paid, [e1, e2, e3]), e1.account).expect(201),
      ).request.id;
      const stranger = await h.colleague(await unit());

      expect(h.codeOf(await h.withdrawLine(id, e3.employeeId, {}, e3.account).expect(403))).toBe(
        'ACCESS_REQUEST.NOT_REQUESTER',
      );
      expect(h.codeOf(await h.withdrawLine(id, e3.employeeId, {}, u.head.account).expect(403))).toBe(
        'ACCESS_REQUEST.NOT_REQUESTER',
      );
      await h.withdrawLine(id, e3.employeeId, {}, stranger.account).expect(404);
      await h.withdrawLine(id, e3.employeeId, {}, e1.account).expect(200);
      expect(await h.lineStates(id)).toEqual(['AWAITING_NEED', 'AWAITING_NEED', 'WITHDRAWN']);
    });
  });

  describe('the whole request when a person has a seat already (AC-10)', () => {
    it('withdraws every person who has not ended, keeps the one who was granted, and gives back what the others held', async () => {
      const { u, people, id } = await approved(3);
      const [e1, e2, e3] = people;
      const done = await granted(id, e1.employeeId);
      await completed(done.id);
      await granted(id, e2.employeeId);
      const others = [...(await shareOf(id, e2.employeeId)), ...(await shareOf(id, e3.employeeId))];

      await h.withdrawRequest(id, { reason: 'The rest are not needed' }, u.head.account).expect(200);

      expect(await h.lineStates(id)).toEqual(['COMPLETED', 'WITHDRAWN', 'WITHDRAWN']);
      expect(await h.state(id)).toBe('COMPLETED');
      const given = await releases(id);
      expect(given.every((row) => row.reason === 'REQUEST_WITHDRAWN')).toBe(true);
      expect(sum(given)).toBe(sum(others));
      expect((await taskStatuses(id)).map((task) => task.status).sort()).toEqual(['CANCELLED', 'COMPLETED']);
    });

    it('refuses the whole when a task is being worked, and changes nothing', async () => {
      const { u, people, id } = await approved(3);
      const task = await granted(id, people[0].employeeId);
      await worked(task.id);

      const refused = await h.withdrawRequest(id, {}, u.head.account).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.GRANT_RUNNING');
      expect(await h.lineStates(id)).toEqual(['EXECUTING', 'APPROVED', 'APPROVED']);
      expect(await releases(id)).toEqual([]);
    });
  });
});
