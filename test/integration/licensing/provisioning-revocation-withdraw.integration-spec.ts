import { randomUUID } from 'node:crypto';
import type { RevocationEvent } from '../../../src/modules/licensing/public/licensing.extension-points';
import { RevocationListeners } from '../../../src/modules/licensing/public/licensing.extension-points';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

/** BR-MF5-04, US-07-05 AC-22: a source takes back its own reason for a revocation (integration, real PostgreSQL). */
describe('withdrawing the reason of a revocation (integration, real PostgreSQL)', () => {
  let k2: string;
  let counter = 0;
  const code = () => `E-WDR-${(counter += 1)}`;
  const heard: RevocationEvent[] = [];
  const ghost = () => ({ decision: { referenceKind: 'REVIEW', referenceId: randomUUID() } });
  const statusOf = async (taskId: string) =>
    (
      await h.ctx.sql.query<{ status: string; close_reason: string | null }>(
        `SELECT status, close_reason FROM provisioning_tasks WHERE id = $1`,
        [taskId],
      )
    ).rows[0];
  const withdrawnRows = async (taskId: string) =>
    (
      await h.ctx.sql.query<{ source: string; withdrawn_at: Date | null; withdraw_cause: string | null }>(
        `SELECT source, withdrawn_at, withdraw_cause FROM provisioning_task_reasons WHERE task_id = $1 ORDER BY created_at, id`,
        [taskId],
      )
    ).rows;
  const writes = async (taskId: string) => ({
    audit: (await h.auditEvents('ProvisioningTask', taskId)).length,
    reasons: await withdrawnRows(taskId),
    heard: heard.length,
  });

  beforeAll(async () => {
    await h.start();
    k2 = await h.subscription(60, 'K2');
    h.ctx.app.get(RevocationListeners).add('test.withdrawn', (_tx, event) => {
      if (event.moment === 'REASON_WITHDRAWN') heard.push(event);

      return Promise.resolve();
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('AC-22 US-07-05: takes back the only reason of a task that waits: cancelled as no longer applying, the seat untouched, audited, told', async () => {
    const assignmentId = await h.seat({ subscriptionId: k2 }, code());
    const free = await h.freeSeats(k2);
    const { referenceId } = ghost().decision;
    const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', { decision: { referenceKind: 'REVIEW', referenceId } });
    const before = heard.length;

    const answer = await h.withdraw(assignmentId, 'GHOST_SEAT', referenceId);

    expect(answer).toEqual({ taskId, outcome: 'CANCELLED' });
    expect(await statusOf(taskId)).toEqual({ status: 'CANCELLED', close_reason: 'NO_LONGER_APPLIES' });
    expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null });
    expect(await h.freeSeats(k2)).toBe(free);
    expect(await h.liveTaskOf(assignmentId)).toBeNull();
    expect(await withdrawnRows(taskId)).toMatchObject([{ source: 'GHOST_SEAT', withdraw_cause: 'NO_LONGER_APPLIES' }]);
    expect((await withdrawnRows(taskId))[0].withdrawn_at).not.toBeNull();
    const actions = (await h.auditEvents('ProvisioningTask', taskId)).map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining(['PROVISIONING_TASK.REASON_WITHDRAWN', 'PROVISIONING_TASK.CANCELLED']),
    );
    expect(heard).toHaveLength(before + 1);
    expect(heard.at(-1)).toMatchObject({
      moment: 'REASON_WITHDRAWN',
      cancelled: true,
      remaining: [],
      withdrawn: { source: 'GHOST_SEAT', referenceId },
      task: { id: taskId, status: 'CANCELLED' },
    });
  });

  it('AC-22 US-07-05: cancels a task that failed, and one waiting for its retry', async () => {
    const failed = await h.seat({ subscriptionId: k2 }, code());
    const retrying = await h.seat({ subscriptionId: k2 }, code());
    const a = ghost().decision;
    const b = ghost().decision;
    const failedTask = (await h.open(failed, 'GHOST_SEAT', { decision: a })).taskId;
    const retryingTask = (await h.open(retrying, 'GHOST_SEAT', { decision: b })).taskId;
    await h.claim(failedTask).expect(200);
    await h.fail(failedTask, { reason: 'không xóa được' }).expect(200);
    await h.ctx.sql.query(
      `UPDATE provisioning_tasks SET status = 'RETRY_SCHEDULED', failure_kind = 'TRANSIENT', attempts = 1, last_error = 'timeout',
         next_retry_at = now() + interval '5 minutes' WHERE id = $1`,
      [retryingTask],
    );

    expect(await h.withdraw(failed, 'GHOST_SEAT', a.referenceId)).toMatchObject({ outcome: 'CANCELLED' });
    expect(await h.withdraw(retrying, 'GHOST_SEAT', b.referenceId)).toMatchObject({ outcome: 'CANCELLED' });

    expect(await statusOf(failedTask)).toEqual({ status: 'CANCELLED', close_reason: 'NO_LONGER_APPLIES' });
    expect(await statusOf(retryingTask)).toEqual({ status: 'CANCELLED', close_reason: 'NO_LONGER_APPLIES' });
    expect(await h.assignmentRow(failed)).toMatchObject({ valid_until: null });
  });

  it('gỡ khi đang làm: a task in progress is cancelled for the IT Admin who took it, and left to be closed for another', async () => {
    const mine = await h.seat({ subscriptionId: k2 }, code());
    const other = await h.seat({ subscriptionId: k2 }, code());
    const a = ghost().decision;
    const b = ghost().decision;
    const mineTask = (await h.open(mine, 'GHOST_SEAT', { decision: a })).taskId;
    const otherTask = (await h.open(other, 'GHOST_SEAT', { decision: b })).taskId;
    await h.claim(mineTask).expect(200);
    await h.claim(otherTask).expect(200);

    expect(await h.withdraw(mine, 'GHOST_SEAT', a.referenceId, { cancelInProgressClaimedBy: h.it1.appUserId })).toEqual(
      { taskId: mineTask, outcome: 'CANCELLED' },
    );
    expect(await h.withdraw(other, 'GHOST_SEAT', b.referenceId, { cancelInProgressClaimedBy: randomUUID() })).toEqual({
      taskId: otherTask,
      outcome: 'IT_ADMIN_TO_CLOSE',
    });

    expect(await statusOf(mineTask)).toEqual({ status: 'CANCELLED', close_reason: 'NO_LONGER_APPLIES' });
    expect(await statusOf(otherTask)).toMatchObject({ status: 'IN_PROGRESS' });
    // A task with no reason left is not shown as under way, and the IT Admin closes it by the route of the cancel.
    expect(await h.reasonsOf(otherTask)).toHaveLength(1);
    const cancelled = await h.cancelTask(otherTask).expect(200);
    expect(h.dataOf<{ task: { status: string } }>(cancelled).task.status).toBe('CANCELLED');
    expect(await statusOf(otherTask)).toEqual({ status: 'CANCELLED', close_reason: 'NO_LONGER_APPLIES' });
    expect(await h.assignmentRow(other)).toMatchObject({ valid_until: null });
  });

  it('cancel thu hồi: the cancel of a revocation that a reason still asks for is refused; a grant in progress is refused as before', async () => {
    const assignmentId = await h.seat({ subscriptionId: k2 }, code());
    const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', ghost());
    await h.claim(taskId).expect(200);

    expect(h.codeOf(await h.cancelTask(taskId).expect(409))).toBe('PROVISIONING_TASK.NO_WITHDRAWAL');
    // A revocation that waits is not in the decisions of the cancel at all.
    const waiting = await h.open(await h.seat({ subscriptionId: k2 }, code()), 'RETURN');
    expect(h.codeOf(await h.cancelTask(waiting.taskId).expect(409))).toBe('PROVISIONING_TASK.NOT_FAILED');
  });

  it('gỡ còn lý do: the task goes on while another reason stands, and the timing is read from the reasons that stand', async () => {
    const assignmentId = await h.seat({ subscriptionId: k2 }, code());
    const a = ghost().decision;
    const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', {
      decision: a,
      timing: { notBefore: h.inDays(2) },
    });
    await h.open(assignmentId, 'TIME_LIMITED_EXPIRY', { timing: { notBefore: h.inDays(6) } });
    expect((await h.timingOf(taskId)).not_before).toBe(h.inDays(2));

    expect(await h.withdraw(assignmentId, 'GHOST_SEAT', a.referenceId)).toEqual({ taskId, outcome: 'CONTINUES' });

    expect(await statusOf(taskId)).toMatchObject({ status: 'QUEUED' });
    expect((await h.timingOf(taskId)).not_before).toBe(h.inDays(6));
    expect(heard.at(-1)).toMatchObject({
      moment: 'REASON_WITHDRAWN',
      cancelled: false,
      remaining: [{ source: 'TIME_LIMITED_EXPIRY' }],
    });
  });

  it('mở lại cùng tác vụ: the same source and reference asks again on the task that went on, without a unique violation', async () => {
    const assignmentId = await h.seat({ subscriptionId: k2 }, code());
    const a = ghost().decision;
    const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', { decision: a });
    await h.open(assignmentId, 'TIME_LIMITED_EXPIRY');
    await h.withdraw(assignmentId, 'GHOST_SEAT', a.referenceId);

    const again = await h.open(assignmentId, 'GHOST_SEAT', { decision: a });

    expect(again).toMatchObject({ taskId, created: false, reasonAdded: true });
    const rows = await withdrawnRows(taskId);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.withdrawn_at === null)).toHaveLength(2);
  });

  it('mở lại sau hủy: after the only reason was taken back, the same reference opens a new task', async () => {
    const assignmentId = await h.seat({ subscriptionId: k2 }, code());
    const a = ghost().decision;
    const first = await h.open(assignmentId, 'GHOST_SEAT', { decision: a });
    await h.withdraw(assignmentId, 'GHOST_SEAT', a.referenceId);

    const second = await h.open(assignmentId, 'GHOST_SEAT', { decision: a });

    expect(second.created).toBe(true);
    expect(second.taskId).not.toBe(first.taskId);
    expect(await withdrawnRows(second.taskId)).toHaveLength(1);
    expect(await statusOf(first.taskId)).toMatchObject({ status: 'CANCELLED' });
  });

  it('idempotent: taking back twice, on a task that is completed, or a reference that is not there, writes nothing', async () => {
    const assignmentId = await h.seat({ subscriptionId: k2 }, code());
    const a = ghost().decision;
    const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', { decision: a });
    await h.withdraw(assignmentId, 'GHOST_SEAT', a.referenceId);
    const settled = await writes(taskId);

    expect(await h.withdraw(assignmentId, 'GHOST_SEAT', a.referenceId)).toEqual({ taskId: null, outcome: 'NOT_FOUND' });
    expect(await writes(taskId)).toEqual(settled);

    const done = await h.seat({ subscriptionId: k2 }, code());
    const b = ghost().decision;
    const doneTask = (await h.open(done, 'GHOST_SEAT', { decision: b })).taskId;
    await h.claim(doneTask).expect(200);
    await h.revoked(doneTask, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(200);
    const finished = await writes(doneTask);
    expect(await h.withdraw(done, 'GHOST_SEAT', b.referenceId)).toEqual({ taskId: doneTask, outcome: 'ALREADY_ENDED' });
    expect(await writes(doneTask)).toEqual(finished);

    const live = await h.seat({ subscriptionId: k2 }, code());
    const liveTask = (await h.open(live, 'GHOST_SEAT', { decision: ghost().decision })).taskId;
    const standing = await writes(liveTask);
    expect(await h.withdraw(live, 'GHOST_SEAT', randomUUID())).toEqual({ taskId: liveTask, outcome: 'NOT_FOUND' });
    expect(await writes(liveTask)).toEqual(standing);
  });

  it('đọc lý do đã gỡ: a reason taken back is read nowhere, the reasons that stand still are', async () => {
    const assignmentId = await h.seat({ subscriptionId: k2 }, code());
    const a = ghost().decision;
    const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', { decision: a });
    await h.open(assignmentId, 'TIME_LIMITED_EXPIRY');
    const api = h.ctx.app.get(LicensingApi);
    const opened = () =>
      api.listRevocationsOpenedFor({ sources: ['GHOST_SEAT'], referenceId: a.referenceId }, [assignmentId]);
    expect((await opened()).has(assignmentId)).toBe(true);

    await h.withdraw(assignmentId, 'GHOST_SEAT', a.referenceId);

    expect((await opened()).has(assignmentId)).toBe(false);
    const card = await h.revocationOf(taskId);
    expect(card.revocation).toMatchObject({
      reasonCount: 1,
      withdrawnReasonCount: 1,
      firstReason: { referenceId: null },
    });
    expect(card.revocation?.lastWithdrawnAt).not.toBeNull();
  });
});
