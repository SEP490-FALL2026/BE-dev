import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.1 (F29, `QĐ-90b`, spec L.8): the IT Admin closes the part of a request that is not
 * yet granted because the person it is for was transferred to another department, as they close it because the person left, with the
 * difference that the person still works and the request keeps the department it was sent from. The transfer must be real, the reason
 * is kept, a task that is open needs the confirmation of the vendor check, only what is not spent goes back to the budget, and a grant
 * that is done is not undone here. Over HTTP, on real PostgreSQL.
 */
const h = new GroupHarness();
const M = 1_000_000;

interface RequestWire {
  id: string;
  state: string;
  cancellation: { cancelledBy: { employeeId: string }; cancelledAt: string; cause: string; note: string | null } | null;
}
interface TaskWire {
  id: string;
  status: string;
}

describe('closing a request because its person was transferred (integration, real PostgreSQL)', () => {
  let subscriptionId: string;
  let plan: string;
  let n = 0;
  const reason = { cause: 'BENEFICIARY_TRANSFERRED', note: 'Moved to the sales department on Monday' };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(100);
    plan = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a budget of 200 million (20 held, 40 spent), a person of it, and the department they will be moved to. */
  const example = async (): Promise<Unit & { person: Person; target: Unit }> => {
    n += 1;
    const u = await h.departmentWithHead(`P-TR${n}`);
    await h.budgetFor(u, { total: 200 * M, held: 20 * M, spent: 40 * M });
    const person = await h.staff(u.department, `TR-E${n}`);

    return { ...u, person, target: await h.departmentWithHead(`P-TT${n}`) };
  };
  /** A paid request of the person, approved by their head and by the approver: it waits to be carried out. */
  const approvedFor = async (u: Unit, person: Person, amount: number): Promise<string> => {
    const sent = await h.sent(person, plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.setPayments(sent.id, { amount });
    await h.sendOn([sent.id], u.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  };
  /** A seat is taken on the subscription the department of the request owns (F20), which the harness gives every department. */
  const granted = async (requestId: string): Promise<string> =>
    h.dataOf<{ task: TaskWire }>(await h.grant({ requestId, subscriptionId }).expect(201)).task.id;
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ state: string; amount_minor: string; released_minor: string }>(
        `SELECT state::text, amount_minor::text, released_minor::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const taskOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ status: string }>(`SELECT status::text FROM provisioning_tasks WHERE request_id = $1`, [
        requestId,
      ])
    ).rows[0];

  describe('a request for one person', () => {
    it('BR-MF1-02/07: a request awaiting requester revision remains open and can be closed after transfer', async () => {
      const u = await example();
      const id = (await h.sent(u.person, plan, { termMonths: 1 })).id;
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET state = 'NOT_REQUIRED', assignee_employee_id = NULL, assigned_at = NULL,
           waiting_reason = NULL, waiting_since = NULL WHERE request_id = $1 AND kind = 'NEED'`,
        [id],
      );
      await h.ctx.sql.query(
        `UPDATE access_requests SET state = 'AWAITING_REQUESTER_REVISION', routing_mode = 'ONE_STEP', one_step_reason = 'HEAD_LEFT' WHERE id = $1`,
        [id],
      );
      await h.moveTo(u.person.employeeId, u.target.department.id);

      expect(await h.state(id)).toBe('AWAITING_REQUESTER_REVISION');
      const response = await h.closeForDeparture(id, reason, h.it1).expect(200);

      expect(h.dataOf<{ request: RequestWire }>(response).request).toMatchObject({
        state: 'CANCELLED',
        cancellation: { cause: 'BENEFICIARY_TRANSFERRED', note: reason.note },
      });
      expect(await commitmentOf(id)).toBeUndefined();
      expect(await taskOf(id)).toBeUndefined();
    });

    it('ends a request that was approved and not granted as cancelled, with the reason, and gives the money back', async () => {
      const u = await example();
      const id = await approvedFor(u, u.person, 15 * M);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      await h.moveTo(u.person.employeeId, u.target.department.id);

      const response = await h.closeForDeparture(id, reason, h.it1).expect(200);

      const request = h.dataOf<{ request: RequestWire }>(response).request;
      expect(request).toMatchObject({
        state: 'CANCELLED',
        cancellation: {
          cause: 'BENEFICIARY_TRANSFERRED',
          note: 'Moved to the sales department on Monday',
          cancelledBy: { employeeId: h.it1.employeeId },
        },
      });
      expect(await h.state(id)).toBe('CANCELLED');
      expect(await commitmentOf(id)).toMatchObject({ state: 'RELEASED', released_minor: String(15 * M) });
      const [event] = await h.audit('ACCESS_REQUEST.CANCELLED', id);
      expect(event.after).toMatchObject({
        requestId: id,
        from: 'AWAITING_EXECUTION',
        to: 'CANCELLED',
        reasonKind: 'BENEFICIARY_TRANSFERRED',
        cancelledByEmployeeId: h.it1.employeeId,
        commitmentsReleased: 1,
      });
      // It is one closing: a second finds nothing left, and the request keeps the department it was sent from.
      expect(h.codeOf(await h.closeForDeparture(id, reason, h.it1).expect(409))).toBe('ACCESS_REQUEST.ALREADY_ENDED');
    });

    it('needs its reason, and the person to have been transferred: one who still sits where the request was sent from, or who left, was not', async () => {
      const still = await example();
      const stillId = await approvedFor(still, still.person, 10 * M);
      const gone = await example();
      const goneId = await approvedFor(gone, gone.person, 10 * M);
      await h.depart(gone.person);
      const moved = await example();
      const movedId = await approvedFor(moved, moved.person, 10 * M);
      await h.moveTo(moved.person.employeeId, moved.target.department.id);

      const noReason = await h.closeForDeparture(movedId, { cause: 'BENEFICIARY_TRANSFERRED' }, h.it1).expect(422);
      const notMoved = await h.closeForDeparture(stillId, reason, h.it1).expect(409);
      const left = await h.closeForDeparture(goneId, reason, h.it1).expect(409);
      const movedNotLeft = await h
        .closeForDeparture(movedId, { cause: 'BENEFICIARY_LEFT', note: 'Left' }, h.it1)
        .expect(409);

      expect(h.codeOf(noReason)).toBe('VALIDATION_ERROR');
      expect([notMoved, left].map((response) => h.codeOf(response))).toEqual([
        'ACCESS_REQUEST.BENEFICIARY_NOT_TRANSFERRED',
        'ACCESS_REQUEST.BENEFICIARY_NOT_TRANSFERRED',
      ]);
      expect(h.codeOf(movedNotLeft)).toBe('ACCESS_REQUEST.BENEFICIARY_NOT_LEFT');
      for (const id of [stillId, goneId, movedId]) {
        expect(await h.state(id)).toBe('AWAITING_EXECUTION');
        expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
      }
    });

    it('needs the confirmation of the vendor check for a task that is open, and then cancels it and frees the seat', async () => {
      const u = await example();
      const id = await approvedFor(u, u.person, 10 * M);
      await granted(id);
      const free = await h.freeSeats(subscriptionId);
      await h.moveTo(u.person.employeeId, u.target.department.id);

      const refused = await h.closeForDeparture(id, reason, h.it1).expect(422);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.EVIDENCE_REQUIRED');
      expect(await h.state(id)).toBe('EXECUTING');
      expect(await taskOf(id)).toMatchObject({ status: 'QUEUED' });

      await h
        .closeForDeparture(id, { ...reason, evidence: 'Checked with the vendor and collected the invitation' }, h.it1)
        .expect(200);

      expect(await h.state(id)).toBe('CANCELLED');
      expect(await taskOf(id)).toMatchObject({ status: 'CANCELLED' });
      expect(await commitmentOf(id)).toMatchObject({ state: 'RELEASED' });
      expect(await h.freeSeats(subscriptionId)).toBe((free ?? 0) + 1);
    });

    it('needs the same confirmation for a task that failed, and then cancels it', async () => {
      const u = await example();
      const id = await approvedFor(u, u.person, 10 * M);
      const task = await granted(id);
      await h.claim(task).expect(200);
      await h.fail(task, { reason: 'could not be done' }).expect(200);
      await h.moveTo(u.person.employeeId, u.target.department.id);

      const refused = await h.closeForDeparture(id, reason, h.it1).expect(422);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.EVIDENCE_REQUIRED');
      expect(await taskOf(id)).toMatchObject({ status: 'FAILED' });
      expect(await h.state(id)).toBe('EXECUTING');

      await h
        .closeForDeparture(id, { ...reason, evidence: 'Checked with the vendor and collected the invitation' }, h.it1)
        .expect(200);

      expect(await h.state(id)).toBe('CANCELLED');
      expect(await taskOf(id)).toMatchObject({ status: 'CANCELLED' });
    });

    it('does not undo a grant that is done: the request is completed, and the right goes to the held rights of the transfer', async () => {
      const u = await example();
      const id = await approvedFor(u, u.person, 10 * M);
      const task = await granted(id);
      await h.claim(task).expect(200);
      await h.complete(task, { evidence: 'Invited by work email' }).expect(200);
      await h.moveTo(u.person.employeeId, u.target.department.id);

      const refused = await h.closeForDeparture(id, reason, h.it1).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.ALREADY_ENDED');
      expect(await h.state(id)).toBe('COMPLETED');
      expect(await taskOf(id)).toMatchObject({ status: 'COMPLETED' });
    });

    it('is for the IT Admin: Finance and the approver are refused by the guard, and nothing changes', async () => {
      const u = await example();
      const id = await approvedFor(u, u.person, 10 * M);
      await h.moveTo(u.person.employeeId, u.target.department.id);

      const byFinance = await h.closeForDeparture(id, reason, h.finance).expect(403);
      const byApprover = await h.closeForDeparture(id, reason, h.boss.account).expect(403);

      expect([byFinance, byApprover].map((response) => h.codeOf(response))).toEqual([
        'AUTHORIZATION.FORBIDDEN',
        'AUTHORIZATION.FORBIDDEN',
      ]);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
    });
  });

  describe('a line of a request for a group', () => {
    const group = async (count = 3) => {
      const u = await h.departmentWithHead(`P-TG${(n += 1)}`);
      await h.roomFor(u);
      const people = await h.colleagues(u, count);
      const target = await h.departmentWithHead(`P-TGT${n}`);

      return { u, people, target, id: await h.groupApproved(u, plan, people), own: subscriptionId };
    };
    const releases = async (id: string) =>
      (
        await h.ctx.sql.query<{ amount_minor: string }>(
          `SELECT r.amount_minor::text FROM budget_commitment_releases r
             JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = $1`,
          [id],
        )
      ).rows;
    const grantedLine = async (id: string, employeeId: string, own: string) =>
      h.dataOf<{ task: TaskWire }>(
        await h.grantLine({ requestId: id, beneficiaryEmployeeId: employeeId, subscriptionId: own }, h.it1).expect(201),
      ).task;

    it('cancels the line of the person who was transferred with that cause, and the others go on', async () => {
      const { people, target, id } = await group(3);
      const [e1, e2, e3] = people;
      await h.moveTo(e3.employeeId, target.department.id);

      await h.closeLineForDeparture(id, e3.employeeId, reason, h.it1).expect(200);

      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'CANCELLED']);
      const rows = await h.lineRows(id);
      expect(rows[2]).toMatchObject({
        ended_by_employee_id: h.it1.employeeId,
        end_reason: 'Moved to the sales department on Monday',
        cancel_cause: 'BENEFICIARY_TRANSFERRED',
      });
      expect([rows[0].cancel_cause, rows[1].cancel_cause]).toEqual([null, null]);
      expect((await releases(id)).length).toBeGreaterThan(0);
      expect([e1, e2].every((person) => person.employeeId !== e3.employeeId)).toBe(true);
    });

    it('needs its reason, and a person who was transferred: one who still sits where the request was sent from is refused', async () => {
      const { people, id, target } = await group(2);
      const [e1, e2] = people;
      await h.moveTo(e2.employeeId, target.department.id);

      const noReason = await h
        .closeLineForDeparture(id, e2.employeeId, { cause: 'BENEFICIARY_TRANSFERRED' }, h.it1)
        .expect(422);
      const notMoved = await h.closeLineForDeparture(id, e1.employeeId, reason, h.it1).expect(409);

      expect(h.codeOf(noReason)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(notMoved)).toBe('ACCESS_REQUEST.BENEFICIARY_NOT_TRANSFERRED');
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED']);
    });

    it('needs the confirmation of the vendor check for a task that is being worked, and a done grant is left alone', async () => {
      const { people, id, target, own } = await group(2);
      const [e1, e2] = people;
      const running = await grantedLine(id, e1.employeeId, own);
      await h.claim(running.id).expect(200);
      const done = await grantedLine(id, e2.employeeId, own);
      await h.claim(done.id).expect(200);
      await h.complete(done.id, { evidence: 'Invited by work email' }).expect(200);
      await h.moveTo(e1.employeeId, target.department.id);
      await h.moveTo(e2.employeeId, target.department.id);

      const refused = await h.closeLineForDeparture(id, e1.employeeId, reason, h.it1).expect(422);
      const finished = await h.closeLineForDeparture(id, e2.employeeId, reason, h.it1).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.EVIDENCE_REQUIRED');
      expect(h.codeOf(finished)).toBe('ACCESS_REQUEST.ALREADY_ENDED');
      await h
        .closeLineForDeparture(id, e1.employeeId, { ...reason, evidence: 'Checked with the vendor' }, h.it1)
        .expect(200);
      expect(await h.lineStates(id)).toEqual(['CANCELLED', 'COMPLETED']);
    });

    it('closes a request whose last live line is the transferred person’s: the line goes and the request ends with it', async () => {
      // A group names two people at least, so the other one is taken out first and the last live line is the transferred person's.
      const { u, people, id, target } = await group(2);
      await h.withdrawLine(id, people[1].employeeId, {}, u.head.account).expect(200);
      await h.moveTo(people[0].employeeId, target.department.id);

      await h.closeForDeparture(id, reason, h.it1).expect(200);

      expect((await h.lineStates(id))[0]).toBe('CANCELLED');
      expect(await h.state(id)).toBe('CANCELLED');
    });
  });
});
