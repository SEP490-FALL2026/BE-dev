import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount } from '../support/api-accounts';
import { ProvisioningHarness, type TaskWire } from '../support/provisioning-harness';

const h = new ProvisioningHarness();

describe('what an IT Admin decides about a failed task, over HTTP (integration, real PostgreSQL)', () => {
  let a1: ApiAccount;
  let a1Employee: string;
  let e5: string;
  let e7: string;

  const wire = (response: { body: unknown }): TaskWire => (response.body as { data: { task: TaskWire } }).data.task;
  const task = async (id: string): Promise<TaskWire> => wire(await h.getTask(id).expect(200));
  const assignment = async (id: string) =>
    (
      await h.ctx.sql.query<{ valid_until: string | null; failed_at: string | null; valid_from: string }>(
        `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
                failed_at FROM license_assignments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const assignmentWire = async (subscriptionId: string) =>
    h.dataOf<{ items: { id: string; failedAt: string | null; validUntil: string | null; source: string }[] }>(
      await request(h.server())
        .get('/api/v1/license-assignments')
        .query({ subscriptionId })
        .set(h.as(h.it1))
        .expect(200),
    ).items;
  /** A grant made, the task moved to the connector, and a failure recorded: a task waiting for a decision. */
  const failed = async (
    kind: 'PERMANENT' | 'AUTHENTICATION' = 'PERMANENT',
    options: { employeeId?: string; quantity?: number; connector?: boolean } = {},
  ) => {
    const subscriptionId = await h.subscription(options.quantity ?? 5, 'K2');
    const made = await h.granted(options.employeeId ?? e5, await h.planOf(subscriptionId), { subscriptionId });
    if (options.connector !== false) {
      await h.makeConnector(made.id);
      await h.recordFailure(made.id, kind);
    } else {
      await h.claim(made.id).expect(200);
      await h.fail(made.id, { reason: 'could not be done' }).expect(200);
    }

    return { subscriptionId, id: made.id, assignmentId: made.assignmentId, requestId: made.requestId };
  };

  beforeAll(async () => {
    await h.start();
    const designer = await h.jobTitle('Designer');
    a1Employee = await h.person('E-A1');
    a1 = await h.account('E-A1', a1Employee, ['IT_ADMIN']);
    await h.department('P-DES', a1Employee);
    e5 = await h.member('P-DES', 'E-5', designer);
    e7 = await h.member('P-DES', 'E-7', designer);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-07-04 AC-8: retry puts the task back in the queue of the same channel, the failure gone, the seat still taken', async () => {
    const connector = await failed('PERMANENT', { quantity: 1 });
    const manual = await failed('PERMANENT', { connector: false });

    const again = wire(await h.retry(connector.id).expect(200));
    const alsoAgain = wire(await h.retry(manual.id).expect(200));

    expect(again).toMatchObject({
      status: 'QUEUED',
      channel: 'CONNECTOR',
      failureKind: null,
      failureReason: null,
      lastError: null,
      attempts: 0,
      nextRetryAt: null,
      availableDecisions: [],
    });
    expect(alsoAgain).toMatchObject({ status: 'QUEUED', channel: 'MANUAL', claimedBy: null, failureKind: null });
    expect(await h.freeSeats(connector.subscriptionId)).toBe(0);
    const events = await h.auditEvents('ProvisioningTask', connector.id);
    expect(events.at(-1)).toMatchObject({
      action: 'PROVISIONING_TASK.RETRY_REQUESTED',
      actor_app_user_id: h.it1.appUserId,
      before: { status: 'FAILED', attempts: 1 },
      after: { status: 'QUEUED', channel: 'CONNECTOR', failureKind: 'PERMANENT', selfExecuted: false },
    });
  });

  it('US-07-04 AC-9: nothing hands a failed task over by itself; the IT Admin does, with evidence, and a person then completes it', async () => {
    const made = await failed('AUTHENTICATION');
    await h.ctx.sql.query(`UPDATE provisioning_tasks SET failed_at = now() - interval '30 days' WHERE id = $1`, [
      made.id,
    ]);

    expect(await task(made.id)).toMatchObject({ status: 'FAILED', channel: 'CONNECTOR', closedBy: null });
    for (const body of [{}, { evidence: '  ' }]) {
      expect(h.codeOf(await h.handOff(made.id, body).expect(422))).toBe('PROVISIONING_TASK.EVIDENCE_REQUIRED');
    }
    expect(await task(made.id)).toMatchObject({ status: 'FAILED', channel: 'CONNECTOR', handedOffBy: null });

    const handed = wire(
      await h.handOff(made.id, { evidence: ' kết nối đã hết hạn, làm tay theo hướng dẫn ' }).expect(200),
    );

    expect(handed).toMatchObject({
      status: 'QUEUED',
      channel: 'MANUAL',
      failureKind: null,
      handedOffBy: h.it1.appUserId,
      handOffEvidence: 'kết nối đã hết hạn, làm tay theo hướng dẫn',
      availableDecisions: [],
    });
    expect(handed.handedOffAt).not.toBeNull();
    expect(JSON.stringify(await h.auditEvents('ProvisioningTask', made.id))).not.toContain('kết nối đã hết hạn');
    await h.claim(made.id).expect(200);
    expect(wire(await h.complete(made.id, { evidence: 'đã thêm tài khoản bằng tay' }).expect(200)).status).toBe(
      'COMPLETED',
    );
  });

  it('refuses to hand over a task that is by hand already, and nothing changes', async () => {
    const manual = await failed('PERMANENT', { connector: false });

    const refused = await h.handOff(manual.id, { evidence: 'x' }).expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING_TASK.ALREADY_MANUAL');
    expect(await task(manual.id)).toMatchObject({ status: 'FAILED', channel: 'MANUAL', handedOffBy: null });
  });

  it('US-07-04 AC-10: closing without a reason, with a blank one or a missing one closes nothing', async () => {
    const made = await failed();

    for (const body of [{}, { reason: '' }, { reason: ' \n ' }]) {
      expect(h.codeOf(await h.closeFailed(made.id, body).expect(422))).toBe('PROVISIONING_TASK.REASON_REQUIRED');
    }

    expect(await task(made.id)).toMatchObject({ status: 'FAILED', closedBy: null, closeReason: null });
    expect(await assignment(made.assignmentId)).toMatchObject({ valid_until: null, failed_at: null });
  });

  it('US-07-04 AC-6, AC-12 and US-07-01 AC-6: closing a failed grant fails its assignment and frees the seat, which can be granted again', async () => {
    const made = await failed('PERMANENT', { quantity: 1 });
    expect(await h.freeSeats(made.subscriptionId)).toBe(0);

    const closed = wire(
      await h.closeFailed(made.id, { reason: ' nhà cung cấp không tạo được tài khoản ' }).expect(200),
    );

    expect(closed).toMatchObject({
      status: 'CLOSED_FAILED',
      closedBy: h.it1.appUserId,
      closeReason: 'nhà cung cấp không tạo được tài khoản',
      failureKind: 'PERMANENT',
      availableDecisions: [],
    });
    expect(closed.closedAt).not.toBeNull();
    const row = await assignment(made.assignmentId);
    expect(row.failed_at).not.toBeNull();
    expect(row.valid_until).toBe(row.valid_from);
    expect(await h.freeSeats(made.subscriptionId)).toBe(1);
    const shown = (await assignmentWire(made.subscriptionId)).find((item) => item.id === made.assignmentId);
    expect(shown).toMatchObject({ source: 'REQUEST' });
    expect(shown?.failedAt).not.toBeNull();

    const events = await h.auditEvents('ProvisioningTask', made.id);
    expect(events.at(-1)).toMatchObject({
      action: 'PROVISIONING_TASK.CLOSED_FAILED',
      after: {
        status: 'CLOSED_FAILED',
        taskKind: 'GRANT',
        requestId: made.requestId,
        closeReason: 'nhà cung cấp không tạo được tài khoản',
      },
    });
    expect((await h.auditEvents('LicenseAssignment', made.assignmentId)).map((event) => event.action)).toEqual([
      'LICENSE_ASSIGNMENT.CREATED',
      'LICENSE_ASSIGNMENT.FAILED',
    ]);
    const planId = await h.planOf(made.subscriptionId);
    const second = await h.granted(e7, planId, { subscriptionId: made.subscriptionId });
    const full = await h
      .grant({ requestId: h.gate.grantable(e5, planId), subscriptionId: made.subscriptionId })
      .expect(409);
    expect(second.status).toBe('QUEUED');
    expect(h.codeOf(full)).toBe('LICENSE_ASSIGNMENT.SEAT_CAPACITY');
  });

  it('lets the person whose grant failed be granted again as a new assignment, the failed one left in the history', async () => {
    const made = await failed('PERMANENT', { quantity: 3 });
    await h.closeFailed(made.id, { reason: 'không thể cấp' }).expect(200);
    const planId = await h.planOf(made.subscriptionId);

    const regrant = await h.granted(e5, planId, { subscriptionId: made.subscriptionId });

    const items = await assignmentWire(made.subscriptionId);
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.id === made.assignmentId)?.failedAt).not.toBeNull();
    expect(items.find((item) => item.id === regrant.assignmentId)).toMatchObject({ failedAt: null, validUntil: null });
  });

  it('US-07-04 AC-11: closing a failed revocation closes the task and leaves the assignment in force, the seat taken', async () => {
    const granted = await failed('PERMANENT', { quantity: 2 });
    // A revocation is queued for the connector, and the connector reports that the provider refused: the way G6/G7 will do it.
    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts,
         created_by_app_user_id)
       VALUES (gen_random_uuid(), $1, $2, 'REVOKE', 'CONNECTOR', $3, 4, $4)`,
      [h.seed.organizationId, granted.assignmentId, randomUUID(), randomUUID()],
    );
    const revoke = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM provisioning_tasks WHERE kind = 'REVOKE' AND assignment_id = $1`,
        [granted.assignmentId],
      )
    ).rows[0].id;
    expect((await h.recordFailure(revoke, 'PERMANENT', 'provider refused to remove the user')).status).toBe('FAILED');
    // While it waits for a decision the seat stays in force and taken.
    expect(await assignment(granted.assignmentId)).toMatchObject({ valid_until: null, failed_at: null });
    const before = await h.freeSeats(granted.subscriptionId);

    const closed = wire(await h.closeFailed(revoke, { reason: 'sẽ gỡ tay sau khi nhà cung cấp sửa' }).expect(200));

    expect(closed).toMatchObject({ status: 'CLOSED_FAILED', kind: 'REVOKE' });
    expect(await assignment(granted.assignmentId)).toMatchObject({ valid_until: null, failed_at: null });
    expect(await h.freeSeats(granted.subscriptionId)).toBe(before);
    expect((await h.auditEvents('LicenseAssignment', granted.assignmentId)).map((event) => event.action)).toEqual([
      'LICENSE_ASSIGNMENT.CREATED',
    ]);
    expect(await task(granted.id)).toMatchObject({ status: 'FAILED' });
  });

  it('decides on a failed task only: every other state answers that it is not failed, and nothing changes', async () => {
    const queued = await failed();
    await h.retry(queued.id).expect(200);
    // A task waiting for its next try, reached the way the connector reaches it: a temporary failure with retries left.
    const subscriptionId = await h.subscription(5, 'K2');
    const made = await h.granted(e7, await h.planOf(subscriptionId), { subscriptionId });
    await h.makeConnector(made.id);
    expect((await h.recordFailure(made.id, 'TRANSIENT')).status).toBe('RETRY_SCHEDULED');
    const scheduled = { id: made.id };
    const closed = await failed();
    await h.closeFailed(closed.id, { reason: 'xong' }).expect(200);
    const done = await failed('PERMANENT', { connector: false });
    await h.retry(done.id).expect(200);
    await h.claim(done.id).expect(200);
    await h.complete(done.id, { evidence: 'xong' }).expect(200);

    for (const { id } of [queued, scheduled, closed, done]) {
      for (const response of [
        await h.retry(id),
        await h.handOff(id, { evidence: 'x' }),
        await h.closeFailed(id, { reason: 'x' }),
      ]) {
        expect(response.status).toBe(409);
        expect(h.codeOf(response)).toBe('PROVISIONING_TASK.NOT_FAILED');
      }
    }
    expect(h.codeOf(await h.claim(scheduled.id).expect(409))).toBe('PROVISIONING_TASK.NOT_MANUAL');
    const manualClosed = await failed('PERMANENT', { connector: false });
    await h.closeFailed(manualClosed.id, { reason: 'xong' }).expect(200);
    expect(h.codeOf(await h.claim(manualClosed.id).expect(409))).toBe('PROVISIONING_TASK.NOT_CLAIMABLE');
    expect(h.codeOf(await h.complete(manualClosed.id, { evidence: 'x' }).expect(409))).toBe(
      'PROVISIONING_TASK.NOT_IN_PROGRESS',
    );
    expect(h.codeOf(await h.fail(manualClosed.id, { reason: 'x' }).expect(409))).toBe(
      'PROVISIONING_TASK.NOT_IN_PROGRESS',
    );
    expect(await task(closed.id)).toMatchObject({ status: 'CLOSED_FAILED' });
  });

  it('US-07-04 AC-14: only an IT Admin decides; Finance, an employee and the Super Admin are refused and nothing changes', async () => {
    const made = await failed();
    const superAdmin: ApiAccount = { ...h.it1, accessToken: h.admin };

    for (const account of [h.finance, h.employee, superAdmin]) {
      expect(h.codeOf(await h.retry(made.id, account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      expect(h.codeOf(await h.handOff(made.id, { evidence: 'x' }, account).expect(403))).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
      expect(h.codeOf(await h.closeFailed(made.id, { reason: 'x' }, account).expect(403))).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
    }

    expect(await task(made.id)).toMatchObject({ status: 'FAILED', closedBy: null });
    expect(await assignment(made.assignmentId)).toMatchObject({ failed_at: null });
  });

  it('QĐ-77m: an IT Admin does not decide for themselves while another can, and the decision is marked when none can', async () => {
    const subscriptionId = await h.subscription(5, 'K2');
    const own = await h.granted(a1Employee, await h.planOf(subscriptionId), { subscriptionId });
    await h.makeConnector(own.id);
    await h.recordFailure(own.id, 'PERMANENT');

    expect(h.codeOf(await h.closeFailed(own.id, { reason: 'x' }, a1).expect(403))).toBe(
      'PROVISIONING.ANOTHER_IT_ADMIN_NEEDED',
    );
    expect(h.codeOf(await h.retry(own.id, a1).expect(403))).toBe('PROVISIONING.ANOTHER_IT_ADMIN_NEEDED');
    expect((await task(own.id)).status).toBe('FAILED');
    expect(wire(await h.retry(own.id).expect(200)).status).toBe('QUEUED');
  });

  it('QĐ-77m: when no other IT Admin can act, the one who is the beneficiary decides, and each decision is marked as made by oneself', async () => {
    const own = async () => {
      const subscriptionId = await h.subscription(5, 'K2');
      const made = await h.granted(a1Employee, await h.planOf(subscriptionId), { subscriptionId });
      await h.makeConnector(made.id);
      await h.recordFailure(made.id, 'PERMANENT');

      return made.id;
    };
    const toRetry = await own();
    const toHandOff = await own();
    const toClose = await own();

    // The other IT Admin is locked: nobody else can decide, so the refusal gives way and the audit says so.
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [h.it1.appUserId]);
    try {
      expect(wire(await h.retry(toRetry, a1).expect(200)).status).toBe('QUEUED');
      expect(wire(await h.handOff(toHandOff, { evidence: 'đã thử tay' }, a1).expect(200)).status).toBe('QUEUED');
      expect(wire(await h.closeFailed(toClose, { reason: 'bỏ' }, a1).expect(200)).status).toBe('CLOSED_FAILED');
    } finally {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [h.it1.appUserId]);
    }

    for (const [id, action] of [
      [toRetry, 'PROVISIONING_TASK.RETRY_REQUESTED'],
      [toHandOff, 'PROVISIONING_TASK.HANDED_OFF'],
      [toClose, 'PROVISIONING_TASK.CLOSED_FAILED'],
    ] as const) {
      const events = await h.auditEvents('ProvisioningTask', id);
      expect(events.at(-1)).toMatchObject({ action, actor_app_user_id: a1.appUserId, after: { selfExecuted: true } });
    }
  });

  it('two IT Admins closing one failed task at once: one closes it, the other is told it is not failed, the assignment fails once', async () => {
    const made = await failed();

    const answers = await Promise.all([
      h.closeFailed(made.id, { reason: 'a' }),
      h.closeFailed(made.id, { reason: 'b' }, a1),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect(
      (await h.auditEvents('LicenseAssignment', made.assignmentId)).filter((event) => event.action.endsWith('FAILED')),
    ).toHaveLength(1);
  });

  it('retry and close at once leave the task and its assignment consistent: closed if and only if the assignment failed', async () => {
    const made = await failed();

    await Promise.all([h.retry(made.id), h.closeFailed(made.id, { reason: 'đóng' }, a1)]);

    const finalTask = await task(made.id);
    const row = await assignment(made.assignmentId);
    expect(finalTask.status === 'CLOSED_FAILED').toBe(row.failed_at !== null);
    expect(['CLOSED_FAILED', 'QUEUED']).toContain(finalTask.status);
  });
});
