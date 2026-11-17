import type request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import type { TaskWire } from '../../support/provisioning-harness';
import { type Department, type Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * The IT Admin who presses "Grant" on an approved request takes the work for themselves (`QĐ-111m`) over HTTP on real PostgreSQL: the task
 * they make is already theirs and in progress, pressing again (or another IT Admin pressing) gives back the same task and makes no second
 * seat or task, and the IT Admin who is the person the seat is for still waits for another one to do it. The real gate of the module of
 * requests answers, so the state of the request moves as it does in the product.
 */
describe('the grant that takes the work for the IT Admin who presses it (integration, real PostgreSQL)', () => {
  let design: Department;
  let head: Person;
  let free: string; // a K5 plan: no seat to take
  let itTwo: Person;
  let counter = 0;

  const approved = async (who?: Person): Promise<{ id: string; who: Person }> => {
    counter += 1;
    const person = who ?? (await h.staff(design, `GS-E${counter}`));
    const sent = await h.sent(person, free);
    await h.decide(sent.id, { decision: 'APPROVE' }, head.account).expect(200);

    return { id: sent.id, who: person };
  };
  const tasksOf = async (requestId: string) =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT count(*) AS n FROM provisioning_tasks WHERE request_id = $1 AND kind = 'GRANT'`,
          [requestId],
        )
      ).rows[0].n,
    );
  const taskOf = async (call: request.Test) => h.dataOf<{ task: TaskWire }>(await call).task;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('GS-DES');
    head = await h.staff(design, 'GS-H1');
    await h.makeHead(design, head);
    itTwo = await h.staff(design, 'GS-IT2', 'IT_ADMIN');
    free = await h.plan('K5');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('makes a task that is already the property of the IT Admin who pressed, in progress, with the time they took it', async () => {
    const { id } = await approved();

    const task = await taskOf(h.grant({ requestId: id }).expect(201));

    expect(task).toMatchObject({ kind: 'GRANT', channel: 'MANUAL', status: 'IN_PROGRESS', claimedBy: h.it1.appUserId });
    expect(
      (
        await h.ctx.sql.query<{ claimed_at: Date | null }>(`SELECT claimed_at FROM provisioning_tasks WHERE id = $1`, [
          task.id,
        ])
      ).rows[0].claimed_at,
    ).not.toBeNull();
    const events = await h.auditEvents('ProvisioningTask', task.id);
    expect(events.map((event) => event.action)).toEqual(['PROVISIONING_TASK.CREATED', 'PROVISIONING_TASK.CLAIMED']);
    expect(events[1]).toMatchObject({
      actor_app_user_id: h.it1.appUserId,
      before: { status: 'QUEUED', claimedBy: null },
      after: { status: 'IN_PROGRESS', claimedBy: h.it1.appUserId },
    });
  });

  it('can be completed at once, with no claim between', async () => {
    const { id } = await approved();
    const task = await taskOf(h.grant({ requestId: id }).expect(201));

    await h.complete(task.id, { evidence: 'Added to the portal' }).expect(200);

    expect(await tasksOf(id)).toBe(1);
  });

  it('gives back the same task when the same IT Admin presses again, and makes no second task or seat', async () => {
    const { id, who } = await approved();
    const first = await taskOf(h.grant({ requestId: id }).expect(201));
    const seats = () =>
      h.ctx.sql
        .query(`SELECT 1 FROM license_assignments WHERE employee_id = $1`, [who.employeeId])
        .then((r) => r.rowCount);

    const again = await taskOf(h.grant({ requestId: id }).expect(201));

    expect(again.id).toBe(first.id);
    expect(again.status).toBe('IN_PROGRESS');
    expect(await tasksOf(id)).toBe(1);
    expect(await seats()).toBe(1);
  });

  it('gives back the task of the IT Admin who took it when another presses, who does not take it over', async () => {
    const { id } = await approved();
    const first = await taskOf(h.grant({ requestId: id }, h.it1).expect(201));

    const other = await taskOf(h.grant({ requestId: id }, itTwo.account).expect(201));

    expect(other).toMatchObject({ id: first.id, claimedBy: h.it1.appUserId });
    expect(await tasksOf(id)).toBe(1);
  });

  it('makes one task when two IT Admins press at the same moment, and both are given it', async () => {
    const { id } = await approved();

    const answers = await Promise.all([h.grant({ requestId: id }, h.it1), h.grant({ requestId: id }, itTwo.account)]);

    expect(answers.map((answer) => answer.status)).toEqual([201, 201]);
    const tasks = answers.map((answer) => h.dataOf<{ task: TaskWire }>(answer).task);
    expect(tasks[0].id).toBe(tasks[1].id);
    expect(await tasksOf(id)).toBe(1);
  });

  it('does not hand a grant closed as failed back as if it were done: the request is over and a new press is refused', async () => {
    const { id } = await approved();
    const task = await taskOf(h.grant({ requestId: id }).expect(201));
    await h.fail(task.id, { reason: 'The vendor refused' }).expect(200);
    await h.closeFailed(task.id, { reason: 'Nothing to do' }).expect(200);

    const refused = await h.grant({ requestId: id }).expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING.REQUEST_ENDED');
    expect(await tasksOf(id)).toBe(1);
  });

  it('still refuses the IT Admin who is the person the seat is for while another usable IT Admin can do it, and writes nothing', async () => {
    const own = await h.staff(design, 'GS-ITSELF', 'IT_ADMIN');
    const { id } = await approved(own);

    const refused = await h.grant({ requestId: id }, own.account).expect(403);

    expect(h.codeOf(refused)).toBe('PROVISIONING.ANOTHER_IT_ADMIN_NEEDED');
    expect(await tasksOf(id)).toBe(0);
  });

  it('is still refused to anybody who is not an IT Admin, even to ask for a task that exists', async () => {
    const { id, who } = await approved();
    await h.grant({ requestId: id }).expect(201);
    const asEmployee: ApiAccount = who.account;

    await h.grant({ requestId: id }, asEmployee).expect(403);
  });
});
