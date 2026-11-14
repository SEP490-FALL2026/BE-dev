import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import type { ApiAccount } from '../../support/api-accounts';
import { k1Checklist } from '../../support/k1-checklist';
import { RevocationHarness, type RevocationTaskWire } from '../../support/revocation-harness';

const h = new RevocationHarness();

describe('completing a revocation by the kind of grant, over HTTP (integration, real PostgreSQL)', () => {
  let counter = 0;
  const code = () => `E-DONE-${(counter += 1)}`;
  const taskOf = (response: request.Response) => h.dataOf<{ task: RevocationTaskWire }>(response).task;
  /** A K2 seat of a person who has held it for a while, a revocation opened for it and taken by the IT Admin. */
  const taken = async (target: { subscriptionId?: string; planId?: string }, source = 'MANAGER_NOT_NEEDED') => {
    const assignmentId = await h.seat(target, code());
    const { taskId } = await h.open(assignmentId, source);
    await h.claim(taskId).expect(200);

    return { assignmentId, taskId };
  };
  const unchanged = async (assignmentId: string, taskId: string) => {
    expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null });
    expect(await h.revocationOf(taskId)).toMatchObject({
      status: 'IN_PROGRESS',
      completedBy: null,
      revocation: { completion: null },
    });
  };

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('K2: the member is removed from the workspace (US-07-05 AC-1, AC-2, AC-4)', () => {
    it('AC-1, AC-2, AC-17: the seat is free only once the account is removed, and nothing about money changes', async () => {
      const subscriptionId = await h.subscription(3, 'K2');
      await h.seat({ subscriptionId }, code());
      await h.seat({ subscriptionId }, code());
      const { assignmentId, taskId } = await taken({ subscriptionId });
      const money = await h.untouched();
      expect(await h.freeSeats(subscriptionId)).toBe(0);

      // Taken and not completed: the seat is still held (AC-2), and a grant's own completion does not end a revocation.
      expect(await h.freeSeats(subscriptionId)).toBe(0);
      expect(h.codeOf(await h.complete(taskId, { evidence: 'xong' }).expect(409))).toBe(
        'PROVISIONING_TASK.IS_REVOCATION',
      );
      await unchanged(assignmentId, taskId);

      const done = taskOf(
        await h
          .revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: ' đã xóa tài khoản khỏi workspace ' })
          .expect(200),
      );

      expect(done).toMatchObject({
        status: 'COMPLETED',
        completedBy: h.it1.appUserId,
        evidence: 'đã xóa tài khoản khỏi workspace',
        doneWhen: 'ACCOUNT_REMOVED_OR_NOT_NEEDED',
        revocation: { completion: 'ACCOUNT_REMOVED', accessState: null, terminating: false, terminatingUntil: null },
      });
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: h.today() });
      expect(await h.freeSeats(subscriptionId)).toBe(1);
      expect(await h.untouched()).toEqual(money);
      expect((await h.auditEvents('ProvisioningTask', taskId)).map((event) => event.action)).toEqual([
        'PROVISIONING_TASK.REVOCATION_OPENED',
        'PROVISIONING_TASK.CLAIMED',
        'PROVISIONING_TASK.REVOCATION_COMPLETED',
      ]);
      expect((await h.auditEvents('ProvisioningTask', taskId)).at(-1)).toMatchObject({
        actor_app_user_id: h.it1.appUserId,
        before: { status: 'IN_PROGRESS' },
        after: { status: 'COMPLETED', completion: 'ACCOUNT_REMOVED', validUntil: h.today(), selfExecuted: false },
      });
      const ended = await h.auditEvents('LicenseAssignment', assignmentId);
      expect(ended.at(-1)).toMatchObject({
        action: 'LICENSE_ASSIGNMENT.ENDED',
        before: { validUntil: null },
        after: { validUntil: h.today(), revocationTaskId: taskId },
      });
      expect(JSON.stringify([...ended, ...(await h.auditEvents('ProvisioningTask', taskId))])).not.toContain('đã xóa');
    });

    it('answers 409 to a completion of a task nobody took or that is completed, and changes nothing', async () => {
      const assignmentId = await h.seat({ subscriptionId: await h.subscription(5, 'K2') }, code());
      const { taskId } = await h.open(assignmentId, 'GHOST_SEAT');

      expect(h.codeOf(await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(409))).toBe(
        'PROVISIONING_TASK.NOT_IN_PROGRESS',
      );
      await h.claim(taskId).expect(200);
      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(200);

      expect(h.codeOf(await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(409))).toBe(
        'PROVISIONING_TASK.NOT_IN_PROGRESS',
      );
      expect((await h.assignmentRow(assignmentId)).valid_until).toBe(h.today());
    });

    it('answers one completion and one 409 when two IT Admins complete at once', async () => {
      const { assignmentId, taskId } = await taken({ subscriptionId: await h.subscription(5, 'K2') });

      const answers = await Promise.all([
        h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'một' }),
        h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'hai' }),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
      expect((await h.assignmentRow(assignmentId)).valid_until).toBe(h.today());
      expect(
        (await h.auditEvents('LicenseAssignment', assignmentId)).filter(
          (event) => event.action === 'LICENSE_ASSIGNMENT.ENDED',
        ),
      ).toHaveLength(1);
    });

    it('refuses a completion with no evidence, a blank one or a way that does not fit, and the seat stays', async () => {
      const { assignmentId, taskId } = await taken({ subscriptionId: await h.subscription(5, 'K2') });

      for (const body of [{ completion: 'ACCOUNT_REMOVED' }, { completion: 'ACCOUNT_REMOVED', evidence: '  ' }]) {
        expect(h.codeOf(await h.revoked(taskId, body).expect(422))).toBe('PROVISIONING_TASK.EVIDENCE_REQUIRED');
      }
      for (const completion of ['OFF_SYSTEM_REVOKED', 'RENEWAL_CANCELLED']) {
        expect(h.codeOf(await h.revoked(taskId, { completion, evidence: 'x' }).expect(422))).toBe(
          'REVOCATION.COMPLETION_NOT_ALLOWED',
        );
      }
      expect(
        h.codeOf(
          await h
            .revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x', paidThroughOn: '2026-11-30' })
            .expect(422),
        ),
      ).toBe('REVOCATION.COMPLETION_NOT_ALLOWED');
      await unchanged(assignmentId, taskId);
    });

    it('AC-4: an account the person removed themselves is completed with the note of who confirmed it, never without', async () => {
      const subscriptionId = await h.subscription(1, 'K2');
      const { assignmentId, taskId } = await taken({ subscriptionId });

      for (const body of [{ completion: 'ALREADY_GONE' }, { completion: 'ALREADY_GONE', note: '   ', evidence: 'x' }]) {
        expect(h.codeOf(await h.revoked(taskId, body).expect(422))).toBe('REVOCATION.NOTE_REQUIRED');
      }
      await unchanged(assignmentId, taskId);
      expect(await h.freeSeats(subscriptionId)).toBe(0);

      const done = taskOf(
        await h.revoked(taskId, { completion: 'ALREADY_GONE', note: ' người dùng tự xóa tài khoản ' }).expect(200),
      );

      expect(done).toMatchObject({
        status: 'COMPLETED',
        evidence: 'người dùng tự xóa tài khoản',
        revocation: { completion: 'ALREADY_GONE', completionNote: 'người dùng tự xóa tài khoản' },
      });
      expect(await h.freeSeats(subscriptionId)).toBe(1);
    });

    it('ends the seat of someone who began today tomorrow: its period is never empty, so it counts one more day', async () => {
      const subscriptionId = await h.subscription(2, 'K2');
      const employee = await h.person(code());
      const grant = await h.granted(employee, await h.planOf(subscriptionId), { subscriptionId });
      await h.claim(grant.id).expect(200);
      await h.complete(grant.id, { evidence: 'đã thêm' }).expect(200);
      const { taskId } = await h.open(grant.assignmentId, 'RETURN');
      await h.claim(taskId).expect(200);

      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(200);

      expect(await h.assignmentRow(grant.assignmentId)).toMatchObject({
        valid_from: h.today(),
        valid_until: h.inDays(1),
      });
      expect(await h.freeSeats(subscriptionId)).toBe(1);
    });
  });

  describe('K5: revoked outside the system (US-07-05 AC-8)', () => {
    it('ends the assignment with the evidence, and no seat, subscription or money changes', async () => {
      const planId = await h.plan('K5');
      const { assignmentId, taskId } = await taken({ planId });
      const money = await h.untouched();

      expect(h.codeOf(await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(422))).toBe(
        'REVOCATION.COMPLETION_NOT_ALLOWED',
      );
      expect(h.codeOf(await h.revoked(taskId, { completion: 'OFF_SYSTEM_REVOKED' }).expect(422))).toBe(
        'PROVISIONING_TASK.EVIDENCE_REQUIRED',
      );
      await unchanged(assignmentId, taskId);

      const done = taskOf(
        await h
          .revoked(taskId, { completion: 'OFF_SYSTEM_REVOKED', evidence: 'đã thu hồi quyền trong cổng báo cáo' })
          .expect(200),
      );

      expect(done).toMatchObject({
        status: 'COMPLETED',
        doneWhen: 'REVOKED_OFF_SYSTEM_WITH_EVIDENCE',
        subscriptionId: null,
        revocation: { completion: 'OFF_SYSTEM_REVOKED' },
      });
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: h.today() });
      expect(await h.untouched()).toEqual(money);
    });
  });

  describe('K1: the renewal is cancelled and the state of the access is kept (US-07-05 AC-5, AC-19)', () => {
    // A K1 revocation is completed with the checklist of its variant (`QĐ-111az`): MANAGER_NOT_NEEDED is for a person who still works, the departures below name theirs.
    const renewal = (extra: object = {}) => ({
      completion: 'RENEWAL_CANCELLED',
      evidence: 'đã hủy gia hạn',
      k1Checklist: k1Checklist('STILL_EMPLOYED'),
      ...extra,
    });
    const leaving = () => ({ k1Checklist: k1Checklist('DEPARTURE') });
    const x = () => h.inDays(36);

    it('AC-5: locking the company account takes nothing back, and a completion without the state of the access is not stored', async () => {
      const subscriptionId = await h.subscription(1, 'K1');
      const assignmentId = await h.seat({ subscriptionId }, 'E-K1-LOCK');
      const { taskId } = await h.open(assignmentId, 'MANAGER_NOT_NEEDED');
      await h.claim(taskId).expect(200);
      const holder = (await h.assignmentsOf({ subscriptionId }))[0].employeeId;
      const account = await h.account('E-K1-LOCK', holder, 'EMPLOYEE');
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [account.appUserId]);

      // The account of the person is locked, which is not cancelling the renewal: the task is as it was, the seat held.
      await unchanged(assignmentId, taskId);
      expect(await h.freeSeats(subscriptionId)).toBe(0);
      expect(h.codeOf(await h.revoked(taskId, renewal({ paidThroughOn: x() })).expect(422))).toBe(
        'REVOCATION.ACCESS_STATE_REQUIRED',
      );
      expect(h.codeOf(await h.revoked(taskId, renewal({ accessState: 'UNTIL_PAID_END' })).expect(422))).toBe(
        'REVOCATION.PAID_THROUGH_REQUIRED',
      );
      // A K1 completion stands on its checklist and the evidence in it: with neither, it is the checklist that is missing (`QĐ-111az`).
      expect(h.codeOf(await h.revoked(taskId, { completion: 'RENEWAL_CANCELLED' }).expect(422))).toBe(
        'REVOCATION.K1_CHECKLIST_INCOMPLETE',
      );
      await unchanged(assignmentId, taskId);
    });

    it('refuses a cut with no day, no evidence or a day that is ahead, and a run-on access with a cut day', async () => {
      const { assignmentId, taskId } = await taken({ subscriptionId: await h.subscription(3, 'K1') });
      const cases: [object, string][] = [
        [{ accessState: 'CUT', accessEvidence: 'x' }, 'REVOCATION.ACCESS_STATE_REQUIRED'],
        [{ accessState: 'CUT', accessCutOn: h.today() }, 'REVOCATION.ACCESS_STATE_REQUIRED'],
        [{ accessState: 'CUT', accessCutOn: h.inDays(1), accessEvidence: 'x' }, 'REVOCATION.ACCESS_STATE_INVALID'],
        [{ accessState: 'UNTIL_PAID_END', accessCutOn: h.today() }, 'REVOCATION.ACCESS_STATE_INVALID'],
      ];

      for (const [extra, code] of cases) {
        expect(h.codeOf(await h.revoked(taskId, renewal({ paidThroughOn: x(), ...extra })).expect(422))).toBe(code);
      }
      await unchanged(assignmentId, taskId);
    });

    it('AC-19: a seat whose access runs on ends at the end of the paid period, terminating until then, and still counts', async () => {
      const subscriptionId = await h.subscription(1, 'K1');
      const { assignmentId, taskId } = await taken({ subscriptionId }, 'ABRUPT_DEPARTURE');
      const holder = (await h.assignmentsOf({ subscriptionId }))[0].employeeId;
      expect(await h.freeSeats(subscriptionId)).toBe(0);

      const done = taskOf(
        await h
          .revoked(taskId, renewal({ ...leaving(), paidThroughOn: x(), accessState: 'UNTIL_PAID_END' }))
          .expect(200),
      );

      expect(done).toMatchObject({
        status: 'COMPLETED',
        doneWhen: 'RENEWAL_CANCELLED_WITH_ACCESS_STATE',
        revocation: {
          source: 'ABRUPT_DEPARTURE',
          completion: 'RENEWAL_CANCELLED',
          accessState: 'UNTIL_PAID_END',
          paidThroughOn: x(),
          terminating: true,
          terminatingUntil: x(),
        },
      });
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: x() });
      expect(await h.freeSeats(subscriptionId)).toBe(0);
      const listed = h.dataOf<{ items: RevocationTaskWire[] }>(await h.list({ pageSize: 100 }).expect(200)).items;
      expect(listed.find((item) => item.id === taskId)?.revocation).toMatchObject({
        terminating: true,
        terminatingUntil: x(),
      });
      const warning = await h.ctx.app.get(LicensingApi).listTerminatingAccess([holder]);
      expect(warning).toEqual([
        {
          assignmentId,
          employeeId: holder,
          planId: await h.planOf(subscriptionId),
          subscriptionId,
          taskId,
          accessUntil: x(),
        },
      ]);

      // Nothing more is done: it ends on the day it was left to run to.
      expect(h.codeOf(await h.accessCut(taskId, { accessCutOn: h.inDays(1), evidence: 'x' }).expect(422))).toBe(
        'REVOCATION.ACCESS_STATE_INVALID',
      );
      expect(h.codeOf(await h.accessCut(taskId, { accessCutOn: h.today() }).expect(422))).toBe(
        'PROVISIONING_TASK.EVIDENCE_REQUIRED',
      );
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: x() });
    });

    it('AC-19: cutting the access earlier brings the end of the seat forward, once', async () => {
      const subscriptionId = await h.subscription(1, 'K1');
      const { assignmentId, taskId } = await taken({ subscriptionId }, 'ABRUPT_DEPARTURE');
      await h.revoked(taskId, renewal({ ...leaving(), paidThroughOn: x(), accessState: 'UNTIL_PAID_END' })).expect(200);
      const cutOn = h.inDays(-3);

      const cut = taskOf(
        await h.accessCut(taskId, { accessCutOn: cutOn, evidence: ' đã khóa tài khoản ' }).expect(200),
      );

      expect(cut).toMatchObject({
        status: 'COMPLETED',
        revocation: {
          accessState: 'CUT',
          accessCutOn: cutOn,
          accessEvidence: 'đã khóa tài khoản',
          paidThroughOn: x(),
          terminating: false,
          terminatingUntil: null,
        },
      });
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: cutOn });
      expect(await h.freeSeats(subscriptionId)).toBe(1);
      expect((await h.auditEvents('ProvisioningTask', taskId)).at(-1)).toMatchObject({
        action: 'PROVISIONING_TASK.ACCESS_CUT',
        after: { accessState: 'CUT', accessCutOn: cutOn, validUntil: cutOn, shortened: true },
      });
      expect((await h.auditEvents('LicenseAssignment', assignmentId)).at(-1)).toMatchObject({
        action: 'LICENSE_ASSIGNMENT.ENDED',
        before: { validUntil: x() },
        after: { validUntil: cutOn, revocationTaskId: taskId },
      });
      expect(h.codeOf(await h.accessCut(taskId, { accessCutOn: cutOn, evidence: 'lại' }).expect(409))).toBe(
        'PROVISIONING_TASK.NOT_TERMINATING',
      );
    });

    it('ends a seat the day the access was cut when that is sooner than the paid period, and never after it', async () => {
      const { assignmentId, taskId } = await taken({ subscriptionId: await h.subscription(2, 'K1') });
      const early = await h.revoked(
        taskId,
        renewal({ paidThroughOn: x(), accessState: 'CUT', accessCutOn: h.inDays(-1), accessEvidence: 'đã khóa' }),
      );
      expect(early.status).toBe(200);
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: h.inDays(-1) });
      expect(taskOf(early).revocation).toMatchObject({ accessState: 'CUT', terminating: false });

      const second = await taken({ subscriptionId: await h.subscription(2, 'K1') });
      await h
        .revoked(
          second.taskId,
          renewal({
            paidThroughOn: h.inDays(-5),
            accessState: 'CUT',
            accessCutOn: h.today(),
            accessEvidence: 'đã khóa',
          }),
        )
        .expect(200);
      expect(await h.assignmentRow(second.assignmentId)).toMatchObject({ valid_until: h.inDays(-5) });
    });

    it('lets a paid period that ends today give the seat back today, with nothing left to do', async () => {
      const subscriptionId = await h.subscription(1, 'K1');
      const { assignmentId, taskId } = await taken({ subscriptionId });

      await h.revoked(taskId, renewal({ paidThroughOn: h.today(), accessState: 'UNTIL_PAID_END' })).expect(200);

      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: h.today() });
      expect(await h.freeSeats(subscriptionId)).toBe(1);
      expect(await h.revocationOf(taskId)).toMatchObject({ revocation: { terminating: false } });
    });

    it('takes no cut for a task that is not a K1 revocation, and answers 404 and 409 where they belong', async () => {
      const { taskId } = await taken({ subscriptionId: await h.subscription(2, 'K2') });
      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(200);

      expect(h.codeOf(await h.accessCut(taskId, { accessCutOn: h.today(), evidence: 'x' }).expect(409))).toBe(
        'PROVISIONING_TASK.NOT_TERMINATING',
      );
      expect(h.codeOf(await h.accessCut(randomUUID(), { accessCutOn: h.today(), evidence: 'x' }).expect(404))).toBe(
        'PROVISIONING_TASK.NOT_FOUND',
      );
      expect(
        h.codeOf(await h.revoked(randomUUID(), { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(404)),
      ).toBe('PROVISIONING_TASK.NOT_FOUND');
    });
  });

  it('answers 409 NOT_REVOCATION to the completion and the access cut of the task of a grant, and it is unchanged', async () => {
    const subscriptionId = await h.subscription(2, 'K2');
    const grant = await h.granted(await h.person(code()), await h.planOf(subscriptionId), { subscriptionId });
    await h.claim(grant.id).expect(200);

    expect(h.codeOf(await h.revoked(grant.id, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(409))).toBe(
      'PROVISIONING_TASK.NOT_REVOCATION',
    );
    expect(h.codeOf(await h.accessCut(grant.id, { accessCutOn: h.today(), evidence: 'x' }).expect(409))).toBe(
      'PROVISIONING_TASK.NOT_REVOCATION',
    );
    expect(
      await h
        .getTask(grant.id)
        .expect(200)
        .then((response) => taskOf(response)),
    ).toMatchObject({
      status: 'IN_PROGRESS',
      kind: 'GRANT',
      revocation: null,
    });
  });

  describe('a revocation that could not be done leaves the right where it was (US-07-05 AC-15)', () => {
    it('keeps the assignment whole through the failure, the retry and the closing, and a new task can end it', async () => {
      const subscriptionId = await h.subscription(1, 'K2');
      const { assignmentId, taskId } = await taken({ subscriptionId });

      const failed = taskOf(
        await h.fail(taskId, { reason: 'quản trị viên workspace không đăng nhập được' }).expect(200),
      );

      expect(failed).toMatchObject({ status: 'FAILED', availableDecisions: ['RETRY', 'CLOSE_FAILED'] });
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null, failed_at: null });
      expect(await h.freeSeats(subscriptionId)).toBe(0);
      expect(h.codeOf(await h.handOff(taskId, {}).expect(409))).toBe('PROVISIONING_TASK.ALREADY_MANUAL');
      expect(h.codeOf(await h.cancelTask(taskId).expect(409))).toBe('PROVISIONING_TASK.NO_WITHDRAWAL');
      expect(taskOf(await h.retry(taskId).expect(200))).toMatchObject({
        status: 'QUEUED',
        revocation: { source: 'MANAGER_NOT_NEEDED' },
      });
      await h.claim(taskId).expect(200);
      await h.fail(taskId, { reason: 'vẫn không được' }).expect(200);

      expect(h.codeOf(await h.closeFailed(taskId, {}).expect(422))).toBe('PROVISIONING_TASK.REASON_REQUIRED');
      const closed = taskOf(await h.closeFailed(taskId, { reason: ' để xử lý sau ' }).expect(200));

      expect(closed).toMatchObject({ status: 'CLOSED_FAILED', closeReason: 'để xử lý sau', requestId: null });
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null, failed_at: null });
      expect(await h.freeSeats(subscriptionId)).toBe(0);
      expect((await h.auditEvents('ProvisioningTask', taskId)).at(-1)).toMatchObject({
        action: 'PROVISIONING_TASK.CLOSED_FAILED',
        after: { status: 'CLOSED_FAILED', taskKind: 'REVOKE', assignmentStillOpen: true },
      });
      expect(await h.auditEvents('LicenseAssignment', assignmentId)).toHaveLength(1);

      const next = await h.open(assignmentId, 'RE_EXECUTION');
      expect(next).toMatchObject({ created: true });
      await h.claim(next.taskId).expect(200);
      await h.revoked(next.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa lần hai' }).expect(200);
      expect(await h.freeSeats(subscriptionId)).toBe(1);
    });
  });

  describe('who works a revocation (US-07-05 AC-18, QĐ-77m)', () => {
    it('AC-18: Finance, the Super Admin and an employee can neither complete nor cut, and the task is unchanged', async () => {
      const { assignmentId, taskId } = await taken({ subscriptionId: await h.subscription(3, 'K2') });
      const superAdmin: ApiAccount = { ...h.it1, accessToken: h.admin };

      for (const account of [h.finance, h.employee, superAdmin]) {
        expect(
          h.codeOf(await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }, account).expect(403)),
        ).toBe('AUTHORIZATION.FORBIDDEN');
        expect(
          h.codeOf(await h.accessCut(taskId, { accessCutOn: h.today(), evidence: 'x' }, account).expect(403)),
        ).toBe('AUTHORIZATION.FORBIDDEN');
      }
      await unchanged(assignmentId, taskId);
    });

    it('an IT Admin who is the person revoked cannot complete it while another IT Admin can', async () => {
      const own = await h.account('E-DONE-OWN', await h.person('E-DONE-OWN'), 'IT_ADMIN');
      const subscriptionId = await h.subscription(3, 'K2');
      const assignmentId = await h.seat({ subscriptionId }, 'E-DONE-OWN');
      const { taskId } = await h.open(assignmentId, 'TRANSFER_REVIEW');
      await h.claim(taskId).expect(200);

      expect(h.codeOf(await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }, own).expect(403))).toBe(
        'PROVISIONING.ANOTHER_IT_ADMIN_NEEDED',
      );
      await unchanged(assignmentId, taskId);
    });
  });
});
