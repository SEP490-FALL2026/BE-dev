import { Client } from 'pg';
import { waitForLockWaiters } from '../../support/lock-wait';
import { RequestCommitmentReleaseGuard } from '../../../src/modules/requests/spend/commitment-release.listener';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter } from '../../support/query-count';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;
const CHECK = '23514';
const FINAL = '55000';

interface RequestWire {
  id: string;
  state: string;
  needStep: { state: string };
  withdrawal: unknown;
  cancellation: {
    cancelledBy: { employeeId: string };
    cancelledAt: string;
    cause: string;
    note: string | null;
  } | null;
}
interface OpenRequest {
  requestId: string;
  type: string;
  state: string;
  plan: { planName: string } | null;
  requester: { employeeId: string };
  group: boolean;
  cancellable: boolean;
}
interface OpenTask {
  taskId: string;
  status: string;
  requestId: string | null;
  plan: { planName: string };
}
interface TaskWire {
  id: string;
  status: string;
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

/**
 * US-03-04 AC-24, AC-25: what is still open for a person who leaves is listed for the IT Admin, and the IT Admin closes each request
 * as cancelled once the person has left, over HTTP, on real PostgreSQL.
 */
describe('the requests and grants of a person who left (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  /** Three plans, because a person who holds a seat in a plan cannot ask for it again. */
  const plans: { plan: string; subscriptionId: string }[] = [];
  let plan: string;
  let n = 0;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
    for (let i = 0; i < 3; i += 1) {
      const subscriptionId = await h.subscription(40);
      const planId = await h.planOf(subscriptionId);
      await h
        .declareTaxProfile((await h.vendorOf(planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
        .expect(200);
      plans.push({ plan: planId, subscriptionId });
    }
    plan = plans[0].plan;
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** A department with a budget of 200 million, 20 held and 40 spent, and a person of it who will leave. */
  const example = async (): Promise<Unit & { leaver: Person }> => {
    n += 1;
    const u = await h.departmentWithHead(`P-LR${n}`);
    await h.budgetFor(u, { total: 200 * M, held: 20 * M, spent: 40 * M });
    const leaver = await h.worker(u.department, `LR-E${n}`);

    return { ...u, leaver };
  };
  /** A paid request of the person, approved by their head and by the approver: it waits to be carried out. */
  const approvedFor = async (u: Unit, person: Person, amount: number, which = 0): Promise<string> => {
    const sent = await h.sent(person, plans[which].plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.setPayments(sent.id, { amount });
    await h.sendOn([sent.id], u.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  };
  const granted = async (requestId: string, which = 0): Promise<string> =>
    h.dataOf<{ task: TaskWire }>(await h.grant({ requestId, subscriptionId: plans[which].subscriptionId }).expect(201))
      .task.id;
  /** The person has left: the departure is recorded and the day arrives. */
  const left = async (person: Person): Promise<CaseWire> => {
    const wire = await h.recordedCase(person);
    await h.leaveOnLastDay(wire.id).expect(200);

    return wire;
  };
  const wire = (response: Parameters<typeof h.dataOf>[0]) => h.dataOf<{ request: RequestWire }>(response).request;
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ state: string; amount_minor: string; released_minor: string }>(
        `SELECT state::text, amount_minor::text, released_minor::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const taskOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ id: string; status: string; close_reason: string | null; closed_by: string | null }>(
        `SELECT id, status::text, close_reason, closed_by_app_user_id AS closed_by FROM provisioning_tasks WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const assignmentOf = async (taskId: string) =>
    (
      await h.ctx.sql.query<{
        valid_from: string;
        valid_until: string | null;
        failed_at: Date | null;
        cancelled_at: Date | null;
      }>(
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
  const openRequests = async (caseId: string, query = '?pageSize=100') =>
    h.dataOf<{ items: OpenRequest[]; pagination: { totalItems: number } }>(
      await h.openRequestsOf(caseId, query).expect(200),
    );
  const openTasks = async (caseId: string, query = '?pageSize=100') =>
    h.dataOf<{ items: OpenTask[]; pagination: { totalItems: number } }>(
      await h.openGrantTasksOf(caseId, query).expect(200),
    );

  describe('what is open is listed and nothing changes by itself (AC-24)', () => {
    it('BR-MF1-02/07: lists a request awaiting requester revision and allows its closure after the beneficiary leaves', async () => {
      const u = await example();
      const id = (await h.sent(u.leaver, plan, { termMonths: 1 })).id;
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET state = 'NOT_REQUIRED', assignee_employee_id = NULL, assigned_at = NULL,
           waiting_reason = NULL, waiting_since = NULL WHERE request_id = $1 AND kind = 'NEED'`,
        [id],
      );
      await h.ctx.sql.query(
        `UPDATE access_requests SET state = 'AWAITING_REQUESTER_REVISION', routing_mode = 'ONE_STEP', one_step_reason = 'HEAD_LEFT' WHERE id = $1`,
        [id],
      );
      const departure = await h.recordedCase(u.leaver);

      expect((await openRequests(departure.id)).items).toContainEqual(
        expect.objectContaining({ requestId: id, state: 'AWAITING_REQUESTER_REVISION', cancellable: false }),
      );
      await h.leaveOnLastDay(departure.id).expect(200);
      expect((await openRequests(departure.id)).items).toContainEqual(
        expect.objectContaining({ requestId: id, state: 'AWAITING_REQUESTER_REVISION', cancellable: true }),
      );
      expect(wire(await h.cancelForDeparture(id).expect(200)).state).toBe('CANCELLED');
      expect((await openRequests(departure.id)).items.map((item) => item.requestId)).not.toContain(id);
      expect(await commitmentOf(id)).toBeUndefined();
    });

    it('lists the request that waits for the need step and the grant being worked beside the record of the departure', async () => {
      const u = await example();
      const waiting = (await h.sent(u.leaver, plan, { termMonths: 1 })).id;
      const working = await approvedFor(u, u.leaver, 5 * M, 1);
      const task = await granted(working, 1);
      await h.claim(task).expect(200);
      const ended = (await h.sent(u.leaver, plans[2].plan, { termMonths: 1 })).id;
      await h.withdrawRequest(ended, {}, u.leaver.account).expect(200);

      const wired = await h.recordedCase(u.leaver);

      const requests = await openRequests(wired.id);
      expect(requests.items.map((item) => item.requestId)).toEqual([waiting, working]);
      expect(requests.items[0]).toMatchObject({
        type: 'GRANT',
        state: 'PENDING',
        group: false,
        // The person is still handing over: the list is all there is to do for now.
        cancellable: false,
        requester: { employeeId: u.leaver.employeeId },
      });
      expect(requests.items[0].plan?.planName).toEqual(expect.any(String));
      expect(requests.items[1].state).toBe('EXECUTING');
      const tasks = await openTasks(wired.id);
      expect(tasks.items).toEqual([
        expect.objectContaining({ taskId: task, status: 'IN_PROGRESS', requestId: working }),
      ]);
      const [found] = await h.auditEventsOf('OFFBOARDING_CASE.OPEN_REQUESTS_FOUND', wired.id);
      expect(found.after).toMatchObject({ employeeId: u.leaver.employeeId, openRequests: 2, openGrantTasks: 1 });
      const detail = h.dataOf<CaseWire>(await h.readCase(wired.id).expect(200));
      expect(detail.warnings?.registered).toEqual({ OPEN_REQUESTS_OF_LEAVER: 3 });
      // Nothing was closed, cancelled or moved.
      expect(await h.state(waiting)).toBe('PENDING');
      expect(await h.state(working)).toBe('EXECUTING');
      expect((await taskOf(working)).status).toBe('IN_PROGRESS');
      const refused = await h.cancelForDeparture(waiting).expect(409);
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.BENEFICIARY_NOT_LEFT');

      // The person has left and still nobody closed anything: what is open stays open and can now be closed.
      await h.leaveOnLastDay(wired.id).expect(200);
      const after = await openRequests(wired.id);
      expect(after.items.map((item) => [item.requestId, item.cancellable])).toEqual([
        [waiting, true],
        [working, true],
      ]);
      expect((await openTasks(wired.id)).items.map((item) => item.status)).toEqual(['IN_PROGRESS']);
      expect(await h.state(waiting)).toBe('PENDING');
      expect(await h.state(working)).toBe('EXECUTING');
      expect((await taskOf(working)).status).toBe('IN_PROGRESS');
    });

    it('says nothing in the audit trail when nothing is open, and answers an unknown case as not found', async () => {
      n += 1;
      const u = await h.departmentWithHead(`P-LR${n}`);
      const person = await h.worker(u.department, `LR-N${n}`);

      const wired = await h.recordedCase(person);

      expect((await openRequests(wired.id)).items).toEqual([]);
      expect(await h.auditEventsOf('OFFBOARDING_CASE.OPEN_REQUESTS_FOUND', wired.id)).toEqual([]);
      expect(h.dataOf<CaseWire>(await h.readCase(wired.id).expect(200)).warnings?.registered).toEqual({});
      const missing = await h.openRequestsOf('00000000-0000-4000-8000-000000000001').expect(404);
      expect(h.codeOf(missing)).toBe('OFFBOARDING_CASE.NOT_FOUND');
      await h.openGrantTasksOf('00000000-0000-4000-8000-000000000001').expect(404);
      await h.openRequestsOf(wired.id, '', u.head.account).expect(403);
      await h.openGrantTasksOf(wired.id, '', u.member.account).expect(403);
    });

    it('reads a page in a fixed number of statements however many requests there are', async () => {
      const u = await example();
      const few = await h.sent(u.leaver, plan, { termMonths: 1 });
      const wired = await h.recordedCase(u.leaver);
      const small = await counter.run(() => h.openRequestsOf(wired.id, '?pageSize=100').expect(200));
      const smallTasks = await counter.run(() => h.openGrantTasksOf(wired.id, '?pageSize=100').expect(200));
      for (let i = 0; i < 4; i += 1) await h.sent(u.leaver, plan, { termMonths: 1 });

      const big = await counter.run(() => h.openRequestsOf(wired.id, '?pageSize=100').expect(200));

      expect(h.dataOf<{ items: unknown[] }>(small.result).items).toHaveLength(1);
      expect(h.dataOf<{ items: unknown[] }>(big.result).items).toHaveLength(5);
      expect(dataStatements(big.statements)).toHaveLength(dataStatements(small.statements).length);
      expect(h.dataOf<{ items: unknown[] }>(smallTasks.result).items).toHaveLength(0);
      expect(few.id).toBeDefined();
    }, 120000);
  });

  describe('the IT Admin closes the request of a person who left (AC-25)', () => {
    it('ends a request that holds money and a task nobody worked as cancelled: the seat is free, the money back, nothing failed', async () => {
      const u = await example();
      const id = await approvedFor(u, u.leaver, 15 * M);
      const task = await granted(id);
      // The seat is on the subscription the department of the request owns (QĐ-89a), not on the one of the seeded department.
      const ownSubscription = plans[0].subscriptionId;
      const free = await h.freeSeats(ownSubscription);
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
      const wired = await left(u.leaver);

      const response = await h
        .cancelForDeparture(id, { cause: 'BENEFICIARY_LEFT', note: 'The person left the company' })
        .expect(200);

      const request = wire(response);
      expect(request).toMatchObject({
        state: 'CANCELLED',
        // The need step was decided long ago and stays as it was decided.
        needStep: { state: 'APPROVED' },
        withdrawal: null,
        cancellation: { cause: 'BENEFICIARY_LEFT', note: 'The person left the company' },
      });
      expect(request.cancellation?.cancelledAt).toEqual(expect.any(String));
      expect(await h.state(id)).toBe('CANCELLED');
      expect((await stepStates(id)).filter((step) => step.state === 'PENDING' || step.state === 'WAITING')).toEqual([]);
      expect(await taskOf(id)).toMatchObject({
        status: 'CANCELLED',
        close_reason: 'BENEFICIARY_LEFT',
        closed_by: h.it1.appUserId,
      });
      const assignment = await assignmentOf(task);
      expect(assignment).toMatchObject({ failed_at: null, valid_until: assignment.valid_from });
      expect(assignment.cancelled_at).not.toBeNull();
      expect(await h.freeSeats(ownSubscription)).toBe((free ?? 0) + 1);
      expect(await commitmentOf(id)).toMatchObject({ state: 'RELEASED', released_minor: String(15 * M) });
      const [event] = await h.auditEventsOf('ACCESS_REQUEST.CANCELLED', id);
      expect(event.after).toMatchObject({
        requestId: id,
        from: 'EXECUTING',
        to: 'CANCELLED',
        reasonKind: 'BENEFICIARY_LEFT',
        cancelledByEmployeeId: h.it1.employeeId,
        taskId: task,
        taskStatusBefore: 'QUEUED',
        commitmentsReleased: 1,
      });
      expect((await h.auditEventsOf('PROVISIONING_TASK.CANCELLED', task)).length).toBe(1);
      expect((await h.auditEventsOf('ACCESS_REQUEST.GRANT_FAILED', id)).length).toBe(0);
      expect((await h.auditEventsOf('ACCESS_REQUEST.WITHDRAWN', id)).length).toBe(0);
      // It is no longer open, and a second closing finds nothing left.
      expect((await openRequests(wired.id)).items.map((item) => item.requestId)).not.toContain(id);
      expect((await openTasks(wired.id)).items).toEqual([]);
      const again = await h.cancelForDeparture(id).expect(409);
      expect(h.codeOf(again)).toBe('ACCESS_REQUEST.ALREADY_ENDED');
      // An end is the end everywhere: nothing is granted, nothing waits for a decision, and what remains may be let go.
      const refused = await h.grant({ requestId: id, subscriptionId: plans[0].subscriptionId }).expect(409);
      expect(h.codeOf(refused)).toBe('PROVISIONING.REQUEST_ENDED');
      expect(await h.ctx.app.get(RequestCommitmentReleaseGuard, { strict: false }).canReleaseRemainder(id)).toBe(true);
      expect(await sqlState(`UPDATE provisioning_tasks SET close_reason = 'again' WHERE id = $1`, [task])).toBe(FINAL);
    });

    it('closes a request that waits for its need step with no money held and no task', async () => {
      const u = await example();
      const id = (await h.sent(u.leaver, plan, { termMonths: 1 })).id;
      await left(u.leaver);

      const request = wire(await h.cancelForDeparture(id).expect(200));

      expect(request).toMatchObject({
        state: 'CANCELLED',
        needStep: { state: 'CLOSED' },
        cancellation: { note: null },
      });
      expect(await taskOf(id)).toBeUndefined();
      expect(await commitmentOf(id)).toBeUndefined();
    });

    it('closes the request that was approved and not granted, giving the money back', async () => {
      const u = await example();
      const id = await approvedFor(u, u.leaver, 10 * M);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      await left(u.leaver);

      await h.cancelForDeparture(id).expect(200);

      expect(await commitmentOf(id)).toMatchObject({ state: 'RELEASED', released_minor: String(10 * M) });
      expect(await taskOf(id)).toBeUndefined();
    });

    it('cancels a task that failed with its assignment, and a task being worked only with the evidence that the work was undone', async () => {
      const u = await example();
      const failed = await approvedFor(u, u.leaver, 5 * M);
      const failedTask = await granted(failed);
      await h.claim(failedTask).expect(200);
      await h.fail(failedTask, { reason: 'The invitation bounced' }).expect(200);
      const running = await approvedFor(u, u.leaver, 5 * M, 1);
      const runningTask = await granted(running, 1);
      await h.claim(runningTask).expect(200);
      await left(u.leaver);

      await h.cancelForDeparture(failed).expect(200);
      expect(await taskOf(failed)).toMatchObject({ status: 'CANCELLED', close_reason: 'BENEFICIARY_LEFT' });
      expect((await assignmentOf(failedTask)).cancelled_at).not.toBeNull();

      const without = await h.cancelForDeparture(running).expect(422);
      expect(h.codeOf(without)).toBe('ACCESS_REQUEST.EVIDENCE_REQUIRED');
      expect(await h.state(running)).toBe('EXECUTING');
      expect((await taskOf(running)).status).toBe('IN_PROGRESS');
      expect(await commitmentOf(running)).toMatchObject({ state: 'HELD', released_minor: '0' });

      const done = wire(
        await h
          .cancelForDeparture(running, {
            cause: 'BENEFICIARY_LEFT',
            evidence: 'Took the invitation back in the vendor console',
          })
          .expect(200),
      );

      expect(done.state).toBe('CANCELLED');
      expect(await taskOf(running)).toMatchObject({ status: 'CANCELLED', close_reason: 'BENEFICIARY_LEFT' });
      const assignment = await assignmentOf(runningTask);
      expect(assignment).toMatchObject({ failed_at: null, valid_until: assignment.valid_from });
      expect(assignment.cancelled_at).not.toBeNull();
      expect(await commitmentOf(running)).toMatchObject({ state: 'RELEASED' });
      const [event] = await h.auditEventsOf('PROVISIONING_TASK.CANCELLED', runningTask);
      expect(event.after).toMatchObject({
        closeReason: 'BENEFICIARY_LEFT',
        evidence: 'Took the invitation back in the vendor console',
      });
      expect((await h.auditEventsOf('ACCESS_REQUEST.CANCELLED', running))[0].after).toMatchObject({
        taskStatusBefore: 'IN_PROGRESS',
      });
    });

    it('takes the request out of the batch it was sent in, and no other request changes', async () => {
      const u = await example();
      const mate = await h.worker(u.department, `LR-M${(n += 1)}`);
      const second = await h.sent(u.leaver, plan, { termMonths: 1 });
      await h.decide(second.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.setPayments(second.id, { amount: 5 * M });
      const third = await h.sent(mate, plan, { termMonths: 1 });
      await h.decide(third.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.setPayments(third.id, { amount: 5 * M });
      await h.sendOn([second.id, third.id], u.head.account).expect(201);
      await left(u.leaver);

      await h.cancelForDeparture(second.id).expect(200);

      const items = await h.ctx.sql.query<{ request_id: string; left_reason: string | null }>(
        `SELECT request_id, left_reason::text FROM spend_batch_items WHERE request_id = ANY($1::uuid[]) ORDER BY position`,
        [[second.id, third.id]],
      );
      expect(items.rows).toEqual([
        { request_id: second.id, left_reason: 'REQUEST_CANCELLED' },
        { request_id: third.id, left_reason: null },
      ]);
      expect(await h.state(third.id)).toBe('AWAITING_SPEND_DECISION');
      expect((await stepStates(third.id)).find((step) => step.kind === 'SPEND_APPROVAL')?.state).toBe('PENDING');
    });
  });

  describe('what refuses the closing', () => {
    it('refuses a person who still works, a request that ended, a withdrawal that waits and a stranger, and changes nothing', async () => {
      const u = await example();
      const working = await h.worker(u.department, `LR-W${(n += 1)}`);
      const open = (await h.sent(working, plan, { termMonths: 1 })).id;
      const withdrawn = (await h.sent(u.leaver, plan, { termMonths: 1 })).id;
      await h.withdrawRequest(withdrawn, {}, u.leaver.account).expect(200);
      const failing = await approvedFor(u, u.leaver, 5 * M);
      const failingTask = await granted(failing);
      await h.claim(failingTask).expect(200);
      await h.fail(failingTask, { reason: 'The invitation bounced' }).expect(200);
      await h.withdrawRequest(failing, { reason: 'Not needed' }, u.leaver.account).expect(200);
      expect(await h.state(failing)).toBe('AWAITING_IT_CLOSE');
      await left(u.leaver);

      const stillWorks = await h.cancelForDeparture(open).expect(409);
      expect(h.codeOf(stillWorks)).toBe('ACCESS_REQUEST.BENEFICIARY_NOT_LEFT');
      const ended = await h.cancelForDeparture(withdrawn).expect(409);
      expect(h.codeOf(ended)).toBe('ACCESS_REQUEST.ALREADY_ENDED');
      const waiting = await h.cancelForDeparture(failing).expect(409);
      expect(h.codeOf(waiting)).toBe('ACCESS_REQUEST.WITHDRAWAL_PENDING');
      const missing = await h.cancelForDeparture('00000000-0000-4000-8000-000000000001').expect(404);
      expect(h.codeOf(missing)).toBe('ACCESS_REQUEST.NOT_FOUND');
      for (const account of [u.head.account, u.member.account, h.finance, h.boss.account]) {
        await h.cancelForDeparture(failing, { cause: 'BENEFICIARY_LEFT' }, account).expect(403);
      }
      expect([await h.state(open), await h.state(withdrawn), await h.state(failing)]).toEqual([
        'PENDING',
        'WITHDRAWN',
        'AWAITING_IT_CLOSE',
      ]);
      expect((await taskOf(failing)).status).toBe('FAILED');
      expect(await commitmentOf(failing)).toMatchObject({ state: 'HELD', released_minor: '0' });
    });
  });

  describe('a grant is not started for a person who left (QĐ-77f)', () => {
    it('grants and claims for a person who hands over, and refuses both once the person has left', async () => {
      const u = await example();
      const handing = await approvedFor(u, u.leaver, 5 * M);
      await h.recordedCase(u.leaver);

      const handingTask = await granted(handing);
      await h.claim(handingTask).expect(200);

      const other = await h.worker(u.department, `LR-L${(n += 1)}`);
      const request = await approvedFor(u, other, 5 * M);
      const queued = await approvedFor(u, other, 5 * M, 1);
      const task = await granted(queued, 1);
      await left(other);

      const refusedGrant = await h.grant({ requestId: request, subscriptionId: plans[0].subscriptionId }).expect(409);
      const refusedClaim = await h.claim(task).expect(409);

      expect(h.codeOf(refusedGrant)).toBe('PROVISIONING.BENEFICIARY_DEPARTED');
      expect(h.codeOf(refusedClaim)).toBe('PROVISIONING.BENEFICIARY_DEPARTED');
      expect((await taskOf(queued)).status).toBe('QUEUED');
    });
  });

  describe('a grant is not started from the day a departure blocks the person (QĐ-110d)', () => {
    it('refuses to grant and to claim a queued task once the block is in force, before the person is marked left, and leaves the task being worked as it is', async () => {
      const u = await example();
      const working = await approvedFor(u, u.leaver, 5 * M);
      const workingTask = await granted(working);
      await h.claim(workingTask).expect(200);
      const queued = await approvedFor(u, u.leaver, 5 * M, 1);
      const queuedTask = await granted(queued, 1);
      const fresh = await approvedFor(u, u.leaver, 5 * M, 2);
      const departure = await h.recordedCase(u.leaver);
      // Before the day of the block the grant goes on as it did: the person is still at work.
      expect(departure.state).toBe('HANDING_OVER');
      expect(departure.accessBlocked).toBe(false);
      await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
        u.leaver.employeeId,
        h.today(),
      ]);

      const refusedGrant = await h.grant({ requestId: fresh, subscriptionId: plans[2].subscriptionId }).expect(409);
      const refusedClaim = await h.claim(queuedTask).expect(409);

      expect(h.codeOf(refusedGrant)).toBe('PROVISIONING.BENEFICIARY_DEPARTED');
      expect(h.detailsOf(refusedGrant)).toMatchObject({ requestId: fresh, cause: 'ACCESS_BLOCKED' });
      expect(h.codeOf(refusedClaim)).toBe('PROVISIONING.BENEFICIARY_DEPARTED');
      expect(h.detailsOf(refusedClaim)).toMatchObject({ cause: 'ACCESS_BLOCKED' });
      expect((await taskOf(queued)).status).toBe('QUEUED');
      expect(await taskOf(fresh)).toBeUndefined();
      // The task already being worked is not touched: it is the IT Admin's to check with the vendor and close (QĐ-110d).
      expect((await taskOf(working)).status).toBe('IN_PROGRESS');
    });

    it('holds the beneficiary FOR SHARE before it reads the block, as the grant does: a departure that blocks them meanwhile is seen', async () => {
      const u = await example();
      const queued = await approvedFor(u, u.leaver, 5 * M);
      const task = await granted(queued);
      await h.recordedCase(u.leaver);
      const holder = new Client({ connectionString: h.ctx.database.url });
      await holder.connect();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [u.leaver.employeeId]);
        await holder.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
          u.leaver.employeeId,
          h.today(),
        ]);

        const claiming = h.claim(task).then((response) => response);
        await waitForLockWaiters(h.ctx.sql, 1);
        await holder.query('COMMIT');
        const refused = await claiming;

        expect([refused.status, h.codeOf(refused), h.detailsOf(refused)]).toEqual([
          409,
          'PROVISIONING.BENEFICIARY_DEPARTED',
          { requestId: queued, cause: 'ACCESS_BLOCKED', nextStep: 'CANCEL_REQUEST' },
        ]);
        expect((await taskOf(queued)).status).toBe('QUEUED');
      } finally {
        await holder.query('ROLLBACK').catch(() => undefined);
        await holder.end();
      }
    });

    it('lets another IT Admin take over a task already being worked once the block is in force: the check with the vendor can change hands', async () => {
      const u = await example();
      const working = await approvedFor(u, u.leaver, 5 * M);
      const workingTask = await granted(working);
      await h.claim(workingTask).expect(200);
      await h.recordedCase(u.leaver);
      await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
        u.leaver.employeeId,
        h.today(),
      ]);

      const other = await h.worker(u.department, `LR-I${n}`, ['IT_ADMIN']);

      const taken = await h.claim(workingTask, other.account).expect(200);

      expect(h.dataOf<{ task: TaskWire }>(taken).task).toMatchObject({ id: workingTask, status: 'IN_PROGRESS' });
      expect((await taskOf(working)).status).toBe('IN_PROGRESS');
    });
  });

  describe('what the database refuses', () => {
    it('keeps the cancellation columns and the state together, and lets a task being worked end as cancelled only for this reason', async () => {
      const u = await example();
      const id = (await h.sent(u.leaver, plan, { termMonths: 1 })).id;
      const running = await approvedFor(u, u.leaver, 5 * M, 1);
      const runningTask = await granted(running, 1);
      await h.claim(runningTask).expect(200);

      expect(await sqlState(`UPDATE access_requests SET state = 'CANCELLED' WHERE id = $1`, [id])).toBe(CHECK);
      expect(
        await sqlState(
          `UPDATE access_requests SET cancelled_at = now(), cancelled_by_employee_id = $2, cancel_cause = 'BENEFICIARY_LEFT' WHERE id = $1`,
          [id, h.it1.employeeId],
        ),
      ).toBe(CHECK);
      expect(await sqlState(`UPDATE access_requests SET cancel_note = 'x' WHERE id = $1`, [id])).toBe(CHECK);
      expect(
        await sqlState(
          `UPDATE provisioning_tasks SET status = 'CANCELLED', closed_by_app_user_id = $2, closed_at = now(), close_reason = 'REQUESTER_WITHDREW' WHERE id = $1`,
          [runningTask, h.it1.appUserId],
        ),
      ).toBe(FINAL);
      expect(
        await sqlState(
          `UPDATE provisioning_tasks SET status = 'CANCELLED', closed_by_app_user_id = $2, closed_at = now(), close_reason = 'BENEFICIARY_LEFT' WHERE id = $1`,
          [runningTask, h.it1.appUserId],
        ),
      ).toBeNull();
    });
  });
});
