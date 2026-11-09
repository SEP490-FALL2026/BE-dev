import { randomUUID } from 'node:crypto';
import {
  ProvisioningAnotherItAdminNeededError,
  RevocationRefusedError,
} from '../../../src/modules/licensing/public/licensing.errors';
import { REVOCATION_SOURCES } from '../../../src/modules/licensing/public/licensing.types';
import type { ApiAccount } from '../../support/api-accounts';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

/** The code of what a call refused with, whether the answer is an error of the module or none. */
const refusal = async (call: Promise<unknown>): Promise<string | null> => {
  try {
    await call;

    return null;
  } catch (error) {
    if (error instanceof RevocationRefusedError) return error.problem;
    if (error instanceof ProvisioningAnotherItAdminNeededError) return 'ANOTHER_IT_ADMIN_NEEDED';

    return (error as Error).name;
  }
};

describe('opening the revocation of a seat, the one gate of every source (integration, real PostgreSQL)', () => {
  let k2: string;
  let k1: string;
  let internal: string;
  let counter = 0;
  const code = () => `E-OPEN-${(counter += 1)}`;
  const tasks = () => h.count('provisioning_tasks');

  beforeAll(async () => {
    await h.start();
    k2 = await h.subscription(40, 'K2');
    k1 = await h.subscription(10, 'K1');
    internal = await h.plan('K5');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-07-05 AC-3: refuses a request with no source or one that is none of the thirteen, and writes nothing', async () => {
    const assignmentId = await h.seat({ subscriptionId: k2 }, code());
    const before = { tasks: await tasks(), reasons: await h.count('provisioning_task_reasons') };

    for (const source of [undefined, '', 'WHENEVER', 'return']) {
      expect(await refusal(h.open(assignmentId, source))).toBe('SOURCE_REQUIRED');
    }

    expect({ tasks: await tasks(), reasons: await h.count('provisioning_task_reasons') }).toEqual(before);
    expect(await h.liveTaskOf(assignmentId)).toBeNull();
  });

  it('US-07-05 AC-11: every one of the thirteen sources opens a task that names it, in the queue of the IT Admin, by hand', async () => {
    const opened: { source: string; assignmentId: string; taskId: string }[] = [];
    for (const source of REVOCATION_SOURCES) {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const answer = await h.open(assignmentId, source, {
        decision: { decidedRole: 'HR', referenceKind: 'REQUEST', referenceId: randomUUID(), note: `vì ${source}` },
      });
      expect(answer).toMatchObject({ created: true, reasonAdded: false, status: 'QUEUED' });
      opened.push({ source, assignmentId, taskId: answer.taskId });
    }

    for (const { source, assignmentId, taskId } of opened) {
      const task = await h.revocationOf(taskId);
      expect(task).toMatchObject({
        kind: 'REVOKE',
        channel: 'MANUAL',
        status: 'QUEUED',
        requestId: null,
        assignmentId,
        maxAttempts: 4,
        revocation: {
          source,
          reasonCount: 1,
          completion: null,
          terminating: false,
          firstReason: { decidedRole: 'HR', referenceKind: 'REQUEST', note: `vì ${source}` },
        },
      });
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null });
      expect(await h.reasonsOf(taskId)).toHaveLength(1);
      const events = await h.auditEvents('ProvisioningTask', taskId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'PROVISIONING_TASK.REVOCATION_OPENED',
        before: null,
        after: { assignmentId, source, decidedRole: 'HR', selfExecuted: false },
      });
      // No note, no account identifier in the trail.
      expect(JSON.stringify(events)).not.toContain('vì ');
      expect(JSON.stringify(events)).not.toContain('@acme.vn');
    }
    expect(opened).toHaveLength(13);
  }, 300000);

  it('opens the task in the queue of the IT Admin in charge of the department of the holder today', async () => {
    const designer = await h.jobTitle('Revocation designer');
    const inCharge = await h.person('E-REV-IT');
    await h.account('E-REV-IT', inCharge, 'IT_ADMIN');
    await h.department('P-REV', inCharge);
    const member = await h.member('P-REV', 'E-REV-M', designer);
    await h.written({ subscriptionId: k2 }, [
      { employee_code: 'E-REV-M', account_identifier: 'e-rev-m@acme.vn', granted_on: '2026-10-02' },
    ]);
    const assignmentId = (await h.assignmentsOf({ subscriptionId: k2, employeeId: member }))[0].id;

    const { taskId } = await h.open(assignmentId, 'DEPARTURE');

    expect(await h.revocationOf(taskId)).toMatchObject({
      defaultResponsibleEmployeeId: inCharge,
      inGeneralQueue: false,
    });
  });

  it('US-07-05 AC-12: opens for a person who left and keeps the seat until the work is done', async () => {
    const assignmentId = await h.seat({ subscriptionId: k2 }, code());
    const holder = (await h.assignmentsOf({ subscriptionId: k2 })).find(
      (assignment) => assignment.id === assignmentId,
    )?.employeeId;
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [holder]);

    const { taskId } = await h.open(assignmentId, 'ABRUPT_DEPARTURE');

    expect(await h.revocationOf(taskId)).toMatchObject({
      status: 'QUEUED',
      revocation: { source: 'ABRUPT_DEPARTURE' },
    });
    expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null });
    // The IT Admin may take the task of a person who left: nobody can be given the seat of a leaver, but it can be taken away.
    await h.claim(taskId).expect(200);
    expect(await h.revocationOf(taskId)).toMatchObject({ status: 'IN_PROGRESS' });
  });

  describe('a seat has one task, however many reasons ask for it (QĐ-64a)', () => {
    it('adds the reason of a second source to the task the seat has, and asking again changes nothing', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const first = await h.open(assignmentId, 'MANAGER_NOT_NEEDED', { decision: { decidedRole: 'MANAGER' } });
      const before = await tasks();

      const second = await h.open(assignmentId, 'TIME_LIMITED_EXPIRY', { decision: { decidedRole: 'SYSTEM' } });

      expect(second).toEqual({ taskId: first.taskId, created: false, reasonAdded: true, status: 'QUEUED' });
      expect(await tasks()).toBe(before);
      expect(await h.reasonsOf(first.taskId)).toMatchObject([
        { source: 'MANAGER_NOT_NEEDED', decided_role: 'MANAGER' },
        { source: 'TIME_LIMITED_EXPIRY', decided_role: 'SYSTEM' },
      ]);
      expect(await h.revocationOf(first.taskId)).toMatchObject({
        revocation: { source: 'MANAGER_NOT_NEEDED', reasonCount: 2 },
      });
      const events = await h.auditEvents('ProvisioningTask', first.taskId);
      expect(events.map((event) => event.action)).toEqual([
        'PROVISIONING_TASK.REVOCATION_OPENED',
        'PROVISIONING_TASK.REVOCATION_REASON_ADDED',
      ]);

      const again = await h.open(assignmentId, 'TIME_LIMITED_EXPIRY', { decision: { decidedRole: 'SYSTEM' } });

      expect(again).toEqual({ taskId: first.taskId, created: false, reasonAdded: false, status: 'QUEUED' });
      expect(await h.reasonsOf(first.taskId)).toHaveLength(2);
      expect(await h.auditEvents('ProvisioningTask', first.taskId)).toHaveLength(2);
    });

    it('takes the same source again as another reason when it refers to another decision', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const first = await h.open(assignmentId, 'RETURN', {
        decision: { referenceKind: 'REQUEST', referenceId: randomUUID() },
      });

      const other = await h.open(assignmentId, 'RETURN', {
        decision: { referenceKind: 'REQUEST', referenceId: randomUUID() },
      });

      expect(other).toMatchObject({ taskId: first.taskId, created: false, reasonAdded: true });
      expect(await h.reasonsOf(first.taskId)).toHaveLength(2);
    });

    it('makes one task when two sources ask for the same seat at once', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());

      const answers = await Promise.all([
        h.open(assignmentId, 'GHOST_SEAT'),
        h.open(assignmentId, 'SUBSCRIPTION_REDUCTION'),
        h.open(assignmentId, 'NOT_LEGALIZED'),
      ]);

      expect(answers.filter((answer) => answer.created)).toHaveLength(1);
      expect(answers.filter((answer) => answer.reasonAdded)).toHaveLength(2);
      expect(new Set(answers.map((answer) => answer.taskId)).size).toBe(1);
      expect(await h.reasonsOf(answers[0].taskId)).toHaveLength(3);
    });

    it('opens another task after the first was closed as failed, and the seat is still whole', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const first = await h.open(assignmentId, 'RETURN');
      await h.claim(first.taskId).expect(200);
      await h.fail(first.taskId, { reason: 'không xóa được' }).expect(200);
      await h.closeFailed(first.taskId, { reason: 'nhà cung cấp lỗi' }).expect(200);
      expect(await h.liveTaskOf(assignmentId)).toBeNull();
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null, failed_at: null });

      const second = await h.open(assignmentId, 'RE_EXECUTION');

      expect(second).toMatchObject({ created: true, reasonAdded: false });
      expect(second.taskId).not.toBe(first.taskId);
    });
  });

  describe('which seat may be revoked', () => {
    it('refuses a seat of K4, which has no revocation yet, and writes nothing', async () => {
      const subscriptionId = await h.subscription(5, 'K4');
      const planId = await h.planOf(subscriptionId);
      const assignmentId = randomUUID();
      const holder = await h.person(code());
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, 'k4@acme.vn', 'k4@acme.vn', '2026-01-05', 'ACTUAL', $6)`,
        [assignmentId, h.seed.organizationId, planId, subscriptionId, holder, randomUUID()],
      );
      const before = await tasks();

      expect(await refusal(h.open(assignmentId, 'RETURN'))).toBe('TYPE_NOT_SUPPORTED');
      expect(await tasks()).toBe(before);
    });

    it('refuses a service account: a person answers for it and a departure does not take it away', async () => {
      const subscriptionId = await h.subscription(5, 'K2');
      const unit = await h.ownUnit();
      const assignmentId = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from,
           valid_from_basis, created_by_app_user_id)
         VALUES ($1, $2, 'SERVICE', 'REQUEST', $3, $4, $5, 'ci-bot', 'ci-bot', 'CI', $6, $7, '2026-01-05', 'ACTUAL', $8)`,
        [
          assignmentId,
          h.seed.organizationId,
          await h.planOf(subscriptionId),
          subscriptionId,
          await h.person(code()),
          unit.id,
          unit.departmentId,
          randomUUID(),
        ],
      );

      expect(await refusal(h.open(assignmentId, 'DEPARTURE'))).toBe('ASSIGNMENT_IS_SERVICE_ACCOUNT');
      expect(await h.liveTaskOf(assignmentId)).toBeNull();
    });

    it('refuses a seat that has ended, failed or been cancelled, and a seat that does not exist', async () => {
      const ended = await h.seat({ subscriptionId: k2 }, code());
      await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2026-09-01' WHERE id = $1`, [ended]);

      expect(await refusal(h.open(ended, 'RETURN'))).toBe('AssignmentNotOpenError');
      expect(await refusal(h.open(randomUUID(), 'RETURN'))).toBe('AssignmentNotFoundError');
    });

    it('opens for K1 and for K5, the one that takes no seat', async () => {
      const k1Seat = await h.seat({ subscriptionId: k1 }, code());
      const k5Seat = await h.seat({ planId: internal }, code());

      const forK1 = await h.open(k1Seat, 'RETURN');
      const forK5 = await h.open(k5Seat, 'RETURN');

      expect((await h.revocationOf(forK1.taskId)).steps.map((step) => step.code)).toEqual([
        'CANCEL_RENEWAL_ON_PROVIDER',
        'RECORD_ACCESS_STATE',
        'CONFIRM_WITH_EVIDENCE',
      ]);
      expect(await h.revocationOf(forK5.taskId)).toMatchObject({
        doneWhen: 'REVOKED_OFF_SYSTEM_WITH_EVIDENCE',
        subscriptionId: null,
      });
    });
  });

  describe('BR-MF5-04: the timing and the notice a source may ask for', () => {
    const holderOf = async (assignmentId: string): Promise<string> => {
      const found = (await h.assignmentsOf({ subscriptionId: k2 })).find(
        (assignment) => assignment.id === assignmentId,
      );
      if (!found) throw new Error('no holder');

      return found.employeeId;
    };

    it('mốc gộp: a reason with a day not before gives it to the task, one with none takes it away, withdrawing that one gives it back', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const notBefore = h.inDays(7);
      const ghost = randomUUID();

      const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', {
        decision: { referenceKind: 'REVIEW', referenceId: ghost },
        timing: { notBefore, dueOn: h.inDays(20) },
      });
      expect(await h.timingOf(taskId)).toEqual({ not_before: notBefore, due_on: h.inDays(20) });

      await h.open(assignmentId, 'TIME_LIMITED_EXPIRY');
      expect(await h.timingOf(taskId)).toEqual({ not_before: null, due_on: h.inDays(20) });

      expect(await h.withdraw(assignmentId, 'TIME_LIMITED_EXPIRY', null)).toMatchObject({ outcome: 'CONTINUES' });
      expect(await h.timingOf(taskId)).toEqual({ not_before: notBefore, due_on: h.inDays(20) });
    });

    it('R-J08 đè mốc: a sudden departure on a seat in its grace leaves no day not before, so the seat can be taken at once', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', {
        decision: { referenceKind: 'REVIEW', referenceId: randomUUID() },
        timing: { notBefore: h.inDays(7) },
      });
      expect(h.codeOf(await h.claim(taskId).expect(409))).toBe('PROVISIONING_TASK.NOT_BEFORE');

      await h.open(assignmentId, 'ABRUPT_DEPARTURE');

      expect((await h.timingOf(taskId)).not_before).toBeNull();
      await h.claim(taskId).expect(200);
    });

    it('US-10-07 AC-18: a seat in its grace is not taken before the day, with the day in the answer and nothing changed; it is on the day', async () => {
      const grace = await h.seat({ subscriptionId: k2 }, code());
      const due = await h.seat({ subscriptionId: k2 }, code());
      const notBefore = h.inDays(3);
      const waiting = (
        await h.open(grace, 'GHOST_SEAT', {
          timing: { notBefore },
          decision: { referenceId: randomUUID(), referenceKind: 'REVIEW' },
        })
      ).taskId;
      const today = (
        await h.open(due, 'GHOST_SEAT', {
          timing: { notBefore: h.today() },
          decision: { referenceId: randomUUID(), referenceKind: 'REVIEW' },
        })
      ).taskId;
      const events = (await h.auditEvents('ProvisioningTask', waiting)).length;

      const refused = await h.claim(waiting).expect(409);

      expect(h.codeOf(refused)).toBe('PROVISIONING_TASK.NOT_BEFORE');
      expect(h.detailsOf(refused)).toMatchObject({ notBefore });
      expect(await h.revocationOf(waiting)).toMatchObject({ status: 'QUEUED', claimedBy: null });
      expect((await h.auditEvents('ProvisioningTask', waiting)).length).toBe(events);
      await h.claim(today).expect(200);
      expect(await h.revocationOf(today)).toMatchObject({ status: 'IN_PROGRESS' });
    });

    it('US-10-07 AC-18 hoàn tất: a task in progress whose day not before moved back (a reason with none was withdrawn) is not completed before it', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const notBefore = h.inDays(5);
      const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', {
        timing: { notBefore },
        decision: { referenceId: randomUUID(), referenceKind: 'REVIEW' },
      });
      await h.open(assignmentId, 'ABRUPT_DEPARTURE');
      await h.claim(taskId).expect(200);
      await h.withdraw(assignmentId, 'ABRUPT_DEPARTURE', null);

      const refused = await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(409);

      expect(h.codeOf(refused)).toBe('PROVISIONING_TASK.NOT_BEFORE');
      expect(h.detailsOf(refused)).toMatchObject({ notBefore });
      expect(await h.revocationOf(taskId)).toMatchObject({ status: 'IN_PROGRESS' });
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null });
    });

    it('R-J08: every other source gives no timing: no day not before, taken at once, nobody told', async () => {
      for (const source of [
        'RETURN',
        'ABRUPT_DEPARTURE',
        'TIME_LIMITED_EXPIRY',
        'TRANSFER_REVIEW',
        'SUBSCRIPTION_REDUCTION',
      ]) {
        const assignmentId = await h.seat({ subscriptionId: k2 }, code());
        const holder = await holderOf(assignmentId);

        const { taskId } = await h.open(assignmentId, source);

        expect(await h.timingOf(taskId)).toEqual({ not_before: null, due_on: null });
        expect(await h.noticesOf(holder, 'REVOCATION_UPCOMING')).toHaveLength(0);
        await h.claim(taskId).expect(200);
      }
    });

    it('input sai: a day not before after the due day is refused and writes nothing', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const before = { tasks: await tasks(), reasons: await h.count('provisioning_task_reasons') };

      expect(
        await refusal(h.open(assignmentId, 'GHOST_SEAT', { timing: { notBefore: h.inDays(9), dueOn: h.inDays(2) } })),
      ).toBe('RevocationInputError');

      expect({ tasks: await tasks(), reasons: await h.count('provisioning_task_reasons') }).toEqual(before);
    });

    it('AC-2 US-10-06: the holder is told once that the revocation is coming, with the day; asking again tells nothing more', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const holder = await holderOf(assignmentId);
      const referenceId = randomUUID();
      const notBefore = h.inDays(7);
      const options = {
        decision: { referenceKind: 'REVIEW', referenceId },
        timing: { notBefore },
        notice: { holder: true } as const,
      };

      const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', options);
      await h.open(assignmentId, 'GHOST_SEAT', options);
      // Decided again after the first decision was taken back (another reason keeps the task): the same reference is told once.
      await h.open(assignmentId, 'TIME_LIMITED_EXPIRY');
      await h.withdraw(assignmentId, 'GHOST_SEAT', referenceId);
      await h.open(assignmentId, 'GHOST_SEAT', options);

      const notices = await h.noticesOf(holder, 'REVOCATION_UPCOMING');
      expect(notices).toHaveLength(1);
      expect(notices[0].params).toMatchObject({ taskId, source: 'GHOST_SEAT', notBefore });
    });

    it('does not tell the holder of a seat when the source did not ask, even with a day not before', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const holder = await holderOf(assignmentId);

      await h.open(assignmentId, 'GHOST_SEAT', { timing: { notBefore: h.inDays(7) } });

      expect(await h.noticesOf(holder, 'REVOCATION_UPCOMING')).toHaveLength(0);
    });

    it('đọc: the card says the day not before, the due day and whether the task may be taken; the list filters on it', async () => {
      const assignmentId = await h.seat({ subscriptionId: k2 }, code());
      const { taskId } = await h.open(assignmentId, 'GHOST_SEAT', {
        timing: { notBefore: h.inDays(4), dueOn: h.inDays(10) },
        decision: { referenceId: randomUUID(), referenceKind: 'REVIEW' },
      });
      const plain = (await h.open(await h.seat({ subscriptionId: k2 }, code()), 'RETURN')).taskId;

      expect(await h.revocationOf(taskId)).toMatchObject({
        notBefore: h.inDays(4),
        dueOn: h.inDays(10),
        claimableNow: false,
        revocation: { withdrawnReasonCount: 0, lastWithdrawnAt: null },
      });
      expect(await h.revocationOf(plain)).toMatchObject({ notBefore: null, dueOn: null, claimableNow: true });
      const idsOf = async (query: Record<string, string | number>) =>
        h
          .dataOf<{ items: { id: string }[] }>(await h.list({ pageSize: 100, ...query }).expect(200))
          .items.map((item) => item.id);
      const claimable = await idsOf({ claimableNow: 'true' });
      const waiting = await idsOf({ claimableNow: 'false' });
      expect(claimable).toContain(plain);
      expect(claimable).not.toContain(taskId);
      expect(waiting).toContain(taskId);
      expect(waiting).not.toContain(plain);
    });
  });

  describe('an IT Admin who is the person revoked (QĐ-77m, US-01-05 AC-12)', () => {
    let own: ApiAccount;
    let ownSeat: string;

    beforeAll(async () => {
      own = await h.account('E-OWN-IT', await h.person('E-OWN-IT'), 'IT_ADMIN');
      ownSeat = await h.seat({ subscriptionId: k2 }, 'E-OWN-IT');
    });

    it('is refused while another usable IT Admin can ask, and the seat is untouched', async () => {
      const before = await tasks();

      expect(await refusal(h.open(ownSeat, 'RETURN', { actor: h.actorOf(own) }))).toBe('ANOTHER_IT_ADMIN_NEEDED');
      expect(await tasks()).toBe(before);
    });

    it('is not restricted for a person who is not an IT Admin, and another IT Admin may ask for it', async () => {
      const byManager = await h.open(ownSeat, 'MANAGER_NOT_NEEDED', { actor: h.actorOf(own, ['EMPLOYEE']) });

      expect(byManager).toMatchObject({ created: true });
      expect((await h.auditEvents('ProvisioningTask', byManager.taskId))[0].after).toMatchObject({
        selfExecuted: false,
      });
    });

    it('may ask when no other IT Admin can, and the act is marked as self-executed', async () => {
      const mine = await h.seat({ subscriptionId: k1 }, 'E-OWN-IT');
      // Every other account is locked: none of the other IT Admins can act, so the one who is revoked may ask for it.
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id <> $1`, [own.appUserId]);

      const answer = await h.open(mine, 'DEPARTURE', { actor: h.actorOf(own) });

      expect(answer.created).toBe(true);
      expect((await h.auditEvents('ProvisioningTask', answer.taskId))[0].after).toMatchObject({ selfExecuted: true });
    });
  });
});
