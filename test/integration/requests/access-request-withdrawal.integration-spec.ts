import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;
const CHECK = '23514';
const FINAL = '55000';

interface RequestWire {
  id: string;
  state: string;
  needStep: { state: string };
  withdrawal: {
    requestedBy: { employeeId: string };
    requestedAt: string;
    reason: string | null;
    withdrawnAt: string | null;
  } | null;
}
interface TaskWire {
  id: string;
  status: string;
  closeReason: string | null;
}
interface CommitmentRow {
  state: string;
  amount_minor: string;
  released_minor: string;
}
interface AssignmentRow {
  valid_from: string;
  valid_until: string | null;
  failed_at: Date | null;
  cancelled_at: Date | null;
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

describe('the requester withdraws a request that is still waiting over PostgreSQL (US-05-08)', () => {
  let plan: string;
  let subscriptionId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(10);
    plan = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a budget of 100 million, 20 held and 40 spent. */
  const example = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-W${counter}`);
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });

    return u;
  };
  const approved = async (u: Unit, amount: number) => {
    const id = await h.waitingForApprover(u, plan, { amount });
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return id;
  };
  /** A paid request of the person, approved by their head and by the approver: it waits to be carried out. */
  const approvedBy = async (u: Unit, person: { account: typeof h.finance; employeeId: string }, amount: number) => {
    const sent = await h.sent(person, plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.setPayments(sent.id, { amount });
    await h.sendOn([sent.id], u.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  };
  const wire = (response: Parameters<typeof h.dataOf>[0]) => h.dataOf<{ request: RequestWire }>(response).request;
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<CommitmentRow>(
        `SELECT state, amount_minor::text, released_minor::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const taskOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{
        id: string;
        status: string;
        close_reason: string | null;
        closed_by_app_user_id: string | null;
      }>(`SELECT id, status, close_reason, closed_by_app_user_id FROM provisioning_tasks WHERE request_id = $1`, [
        requestId,
      ])
    ).rows[0];
  const assignmentOf = async (taskId: string) =>
    (
      await h.ctx.sql.query<AssignmentRow>(
        `SELECT a.valid_from::text, a.valid_until::text, a.failed_at, a.cancelled_at
           FROM license_assignments a JOIN provisioning_tasks t ON t.assignment_id = a.id WHERE t.id = $1`,
        [taskId],
      )
    ).rows[0];
  const stepStates = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ kind: string; state: string }>(
        `SELECT kind::text, state::text FROM access_request_steps WHERE request_id = $1 ORDER BY sequence`,
        [requestId],
      )
    ).rows;
  const events = async (action: string, requestId: string) =>
    (
      await h.ctx.sql.query<{ actor_kind: string }>(
        `SELECT actor_kind::text FROM audit_events WHERE action = $1 AND after ->> 'requestId' = $2`,
        [action, requestId],
      )
    ).rows;
  const granted = async (requestId: string) =>
    h.dataOf<{ task: TaskWire }>(await h.grant({ requestId, subscriptionId }).expect(201)).task;

  describe('a request that is still being decided (AC-1, AC-2, AC-6)', () => {
    it('ends as withdrawn, closes the step that waited and keeps who withdrew, when and why (AC-1)', async () => {
      const u = await example();
      const sent = await h.sent(u.member, plan, { termMonths: 1 });

      const response = await h.withdrawRequest(sent.id, { reason: 'No longer needed' }, u.member.account).expect(200);

      const request = wire(response);
      expect(request).toMatchObject({
        state: 'WITHDRAWN',
        needStep: { state: 'CLOSED' },
        withdrawal: { requestedBy: { employeeId: u.member.employeeId }, reason: 'No longer needed' },
      });
      expect(request.withdrawal?.withdrawnAt).not.toBeNull();
      expect(await h.state(sent.id)).toBe('WITHDRAWN');
      expect((await events('ACCESS_REQUEST.WITHDRAWN', sent.id)).length).toBe(1);
      // Nothing was decided: no approval record, no commitment.
      const records = await h.ctx.sql.query(`SELECT 1 FROM approval_records WHERE request_id = $1`, [sent.id]);
      expect(records.rowCount).toBe(0);
    });

    it('needs no reason from the requester, and a second withdrawal finds nothing left (AC-1)', async () => {
      const u = await example();
      const sent = await h.sent(u.member, plan, { termMonths: 1 });

      await h.withdrawRequest(sent.id, {}, u.member.account).expect(200);
      const again = await h.withdrawRequest(sent.id, {}, u.member.account).expect(409);

      expect(h.codeOf(again)).toBe('ACCESS_REQUEST.ALREADY_ENDED');
      expect(await h.state(sent.id)).toBe('WITHDRAWN');
    });

    it('closes the spend step with the withdrawal (AC-2; the question to Finance is retired, QĐ-97c)', async () => {
      const u = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });

      await h.withdrawRequest(id, {}, u.member.account).expect(200);

      expect((await stepStates(id)).filter((step) => step.state === 'PENDING' || step.state === 'WAITING')).toEqual([]);
      expect((await stepStates(id)).find((step) => step.kind === 'SPEND_APPROVAL')?.state).toBe('CLOSED');
    });

    it('withdraws a request that waits under control, with no one to hold its step (AC-6)', async () => {
      const executive = await h.departmentWithUnit(`P-WC${(counter += 1)}`);
      const head = await h.staff(executive, `WC-H${counter}`);
      await h.makeHead(executive, head);
      // The budget is decided while an approver still exists; the approver is taken away only after.
      await h.budgetFor({ department: executive, head, member: head }, { total: 100 * M });
      await h.clearRole('SPENDING_APPROVER');
      try {
        const sent = await h.sent(head, plan, { termMonths: 1 });
        expect(sent.state).toBe('WAITING_CONTROLLED');

        const response = await h.withdrawRequest(sent.id, {}, head.account).expect(200);

        expect(wire(response)).toMatchObject({ state: 'WITHDRAWN', needStep: { state: 'NOT_REQUIRED' } });
        expect((await stepStates(sent.id)).every((step) => ['CLOSED', 'NOT_REQUIRED'].includes(step.state))).toBe(true);
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    });

    it('takes the request out of the batch it was sent in and leaves the others as they were (AC-12)', async () => {
      const u = await example();
      const other = await h.staff(u.department, `W-O${(counter += 1)}`);
      const a = await h.waitingForApprover(u, plan, { amount: 5 * M });
      const second = await h.sent(other, plan, { termMonths: 1 });
      await h.decide(second.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.setPayments(second.id, { amount: 5 * M });
      // Both go in one batch: the first was sent alone above, so send the second with a third.
      const third = await h.sent(await h.staff(u.department, `W-T${counter}`), plan, { termMonths: 1 });
      await h.decide(third.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.setPayments(third.id, { amount: 5 * M });
      await h.sendOn([second.id, third.id], u.head.account).expect(201);

      await h.withdrawRequest(second.id, {}, other.account).expect(200);

      const items = await h.ctx.sql.query<{ request_id: string; left_reason: string | null; left_at: Date | null }>(
        `SELECT request_id, left_reason::text, left_at FROM spend_batch_items WHERE request_id = ANY($1::uuid[]) ORDER BY position`,
        [[second.id, third.id]],
      );
      expect(items.rows).toEqual([
        expect.objectContaining({ request_id: second.id, left_reason: 'REQUEST_WITHDRAWN' }),
        expect.objectContaining({ request_id: third.id, left_reason: null, left_at: null }),
      ]);
      expect(items.rows[0].left_at).not.toBeNull();
      expect(await h.state(third.id)).toBe('AWAITING_SPEND_DECISION');
      expect((await stepStates(third.id)).find((step) => step.kind === 'SPEND_APPROVAL')?.state).toBe('PENDING');
      expect(await h.state(a)).toBe('AWAITING_SPEND_DECISION');
    });
  });

  describe('who may withdraw (AC-4, AC-8, US-06-14 AC-14)', () => {
    it('refuses a person who has no part in the request as if it did not exist, and one who has as not the requester (AC-4)', async () => {
      const u = await example();
      const stranger = await h.staff(await h.departmentWithUnit(`P-WS${(counter += 1)}`), `WS-S${counter}`);
      const sent = await h.sent(u.member, plan, { termMonths: 1 });

      const hidden = await h.withdrawRequest(sent.id, {}, stranger.account).expect(404);
      expect(h.codeOf(hidden)).toBe('ACCESS_REQUEST.NOT_FOUND');
      // The IT Admin reads every request and still does not withdraw it for the requester.
      const it = await h.withdrawRequest(sent.id, {}, h.it1).expect(403);
      expect(h.codeOf(it)).toBe('ACCESS_REQUEST.NOT_REQUESTER');
      expect(await h.state(sent.id)).toBe('PENDING');
    });

    it('lets the head withdraw a request sent for colleagues, and not a colleague it was sent for (AC-8)', async () => {
      const u = await example();
      counter += 1;
      const colleague = await h.staff(u.department, `W-C${counter}`);
      const other = await h.staff(u.department, `W-D${counter}`);
      const id = await h.sentForPeople(plan, [colleague, other], u.head.account, {
        businessReason: 'The new designers need the tool',
      });

      const refused = await h.withdrawRequest(id, {}, colleague.account).expect(403);
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.NOT_REQUESTER');

      await h.withdrawRequest(id, {}, u.head.account).expect(200);
      expect(await h.state(id)).toBe('WITHDRAWN');
    });

    it('lets the head withdraw, with a reason, a request the data stopped (US-06-14 AC-14)', async () => {
      const u = await example();
      const id = await h.staleRequest(u);
      await h.sendOn([id], u.head.account).expect(201);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');

      const missing = await h.withdrawRequest(id, {}, u.head.account).expect(422);
      expect(h.codeOf(missing)).toBe('ACCESS_REQUEST.REASON_REQUIRED');
      await h.withdrawRequest(id, { reason: '   ' }, u.head.account).expect(422);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');

      const response = await h.withdrawRequest(id, { reason: 'Moved to next year' }, u.head.account).expect(200);

      expect(wire(response)).toMatchObject({
        state: 'WITHDRAWN',
        withdrawal: { requestedBy: { employeeId: u.head.employeeId }, reason: 'Moved to next year' },
      });
    });

    it('does not let the head withdraw a request that waits for the approver, which only the requester withdraws', async () => {
      const u = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 5 * M });

      const refused = await h.withdrawRequest(id, { reason: 'Changed my mind' }, u.head.account).expect(403);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.NOT_REQUESTER');
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
    });
  });

  describe('a request that was approved and waits to be carried out (AC-5)', () => {
    it('gives the money back at once and ends as withdrawn, while nothing has been granted', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });

      await h.withdrawRequest(id, {}, u.member.account).expect(200);

      expect(await commitmentOf(id)).toMatchObject({ state: 'RELEASED', released_minor: String(15 * M) });
      expect(await taskOf(id)).toBeUndefined();
      expect(await h.state(id)).toBe('WITHDRAWN');
    });

    it('cancels the task nobody has worked with its assignment: the seat is free, nothing failed (AC-5)', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const task = await granted(id);
      const free = await h.freeSeats(subscriptionId);
      expect(await h.state(id)).toBe('EXECUTING');

      await h.withdrawRequest(id, { reason: 'Not needed after all' }, u.member.account).expect(200);

      expect(await h.state(id)).toBe('WITHDRAWN');
      expect(await taskOf(id)).toMatchObject({
        status: 'CANCELLED',
        close_reason: 'REQUESTER_WITHDREW',
        closed_by_app_user_id: u.member.account.appUserId,
      });
      const assignment = await assignmentOf(task.id);
      expect(assignment).toMatchObject({ failed_at: null, valid_until: assignment.valid_from });
      expect(assignment.cancelled_at).not.toBeNull();
      expect(await h.freeSeats(subscriptionId)).toBe((free ?? 0) + 1);
      expect(await commitmentOf(id)).toMatchObject({ state: 'RELEASED', released_minor: String(15 * M) });
      expect((await events('ACCESS_REQUEST.WITHDRAWN', id)).length).toBe(1);
      expect((await events('PROVISIONING_TASK.CANCELLED', id)).length).toBe(1);
      expect((await events('LICENSE_ASSIGNMENT.CANCELLED', id)).length).toBe(1);
      expect((await events('ACCESS_REQUEST.GRANT_FAILED', id)).length).toBe(0);
      const queue = h.dataOf<{ items: { id: string }[] }>(await h.list({ status: 'CANCELLED' }).expect(200)).items;
      expect(queue.map((item) => item.id)).toContain(task.id);
    });

    it('refuses while the task is being worked, and tells the requester to ask again with its result (AC-3)', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const task = await granted(id);
      await h.claim(task.id).expect(200);

      const refused = await h.withdrawRequest(id, {}, u.member.account).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.GRANT_RUNNING');
      expect(await h.state(id)).toBe('EXECUTING');
      expect(await taskOf(id)).toMatchObject({ status: 'IN_PROGRESS' });
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
    });

    it('refuses a grant that is done and points to the return (AC-3)', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const task = await granted(id);
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Added to the workspace' }).expect(200);
      expect(await h.state(id)).toBe('COMPLETED');

      const refused = await h.withdrawRequest(id, {}, u.member.account).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.GRANT_COMPLETED');
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
    });
  });

  describe('a grant that failed (AC-9)', () => {
    it('waits for the IT Admin to close the task as cancelled, and only then ends and gives the money back', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const task = await granted(id);
      await h.claim(task.id).expect(200);
      await h.fail(task.id, { reason: 'The invitation bounced' }).expect(200);
      const free = await h.freeSeats(subscriptionId);

      const waiting = wire(await h.withdrawRequest(id, { reason: 'Not needed' }, u.member.account).expect(200));

      expect(waiting).toMatchObject({
        state: 'AWAITING_IT_CLOSE',
        withdrawal: { withdrawnAt: null, reason: 'Not needed' },
      });
      expect(await taskOf(id)).toMatchObject({ status: 'FAILED' });
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
      expect(await h.freeSeats(subscriptionId)).toBe(free);

      // Nothing but cancelling is left to the IT Admin, and the requester cannot withdraw twice.
      for (const refused of [
        await h.retry(task.id).expect(409),
        await h.handOff(task.id, {}).expect(409),
        await h.closeFailed(task.id, { reason: 'Closed as failed' }).expect(409),
        await h.withdrawRequest(id, {}, u.member.account).expect(409),
      ]) {
        expect([
          'PROVISIONING_TASK.WITHDRAWAL_PENDING',
          'PROVISIONING_TASK.ALREADY_MANUAL',
          'ACCESS_REQUEST.WITHDRAWAL_PENDING',
        ]).toContain(h.codeOf(refused));
      }
      expect(await taskOf(id)).toMatchObject({ status: 'FAILED' });

      const cancelled = h.dataOf<{ task: TaskWire }>(await h.cancelTask(task.id).expect(200)).task;

      expect(cancelled).toMatchObject({ status: 'CANCELLED', closeReason: 'REQUESTER_WITHDREW' });
      const request = wire(await h.fetch(id, u.member.account).expect(200));
      expect(request.state).toBe('WITHDRAWN');
      expect(request.withdrawal?.withdrawnAt).not.toBeNull();
      expect(await commitmentOf(id)).toMatchObject({ state: 'RELEASED', released_minor: String(15 * M) });
      const assignment = await assignmentOf(task.id);
      expect(assignment.cancelled_at).not.toBeNull();
      expect(assignment.failed_at).toBeNull();
      expect(await h.freeSeats(subscriptionId)).toBe((free ?? 0) + 1);
      expect((await events('ACCESS_REQUEST.GRANT_FAILED', id)).length).toBe(0);
    });

    it('cancels nothing for a request that was not withdrawn, and only a failed task', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const task = await granted(id);

      const queued = await h.cancelTask(task.id).expect(409);
      expect(h.codeOf(queued)).toBe('PROVISIONING_TASK.NOT_FAILED');

      await h.claim(task.id).expect(200);
      await h.fail(task.id, { reason: 'The invitation bounced' }).expect(200);
      const notWithdrawn = await h.cancelTask(task.id).expect(409);
      expect(h.codeOf(notWithdrawn)).toBe('PROVISIONING_TASK.NO_WITHDRAWAL');
      expect(await taskOf(id)).toMatchObject({ status: 'FAILED' });
      expect(await h.state(id)).toBe('EXECUTING');
      await h.cancelTask(task.id, u.member.account).expect(403);
    });
  });

  describe('what the database refuses whoever writes', () => {
    it('keeps the columns of the withdrawal in step with the state', async () => {
      const u = await example();
      const sent = await h.sent(u.member, plan, { termMonths: 1 });

      expect(await sqlState(`UPDATE access_requests SET state = 'WITHDRAWN' WHERE id = $1`, [sent.id])).toBe(CHECK);
      expect(await sqlState(`UPDATE access_requests SET withdrawal_reason = 'x' WHERE id = $1`, [sent.id])).toBe(CHECK);
      expect(
        await sqlState(
          `UPDATE access_requests SET state = 'AWAITING_IT_CLOSE', withdrawal_requested_at = now(),
                  withdrawn_by_employee_id = $2, withdrawal_reason = '  ' WHERE id = $1`,
          [sent.id, u.member.employeeId],
        ),
      ).toBe(CHECK);
      expect(
        await sqlState(
          `UPDATE access_requests SET state = 'WITHDRAWN', withdrawal_requested_at = now(),
                  withdrawn_by_employee_id = $2, withdrawn_at = now() - interval '1 day' WHERE id = $1`,
          [sent.id, u.member.employeeId],
        ),
      ).toBe(CHECK);
    });

    it('lets a task be cancelled before it is worked or after it failed, never while it is worked or once done', async () => {
      const u = await example();
      const worked = await granted(await approved(u, 5 * M));
      await h.claim(worked.id).expect(200);
      const done = await granted(await approvedBy(u, await h.staff(u.department, `W-D${(counter += 1)}`), 5 * M));
      await h.claim(done.id).expect(200);
      await h.complete(done.id, { evidence: 'Done' }).expect(200);
      const cancel = (id: string) =>
        sqlState(
          `UPDATE provisioning_tasks SET status = 'CANCELLED', closed_by_app_user_id = $2, closed_at = now(),
                  close_reason = 'REQUESTER_WITHDREW' WHERE id = $1`,
          [id, u.member.account.appUserId],
        );

      expect(await cancel(worked.id)).toBe(FINAL);
      expect(await cancel(done.id)).toBe(FINAL);
      const queued = await granted(await approvedBy(u, await h.staff(u.department, `W-Q${(counter += 1)}`), 5 * M));
      expect(await sqlState(`UPDATE provisioning_tasks SET status = 'CANCELLED' WHERE id = $1`, [queued.id])).toBe(
        CHECK,
      );
      expect(await cancel(queued.id)).toBeNull();
      // A cancelled task never changes, and never goes back to the queue.
      expect(await sqlState(`UPDATE provisioning_tasks SET status = 'QUEUED' WHERE id = $1`, [queued.id])).toBe(FINAL);
      expect(await sqlState(`DELETE FROM provisioning_tasks WHERE id = $1`, [queued.id])).toBe(FINAL);
    });

    it('lets an assignment be cancelled once, only while open, with an empty period, and never also failed', async () => {
      const u = await example();
      const task = await granted(await approved(u, 5 * M));
      const assignmentId = (
        await h.ctx.sql.query<{ assignment_id: string }>(`SELECT assignment_id FROM provisioning_tasks WHERE id = $1`, [
          task.id,
        ])
      ).rows[0].assignment_id;

      expect(await sqlState(`UPDATE license_assignments SET cancelled_at = now() WHERE id = $1`, [assignmentId])).toBe(
        CHECK,
      );
      expect(
        await sqlState(
          `UPDATE license_assignments SET cancelled_at = now(), failed_at = now(), valid_until = valid_from WHERE id = $1`,
          [assignmentId],
        ),
      ).toBe(CHECK);
      expect(
        await sqlState(`UPDATE license_assignments SET cancelled_at = now(), valid_until = valid_from WHERE id = $1`, [
          assignmentId,
        ]),
      ).toBeNull();
      expect(await sqlState(`UPDATE license_assignments SET cancelled_at = NULL WHERE id = $1`, [assignmentId])).toBe(
        FINAL,
      );
      expect(
        await sqlState(`UPDATE license_assignments SET valid_until = valid_until + 1 WHERE id = $1`, [assignmentId]),
      ).toBe(FINAL);
    });
  });
});
