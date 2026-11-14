import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { ApiAccount } from '../../support/api-accounts';
import { waitForLockWaiters } from '../../support/lock-wait';
import { ProvisioningHarness, type TaskWire } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

describe('the queue of provisioning tasks over HTTP (integration, real PostgreSQL)', () => {
  let designer: string;
  let a1: ApiAccount;
  let a1Employee: string;
  let a3: ApiAccount;
  let e5: string;
  let e6: string;
  let e7: string;

  const task = async (id: string, account: ApiAccount = h.it1): Promise<TaskWire> =>
    h.dataOf<{ task: TaskWire }>(await h.getTask(id, account).expect(200)).task;
  const taskOf = (response: { body: unknown }): TaskWire => (response.body as { data: { task: TaskWire } }).data.task;
  const k2 = async (quantity = 5) => {
    const subscriptionId = await h.subscription(quantity, 'K2');

    return { subscriptionId, planId: await h.planOf(subscriptionId) };
  };
  const fresh = async (employeeId = e5, quantity = 5) => {
    const { subscriptionId, planId } = await k2(quantity);

    return { subscriptionId, task: await h.granted(employeeId, planId, { subscriptionId }) };
  };
  const taken = async (employeeId = e5) => {
    const made = await fresh(employeeId);
    await h.claim(made.task.id).expect(200);

    return made;
  };

  /**
   * What two IT Admins do to one task at the same moment, in a fixed order. Every action on a task locks the row of the task first
   * (`ProvisioningTaskRepo.lock`, `FOR UPDATE`, in the frame of the task), so that row is held in another connection and the
   * requests are sent one by one: each one is waiting for the lock (`waitForLockWaiters`) before the next is sent, the lock goes to
   * them in the order they queued, and each answer is the answer of its place in the queue. The lock is always released.
   */
  const queuedOnTask = async (taskId: string, sends: (() => request.Test)[]): Promise<request.Response[]> => {
    const holder = new Client({ connectionString: h.ctx.database.url });
    const pending: Promise<request.Response>[] = [];
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM provisioning_tasks WHERE id = $1 FOR UPDATE', [taskId]);
      for (const send of sends) {
        pending.push(send().then((response) => response));
        await waitForLockWaiters(h.ctx.sql, pending.length);
      }
      await holder.query('COMMIT');
      const answers: request.Response[] = [];
      for (const answer of pending) answers.push(await answer);

      return answers;
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await Promise.allSettled(pending);
    }
  };

  beforeAll(async () => {
    await h.start();
    designer = await h.jobTitle('Designer');
    a1Employee = await h.person('E-A1');
    a1 = await h.account('E-A1', a1Employee, 'IT_ADMIN');
    a3 = await h.account('E-A3', await h.person('E-A3'), 'IT_ADMIN');
    await h.department('P-DES', a1Employee);
    await h.department('P-NOIT');
    e5 = await h.member('P-DES', 'E-5', designer);
    e6 = await h.member('P-NOIT', 'E-6', designer);
    e7 = await h.member('P-DES', 'E-7', designer);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-07-02 AC-1, US-07-01 AC-12, US-07-02 AC-7: an IT Admin not in charge takes the task and completes it with evidence, under their own name', async () => {
    const { task: made } = await fresh();
    expect(made.defaultResponsibleEmployeeId).toBe(a1Employee);
    expect(
      h.dataOf<{ items: TaskWire[] }>(await h.list({ scope: 'MINE' }, a1).expect(200)).items.map((t) => t.id),
    ).toContain(made.id);

    const claimed = taskOf(await h.claim(made.id, h.it1).expect(200));
    expect(claimed).toMatchObject({ status: 'IN_PROGRESS', claimedBy: h.it1.appUserId, completedBy: null });
    const done = taskOf(
      await h
        .complete(
          made.id,
          { evidence: '  đã thêm e-5@acme.vn vào workspace bằng tài khoản quản trị của mình  ' },
          h.it1,
        )
        .expect(200),
    );

    expect(done).toMatchObject({
      status: 'COMPLETED',
      completedBy: h.it1.appUserId,
      evidence: 'đã thêm e-5@acme.vn vào workspace bằng tài khoản quản trị của mình',
      defaultResponsibleEmployeeId: a1Employee,
    });
    expect(done.completedAt).not.toBeNull();
    const events = await h.auditEvents('ProvisioningTask', made.id);
    expect(events.map((event) => event.action)).toEqual([
      'PROVISIONING_TASK.CREATED',
      'PROVISIONING_TASK.CLAIMED',
      'PROVISIONING_TASK.COMPLETED',
    ]);
    expect(events[2]).toMatchObject({
      actor_app_user_id: h.it1.appUserId,
      before: { status: 'IN_PROGRESS', defaultResponsibleEmployeeId: a1Employee },
      after: { status: 'COMPLETED', defaultResponsibleEmployeeId: a1Employee, selfExecuted: false },
    });
    expect(JSON.stringify(events)).not.toContain('đã thêm');
  });

  it('US-07-02 AC-5: completing without evidence, with a blank one or a missing one saves nothing', async () => {
    const { task: made } = await taken();

    for (const body of [{}, { evidence: '' }, { evidence: ' \n\t ' }]) {
      const refused = await h.complete(made.id, body).expect(422);
      expect(h.codeOf(refused)).toBe('PROVISIONING_TASK.EVIDENCE_REQUIRED');
    }
    expect(await task(made.id)).toMatchObject({ status: 'IN_PROGRESS', evidence: null, completedBy: null });
    expect((await h.auditEvents('ProvisioningTask', made.id)).map((event) => event.action)).toEqual([
      'PROVISIONING_TASK.CREATED',
      'PROVISIONING_TASK.CLAIMED',
    ]);
  });

  it('US-07-02 AC-2: ten days in progress change nothing: only a person completes', async () => {
    const { task: made } = await taken();
    await h.ctx.sql.query(`UPDATE provisioning_tasks SET claimed_at = now() - interval '10 days' WHERE id = $1`, [
      made.id,
    ]);

    const after = await task(made.id);
    h.dataOf(await h.list({ status: 'IN_PROGRESS' }).expect(200));

    expect(after).toMatchObject({ status: 'IN_PROGRESS', completedBy: null, evidence: null });
    expect(
      (await h.ctx.sql.query<{ status: string }>(`SELECT status FROM provisioning_tasks WHERE id = $1`, [made.id]))
        .rows[0].status,
    ).toBe('IN_PROGRESS');
  });

  it('US-07-02 AC-3: manual and connector tasks are in one queue and measured the same way; no one works the connector by hand', async () => {
    const manual = (await fresh()).task;
    const connector = (await fresh(e7)).task;
    await h.ctx.sql.query(`UPDATE provisioning_tasks SET channel = 'CONNECTOR' WHERE id = $1`, [connector.id]);

    const items = h.dataOf<{ items: TaskWire[] }>(await h.list({ pageSize: 100 }).expect(200)).items;
    const both = items.filter((item) => [manual.id, connector.id].includes(item.id));
    expect(both.map((item) => item.channel).sort()).toEqual(['CONNECTOR', 'MANUAL']);
    expect(both.every((item) => Number.isInteger(item.elapsedSeconds) && item.elapsedSeconds >= 0)).toBe(true);
    const onlyConnector = h.dataOf<{ items: TaskWire[] }>(await h.list({ channel: 'CONNECTOR' }).expect(200)).items;
    expect(onlyConnector.every((item) => item.channel === 'CONNECTOR')).toBe(true);

    expect(h.codeOf(await h.claim(connector.id).expect(409))).toBe('PROVISIONING_TASK.NOT_MANUAL');
    expect(h.codeOf(await h.complete(connector.id, { evidence: 'x' }).expect(409))).toBe(
      'PROVISIONING_TASK.NOT_MANUAL',
    );
    expect(h.codeOf(await h.fail(connector.id, { reason: 'x' }).expect(409))).toBe('PROVISIONING_TASK.NOT_MANUAL');
    expect((await task(connector.id)).status).toBe('QUEUED');
  });

  it('US-07-02 AC-6, US-07-01 AC-5: not done is recorded as a failure, never as completed, and the seat stays taken', async () => {
    const { subscriptionId, task: made } = await fresh(e5, 1);
    await h.claim(made.id).expect(200);
    expect(await h.freeSeats(subscriptionId)).toBe(0);

    for (const body of [{}, { reason: '   ' }]) {
      expect(h.codeOf(await h.fail(made.id, body).expect(422))).toBe('PROVISIONING_TASK.REASON_REQUIRED');
    }
    expect((await task(made.id)).status).toBe('IN_PROGRESS');
    const failed = taskOf(await h.fail(made.id, { reason: ' nhà cung cấp từ chối lời mời ' }).expect(200));

    expect(failed).toMatchObject({
      status: 'FAILED',
      failedBy: h.it1.appUserId,
      failureReason: 'nhà cung cấp từ chối lời mời',
      completedBy: null,
      evidence: null,
    });
    expect(await h.freeSeats(subscriptionId)).toBe(0);
    expect(h.codeOf(await h.complete(made.id, { evidence: 'x' }).expect(409))).toBe(
      'PROVISIONING_TASK.NOT_IN_PROGRESS',
    );
    expect(h.codeOf(await h.claim(made.id).expect(409))).toBe('PROVISIONING_TASK.NOT_CLAIMABLE');
    expect((await h.auditEvents('ProvisioningTask', made.id)).at(-1)?.action).toBe('PROVISIONING_TASK.FAILED');
  });

  it('keeps the order of work: completing or failing a task nobody has taken is refused, and taking it again is a no-op', async () => {
    const { task: made } = await fresh();

    expect(h.codeOf(await h.complete(made.id, { evidence: 'x' }).expect(409))).toBe(
      'PROVISIONING_TASK.NOT_IN_PROGRESS',
    );
    expect(h.codeOf(await h.fail(made.id, { reason: 'x' }).expect(409))).toBe('PROVISIONING_TASK.NOT_IN_PROGRESS');
    const first = taskOf(await h.claim(made.id).expect(200));
    const again = taskOf(await h.claim(made.id).expect(200));

    expect(again.claimedAt).toBe(first.claimedAt);
    expect(
      (await h.auditEvents('ProvisioningTask', made.id)).filter((event) => event.action.endsWith('CLAIMED')),
    ).toHaveLength(1);
  });

  it('lets another IT Admin take over a task in progress, and the audit says from whom', async () => {
    const { task: made } = await taken();

    const over = taskOf(await h.claim(made.id, a3).expect(200));

    expect(over).toMatchObject({ status: 'IN_PROGRESS', claimedBy: a3.appUserId });
    const claims = (await h.auditEvents('ProvisioningTask', made.id)).filter((event) =>
      event.action.endsWith('CLAIMED'),
    );
    expect(claims.map((event) => event.actor_app_user_id)).toEqual([h.it1.appUserId, a3.appUserId]);
    expect(claims[1].before).toMatchObject({ claimedBy: h.it1.appUserId });
  });

  it('US-07-01 AC-17: a person who left after the task was made cannot have it started, and the task is unchanged', async () => {
    const left = await h.member('P-DES', 'E-LEFT', designer);
    const { task: made } = await fresh(left);
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left]);

    const refused = await h.claim(made.id).expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING.BENEFICIARY_DEPARTED');
    expect(h.detailsOf(refused)).toEqual({ requestId: made.requestId, cause: 'LEFT', nextStep: 'CANCEL_REQUEST' });
    expect(await task(made.id)).toMatchObject({ status: 'QUEUED', claimedBy: null });
  });

  it('US-01-11 AC-1, AC-4: the queue by default is the one of the IT Admin in charge, and the general one has the tasks nobody works', async () => {
    const mine = (await fresh(e5)).task;
    const nobody = (await fresh(e6)).task;

    const a1Mine = h.dataOf<{ items: TaskWire[] }>(
      await h.list({ scope: 'MINE', pageSize: 100 }, a1).expect(200),
    ).items;
    const itMine = h.dataOf<{ items: TaskWire[] }>(await h.list({ scope: 'MINE', pageSize: 100 }).expect(200)).items;
    const general = h.dataOf<{ items: TaskWire[] }>(
      await h.list({ scope: 'GENERAL', pageSize: 100 }).expect(200),
    ).items;
    const all = h.dataOf<{ items: TaskWire[] }>(await h.list({ pageSize: 100 }).expect(200)).items;

    expect(a1Mine.map((item) => item.id)).toContain(mine.id);
    expect(a1Mine.map((item) => item.id)).not.toContain(nobody.id);
    expect(itMine).toEqual([]);
    expect(general.map((item) => item.id)).toContain(nobody.id);
    expect(general.map((item) => item.id)).not.toContain(mine.id);
    expect(all.map((item) => item.id)).toEqual(expect.arrayContaining([mine.id, nobody.id]));
    expect(all.map((item) => item.createdAt)).toEqual([...all.map((item) => item.createdAt)].sort());
  });

  it('US-01-11 AC-8: when the IT Admin in charge has left, the tasks go to the general queue and the audit keeps who was in charge', async () => {
    const a4Employee = await h.person('E-A4');
    await h.account('E-A4', a4Employee, 'IT_ADMIN');
    await h.department('P-OLD', a4Employee);
    const e8 = await h.member('P-OLD', 'E-8', designer);
    const { task: made } = await fresh(e8);
    expect(made).toMatchObject({ defaultResponsibleEmployeeId: a4Employee, inGeneralQueue: false });

    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [a4Employee]);

    const now = await task(made.id);
    const general = h.dataOf<{ items: TaskWire[] }>(
      await h.list({ scope: 'GENERAL', pageSize: 100 }).expect(200),
    ).items;
    expect(now).toMatchObject({ defaultResponsibleEmployeeId: a4Employee, inGeneralQueue: true });
    expect(general.map((item) => item.id)).toContain(made.id);
    expect((await h.auditEvents('ProvisioningTask', made.id))[0].after).toMatchObject({
      defaultResponsibleEmployeeId: a4Employee,
    });
    expect(taskOf(await h.claim(made.id, a3).expect(200)).status).toBe('IN_PROGRESS');

    const later = await fresh(e8);
    expect(later.task).toMatchObject({ defaultResponsibleEmployeeId: null, inGeneralQueue: true });
  });

  it('US-01-11 AC-7: a change of the IT Admin in charge of a department reaches the tasks made after it, and leaves the earlier ones with who was in charge', async () => {
    const owner = await h.person('E-A5');
    const ownerAccount = await h.account('E-A5', owner, 'IT_ADMIN');
    const next = await h.person('E-A6');
    const nextAccount = await h.account('E-A6', next, 'IT_ADMIN');
    const department = await h.department('P-SWAP', owner);
    const before = await h.member('P-SWAP', 'E-9', designer);
    const after = await h.member('P-SWAP', 'E-10', designer);
    const { task: earlier } = await fresh(before);
    expect(earlier.defaultResponsibleEmployeeId).toBe(owner);

    // The IT Admin in charge of a department is named by the Super Admin (QĐ-87): the IT Admin only reads it.
    await request(h.server())
      .patch(`/api/v1/departments/${department.id}`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ itAdminEmployeeId: next })
      .expect(200);
    const { task: later } = await fresh(after);

    expect(later.defaultResponsibleEmployeeId).toBe(next);
    expect((await task(earlier.id)).defaultResponsibleEmployeeId).toBe(owner);
    expect(
      h
        .dataOf<{ items: TaskWire[] }>(await h.list({ scope: 'MINE', pageSize: 100 }, a3).expect(200))
        .items.map((item) => item.id),
    ).not.toContain(later.id);
    // Two more IT Admins would change who is "the only one who can act" in the cases that follow: they leave the stage.
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = ANY($1::uuid[])`, [
      [ownerAccount.appUserId, nextAccount.appUserId],
    ]);
  });

  it('two IT Admins completing one task at once: one completes it, the other is told it is not in progress', async () => {
    const { task: made } = await taken();

    const [first, second] = await queuedOnTask(made.id, [
      () => h.complete(made.id, { evidence: 'a' }, h.it1),
      () => h.complete(made.id, { evidence: 'b' }, a3),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(h.codeOf(second)).toBe('PROVISIONING_TASK.NOT_IN_PROGRESS');
    expect(await task(made.id)).toMatchObject({ status: 'COMPLETED', completedBy: h.it1.appUserId, evidence: 'a' });
    expect(
      (await h.auditEvents('ProvisioningTask', made.id)).filter((event) => event.action.endsWith('COMPLETED')),
    ).toHaveLength(1);
  });

  it('two IT Admins taking one task at once: both are answered, the second takes it over, and both are recorded', async () => {
    const { task: made } = await fresh();

    const answers = await queuedOnTask(made.id, [() => h.claim(made.id, h.it1), () => h.claim(made.id, a3)]);

    expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
    expect(await task(made.id)).toMatchObject({ status: 'IN_PROGRESS', claimedBy: a3.appUserId });
    const claims = (await h.auditEvents('ProvisioningTask', made.id)).filter((event) =>
      event.action.endsWith('CLAIMED'),
    );
    expect(claims).toHaveLength(2);
    // The order of the queue, not the clock of two events, says who was first: the first found nobody, the second took it over.
    expect(claims.find((event) => event.actor_app_user_id === h.it1.appUserId)?.before).toMatchObject({
      claimedBy: null,
    });
    expect(claims.find((event) => event.actor_app_user_id === a3.appUserId)?.before).toMatchObject({
      claimedBy: h.it1.appUserId,
    });
  });

  it('answers 404 for a task that does not exist, and 422 for an id that is not one', async () => {
    const missing = randomUUID();

    expect(h.codeOf(await h.getTask(missing).expect(404))).toBe('PROVISIONING_TASK.NOT_FOUND');
    expect(h.codeOf(await h.claim(missing).expect(404))).toBe('PROVISIONING_TASK.NOT_FOUND');
    expect(h.codeOf(await h.complete(missing, { evidence: 'x' }).expect(404))).toBe('PROVISIONING_TASK.NOT_FOUND');
    expect(h.codeOf(await h.fail(missing, { reason: 'x' }).expect(404))).toBe('PROVISIONING_TASK.NOT_FOUND');
    expect(h.codeOf(await h.getTask('not-a-uuid').expect(422))).toBe('VALIDATION_ERROR');
  });

  it('US-07-02 AC-7, US-01-11 AC-5, AC-6: Finance, an employee and the Super Admin cannot read or work the queue, and nothing changes', async () => {
    const { task: made } = await taken();
    const superAdmin: ApiAccount = { ...h.it1, accessToken: h.admin };

    for (const account of [h.finance, h.employee, superAdmin]) {
      expect(h.codeOf(await h.list({}, account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      expect(h.codeOf(await h.getTask(made.id, account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      expect(h.codeOf(await h.claim(made.id, account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      expect(h.codeOf(await h.complete(made.id, { evidence: 'x' }, account).expect(403))).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
      expect(h.codeOf(await h.fail(made.id, { reason: 'x' }, account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(await task(made.id)).toMatchObject({ status: 'IN_PROGRESS', claimedBy: h.it1.appUserId });
  });

  it('QĐ-77m (US-01-05 AC-12): an IT Admin cannot work their own task while another IT Admin can, and can when none can, marked as such', async () => {
    const { task: own } = await fresh(a1Employee);

    expect(h.codeOf(await h.claim(own.id, a1).expect(403))).toBe('PROVISIONING.ANOTHER_IT_ADMIN_NEEDED');
    expect((await task(own.id)).status).toBe('QUEUED');
    expect(taskOf(await h.claim(own.id, h.it1).expect(200)).status).toBe('IN_PROGRESS');
    expect(h.codeOf(await h.complete(own.id, { evidence: 'x' }, a1).expect(403))).toBe(
      'PROVISIONING.ANOTHER_IT_ADMIN_NEEDED',
    );
    expect(h.codeOf(await h.fail(own.id, { reason: 'x' }, a1).expect(403))).toBe(
      'PROVISIONING.ANOTHER_IT_ADMIN_NEEDED',
    );

    const { subscriptionId, planId } = await k2();
    // One account is locked; the other is still active but its person has left: neither counts.
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [h.it1.appUserId]);
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [a3.employeeId]);
    const alone = await h.granted(a1Employee, planId, { subscriptionId, account: a1 });

    expect(taskOf(await h.claim(alone.id, a1).expect(200)).status).toBe('IN_PROGRESS');
    expect(
      taskOf(await h.complete(alone.id, { evidence: 'tự làm vì không còn IT Admin khác' }, a1).expect(200)).status,
    ).toBe('COMPLETED');
    const events = await h.auditEvents('ProvisioningTask', alone.id);
    expect(events.at(-1)).toMatchObject({ action: 'PROVISIONING_TASK.COMPLETED', after: { selfExecuted: true } });
  });
});
