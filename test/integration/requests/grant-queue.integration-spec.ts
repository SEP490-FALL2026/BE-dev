import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';
import type { Person } from '../../support/request-harness';

const h = new GroupHarness();

interface QueueItem {
  requestId: string;
  type: string;
  state: 'WAITING' | 'EXECUTING' | 'DONE';
  beneficiary: { employeeId: string };
  department: { id: string; name: string };
  plan: { planId: string; applicationName: string; logoUrl: string | null };
  execution: { taskId: string; status: string; failureReason: string | null; availableActions: string[] } | null;
}
interface Queue {
  items: QueueItem[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The queue of the approved requests, person by person, as an IT Admin reads it (`QĐ-111m`) over HTTP on real PostgreSQL: only the
 * departments the IT Admin works, one row for each person with where their grant stands (waiting, being carried out, done) and, once
 * a task exists, which task and what may be done to it. A filter that names a department or a person out of the scope is an empty
 * answer, never an error (D8).
 */
describe('the queue of approved requests, person by person (integration, real PostgreSQL)', () => {
  let design: Unit;
  let ops: Unit;
  let itOps: Person;
  let free: string; // a K5 plan: no seat to take
  let other: string; // another K5 plan, to tell one plan from another
  let subscriptionId: string;
  let pooled: string; // a K2 plan with seats
  let counter = 0;

  const read = (account: ApiAccount, query: Record<string, string | number> = { pageSize: 100 }) =>
    request(h.server()).get('/api/v1/grant-queue').query(query).set(h.as(account));
  const listOf = async (account: ApiAccount, query: Record<string, string | number> = { pageSize: 100 }) =>
    h.dataOf<Queue>(await read(account, query).expect(200));
  const rowOf = async (account: ApiAccount, requestId: string, employeeId?: string) =>
    (await listOf(account)).items.find(
      (item) =>
        item.requestId === requestId && (employeeId === undefined || item.beneficiary.employeeId === employeeId),
    );

  /** An internal request of a person of the department whose head approved its need: it waits for the IT Admin. */
  const approvedFor = async (unit: Unit, planId = free): Promise<{ id: string; who: Person }> => {
    counter += 1;
    const who = await h.staff(unit.department, `GQ-E${counter}`);
    const sent = await h.sent(who, planId);
    await h.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);

    return { id: sent.id, who };
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    design = await h.departmentWithHead('GQ-DES');
    ops = await h.departmentWithHead('GQ-OPS');
    itOps = await h.staff(ops.department, 'GQ-IT2', 'IT_ADMIN');
    await h.setItAdminInCharge(design.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.setItAdminInCharge(ops.department, itOps);
    free = await h.plan('K5');
    other = await h.plan('K5');
    subscriptionId = await h.subscription(100);
    pooled = await h.planOf(subscriptionId);
    await h.roomFor(design);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the departments the IT Admin works', () => {
    it('lists the request of a department the IT Admin is in charge of, with the department and no task yet', async () => {
      const { id, who } = await approvedFor(design);

      const row = await rowOf(h.it1, id);

      expect(row).toMatchObject({
        state: 'WAITING',
        execution: null,
        beneficiary: { employeeId: who.employeeId },
        department: { id: design.department.id, name: row?.department.name },
      });
    });

    it('does not list the request of a department another IT Admin is in charge of, and lists it to that IT Admin', async () => {
      const { id } = await approvedFor(ops);

      expect(await rowOf(h.it1, id)).toBeUndefined();
      expect(await rowOf(itOps.account, id)).toMatchObject({ state: 'WAITING', department: { id: ops.department.id } });
    });

    it('answers empty, not an error, to a filter by a person of a department out of the scope', async () => {
      const { who } = await approvedFor(ops);

      const answer = await listOf(h.it1, { beneficiaryEmployeeId: who.employeeId });

      expect(answer.items).toEqual([]);
      expect(answer.pagination.totalItems).toBe(0);
    });
  });

  describe('where the grant of each person stands', () => {
    it('shows a person being carried out, with the task and what may be done to it, then done once it is completed', async () => {
      const { id } = await approvedFor(design);
      const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId: id }).expect(201)).task;
      await h.claim(task.id).expect(200);

      expect(await rowOf(h.it1, id)).toMatchObject({
        state: 'EXECUTING',
        execution: {
          taskId: task.id,
          status: 'IN_PROGRESS',
          failureReason: null,
          availableActions: ['COMPLETE', 'REPORT_FAILURE'],
        },
      });

      await h.complete(task.id, { evidence: 'Added to the portal' }).expect(200);

      expect(await rowOf(h.it1, id)).toMatchObject({
        state: 'DONE',
        execution: { taskId: task.id, status: 'COMPLETED', availableActions: [] },
      });
    });

    it('shows why a grant failed and the decisions left on it', async () => {
      const { id } = await approvedFor(design);
      const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId: id }).expect(201)).task;
      await h.claim(task.id).expect(200);
      await h.fail(task.id, { reason: 'The vendor portal refused the invitation' }).expect(200);

      expect(await rowOf(h.it1, id)).toMatchObject({
        state: 'EXECUTING',
        execution: {
          taskId: task.id,
          status: 'FAILED',
          failureReason: 'The vendor portal refused the invitation',
          availableActions: ['RETRY', 'CLOSE_FAILED'],
        },
      });
    });

    it('keeps the people of a request for a group apart: one done, one failed, one still waiting', async () => {
      const people = await h.colleagues(design, 3);
      const id = await h.groupApproved(design, pooled, people);
      const grant = async (employeeId: string) =>
        h.dataOf<{ task: { id: string } }>(
          await h.grantLine({ requestId: id, beneficiaryEmployeeId: employeeId, subscriptionId }, h.it1).expect(201),
        ).task;
      const first = await grant(people[0].employeeId);
      await h.claim(first.id).expect(200);
      await h.complete(first.id, { evidence: 'Invited' }).expect(200);
      const second = await grant(people[1].employeeId);
      await h.claim(second.id).expect(200);
      await h.fail(second.id, { reason: 'Seat refused' }).expect(200);

      const rows = (await listOf(h.it1)).items.filter((item) => item.requestId === id);
      const byPerson = new Map(rows.map((row) => [row.beneficiary.employeeId, row]));

      expect(rows).toHaveLength(3);
      expect(byPerson.get(people[0].employeeId)).toMatchObject({ state: 'DONE', execution: { status: 'COMPLETED' } });
      expect(byPerson.get(people[1].employeeId)).toMatchObject({
        state: 'EXECUTING',
        execution: { status: 'FAILED', failureReason: 'Seat refused' },
      });
      expect(byPerson.get(people[2].employeeId)).toMatchObject({ state: 'WAITING', execution: null });
    });
  });

  describe('the filters and the page', () => {
    it('lists only what waits for the plan when asked for it: the button "Grant" of the stock of that plan', async () => {
      const { id: forPlan } = await approvedFor(design, other);
      const { id: forOther } = await approvedFor(design);

      const answer = await listOf(h.it1, { planId: other, state: 'WAITING', pageSize: 100 });

      expect(answer.items.map((item) => item.requestId)).toContain(forPlan);
      expect(answer.items.map((item) => item.requestId)).not.toContain(forOther);
      expect(answer.items.every((item) => item.plan.planId === other && item.state === 'WAITING')).toBe(true);
    });

    it('filters by state and counts each filter on its own, waiting rows first when none is asked', async () => {
      const everything = await listOf(h.it1);
      const waiting = await listOf(h.it1, { state: 'WAITING', pageSize: 100 });
      const executing = await listOf(h.it1, { state: 'EXECUTING', pageSize: 100 });
      const done = await listOf(h.it1, { state: 'DONE', pageSize: 100 });

      expect(waiting.items.every((item) => item.state === 'WAITING')).toBe(true);
      expect(executing.items.every((item) => item.state === 'EXECUTING')).toBe(true);
      expect(done.items.every((item) => item.state === 'DONE')).toBe(true);
      expect(waiting.pagination.totalItems + executing.pagination.totalItems + done.pagination.totalItems).toBe(
        everything.pagination.totalItems,
      );
      expect(everything.items.map((item) => item.state)).toEqual(
        [...everything.items.map((item) => item.state)].sort(
          (a, b) => ['WAITING', 'EXECUTING', 'DONE'].indexOf(a) - ['WAITING', 'EXECUTING', 'DONE'].indexOf(b),
        ),
      );
    });

    it('pages the answer and reports the total of the filter', async () => {
      const total = (await listOf(h.it1, { state: 'WAITING', pageSize: 100 })).pagination.totalItems;
      expect(total).toBeGreaterThan(2);

      const first = await listOf(h.it1, { state: 'WAITING', page: 1, pageSize: 2 });
      const last = await listOf(h.it1, { state: 'WAITING', page: Math.ceil(total / 2), pageSize: 2 });

      expect(first.items).toHaveLength(2);
      expect(first.pagination).toMatchObject({
        page: 1,
        pageSize: 2,
        totalItems: total,
        totalPages: Math.ceil(total / 2),
      });
      expect(last.items.length).toBe(total - 2 * (Math.ceil(total / 2) - 1));
    });

    it('carries the logo of the application of the plan, null when none is set', async () => {
      const { id } = await approvedFor(design, other);
      expect((await rowOf(h.it1, id))?.plan.logoUrl).toBeNull();

      await h.ctx.sql.query(
        `UPDATE applications SET logo_url = 'https://cdn.example.com/logo.png'
          WHERE id = (SELECT application_id FROM plans WHERE id = $1)`,
        [other],
      );

      expect((await rowOf(h.it1, id))?.plan.logoUrl).toBe('https://cdn.example.com/logo.png');
    });
  });
});
