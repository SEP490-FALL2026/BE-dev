import { Client } from 'pg';
import request from 'supertest';
import { MailboxLockSettlement } from '../../../src/modules/personnel/departure-closure/mailbox-lock-settlement.service';
import { DepartureClosureService } from '../../../src/modules/personnel/departure-closure/departure-closure.service';
import { OffboardingHarness, type CaseWire, type RightWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';
import { k1Checklist } from '../../support/k1-checklist';

const h = new OffboardingHarness();
const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token thiết bị' };
const MAILBOX = { note: 'Đã khóa hẳn hộp thư, chuyển thư cho quản lý' };

/**
 * `MF2-G` (`QĐ-110e`, `B-1`, SPEC P28, T-MF2G): item (1b) of `BM-08`, the lock of the mailbox for good, is written by the IT Admin after (1a)
 * (and, for a person who holds a K1 seat, after every K1 revocation is completed), once; the system closes a departure that has left, whose
 * revocations are completed and whose (1b) is written. Over HTTP and SQL on real PostgreSQL.
 */
describe('the end of a departure: the lock of the mailbox and the closing of the case (integration, real PostgreSQL)', () => {
  let des: Department;
  let k2: string;
  let k1: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DC');
    await h.setItAdminInCharge(des, { employeeId: h.it1.employeeId, account: h.it1 });
    k2 = await h.subscription(60, 'K2');
    k1 = await h.subscription(60, 'K1');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A person with one seat on each of the subscriptions given (none: no seat). */
  const leaver = async (subscriptions: string[] = []) => {
    const employeeCode = `E-DC-${(counter += 1)}`;
    const person: Person = await h.worker(des, employeeCode);
    const seats: string[] = [];
    for (const subscriptionId of subscriptions) seats.push(await h.seatOf(person, { subscriptionId }, employeeCode));

    return { person, seats };
  };
  /** The person has left and the lock of the company account (1a) is written. */
  const lockedLeaver = async (subscriptions: string[] = []) => {
    const { person, seats } = await leaver(subscriptions);
    const wire = await h.recordedCase(person);
    await h.leaveOnLastDay(wire.id).expect(200);
    // The hourly pass of the block moment runs before anything closes the case (audit A-1).
    await h.blockPass();
    await h.lockAccount(wire.id, LOCK).expect(200);

    return { person, seats, wire };
  };
  const rightsOf = async (id: string) =>
    h.dataOf<{ items: RightWire[] }>(await h.rightsOf(id, '?pageSize=100').expect(200)).items;
  const refused = (response: { status: number }) => [response.status, h.codeOf(response as never)];
  const settlement = () => h.ctx.app.get(MailboxLockSettlement);
  /**
   * The IT Admin completes a K1 revocation (a departure's, lock of the mailbox ticked) while another command holds the row of the case: the
   * completion does not wait for it, so the system could not write (1b) then. The task was taken already.
   */
  const completeK1WhileCaseIsHeld = async (caseId: string, taskId: string): Promise<void> => {
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM offboarding_cases WHERE id = $1 FOR UPDATE', [caseId]);
    try {
      await h
        .revoked(taskId, {
          completion: 'RENEWAL_CANCELLED',
          evidence: 'đã hủy gia hạn',
          paidThroughOn: h.day(36),
          accessState: 'UNTIL_PAID_END',
          k1Checklist: k1Checklist('DEPARTURE'),
        })
        .expect(200);
    } finally {
      await holder.query('ROLLBACK');
      await holder.end();
    }
  };

  describe('item (1b) of BM-08 (P28)', () => {
    it('is written by the IT Admin right after (1a) for a person who holds no K1, once, with the words they add', async () => {
      const { wire } = await lockedLeaver([k2]);

      const done = h.dataOf<CaseWire>(await h.lockMailbox(wire.id, MAILBOX).expect(200));

      expect(done.mailboxLock).toMatchObject({
        recordedByAppUserId: h.it1.appUserId,
        recordedBySystem: false,
        note: MAILBOX.note,
      });
      expect(await h.changeKinds(wire.id)).toEqual([
        'RECORDED',
        'MARKED_LEFT',
        'ACCESS_BLOCKED',
        'ACCOUNT_LOCK_RECORDED',
        'MAILBOX_LOCKED',
      ]);
      const row = await h.caseRow(wire.id);
      expect([row.mailbox_lock_at !== null, row.mailbox_lock_by_app_user_id]).toEqual([true, h.it1.appUserId]);
      const events = await h.auditEventsOf('OFFBOARDING_CASE.MAILBOX_LOCK_RECORDED', wire.id);
      expect(events).toHaveLength(1);
      expect(events[0].after).toMatchObject({ by: 'IT_ADMIN' });

      // Asking again changes nothing, whatever the words of the second call: 200, the same moment, one line in the log and one event.
      const again = h.dataOf<CaseWire>(await h.lockMailbox(wire.id, { note: 'một ghi chú khác' }).expect(200));
      expect(again.mailboxLock).toEqual(done.mailboxLock);
      expect((await h.changeKinds(wire.id)).filter((kind) => kind === 'MAILBOX_LOCKED')).toHaveLength(1);
      expect(await h.auditEventsOf('OFFBOARDING_CASE.MAILBOX_LOCK_RECORDED', wire.id)).toHaveLength(1);
    });

    it('needs no words, and the person is shown with (1b) on the detail the IT Admin and the Super Admin read', async () => {
      const { wire } = await lockedLeaver();

      await h.lockMailbox(wire.id, {}).expect(200);

      const asSuperAdmin = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
      expect(asSuperAdmin.mailboxLock).toMatchObject({ note: null, recordedBySystem: false });
      const asItAdmin = h.dataOf<CaseWire>(await h.readCase(wire.id, h.it1).expect(200));
      expect(asItAdmin.mailboxLock).toEqual(asSuperAdmin.mailboxLock);
    });

    it('is refused before (1a), before the person is blocked, and for a cancelled handover, and nothing is written', async () => {
      const left = await leaver();
      const leftWire = await h.recordedCase(left.person);
      await h.leaveOnLastDay(leftWire.id).expect(200);
      const planned = await h.recordedCase((await leaver()).person);
      const cancelled = await h.recordedCase((await leaver()).person);
      await h.cancelCase(cancelled.id, { reason: 'Không nghỉ nữa' }).expect(200);

      const responses = [
        await h.lockMailbox(leftWire.id),
        await h.lockMailbox(planned.id),
        await h.lockMailbox(cancelled.id),
      ];

      expect(responses.map(refused)).toEqual([
        [409, 'OFFBOARDING_CASE.ACCOUNT_LOCK_FIRST'],
        [409, 'OFFBOARDING_CASE.CASE_NOT_BLOCKED'],
        [409, 'OFFBOARDING_CASE.CASE_NOT_BLOCKED'],
      ]);
      for (const id of [leftWire.id, planned.id, cancelled.id])
        expect((await h.caseRow(id)).mailbox_lock_at).toBeNull();
    });

    it('is refused for a person who holds a K1 seat until every revocation of a K1 seat is completed, with how many are left', async () => {
      const { seats, wire } = await lockedLeaver([k2, k1]);
      const [, k1Seat] = seats;

      const before = await h.lockMailbox(wire.id);
      expect(refused(before)).toEqual([409, 'OFFBOARDING_CASE.MAILBOX_LOCK_BEFORE_K1']);
      expect(h.detailsOf(before)).toMatchObject({ k1RightsOpen: 1 });

      await h.revokeRights(wire.id, {}).expect(200);
      const task = (await rightsOf(wire.id)).find((right) => right.assignmentId === k1Seat)?.revocation?.taskId ?? '';
      expect(refused(await h.lockMailbox(wire.id))).toEqual([409, 'OFFBOARDING_CASE.MAILBOX_LOCK_BEFORE_K1']);
      expect((await h.caseRow(wire.id)).mailbox_lock_at).toBeNull();

      await h.claim(task).expect(200);
      expect(refused(await h.lockMailbox(wire.id))).toEqual([409, 'OFFBOARDING_CASE.MAILBOX_LOCK_BEFORE_K1']);
      await h
        .revoked(task, {
          completion: 'RENEWAL_CANCELLED',
          evidence: 'đã hủy gia hạn',
          paidThroughOn: h.day(36),
          accessState: 'UNTIL_PAID_END',
          k1Checklist: k1Checklist('DEPARTURE'),
        })
        .expect(200);

      const done = h.dataOf<CaseWire>(await h.lockMailbox(wire.id, MAILBOX).expect(200));
      expect(done.mailboxLock).not.toBeNull();
    });

    it('does not count the K2 seats of the person or the K1 seat of another person', async () => {
      await leaver([k1]);
      const { wire } = await lockedLeaver([k2]);

      const done = await h.lockMailbox(wire.id, {});

      expect(done.status).toBe(200);
    });

    it.each([
      ['a blank note', { note: '   ' }],
      ['a note over 1000 characters', { note: 'a'.repeat(1001) }],
      ['a field the route does not know', { reason: 'x' }],
    ])('refuses %s with 422 before any work', async (_name, body) => {
      const { wire } = await lockedLeaver();

      const response = await h.lockMailbox(wire.id, body);

      expect(refused(response)).toEqual([422, 'VALIDATION_ERROR']);
      expect((await h.caseRow(wire.id)).mailbox_lock_at).toBeNull();
    });

    it("is the IT Admin's: the Super Admin is refused with 403", async () => {
      const { wire } = await lockedLeaver();

      const response = await h.lockMailbox(wire.id, {}, h.sa);

      expect(refused(response)).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    });
  });

  describe('item (1b) written by the system when the last K1 revocation ticks the lock of the mailbox (P28, R-1)', () => {
    /** The IT Admin opens every revocation of the person and returns the tasks of the K1 seats, in the order of the seats. */
    const openedTasks = async (id: string, seats: string[]) => {
      await h.revokeRights(id, {}).expect(200);
      const rights = await rightsOf(id);

      return seats.map((seat) => rights.find((right) => right.assignmentId === seat)?.revocation?.taskId ?? '');
    };
    /** The IT Admin takes the K1 task and completes it with the checklist of a departure (the last step ticked unless `withLock` is false). */
    const completeK1 = async (taskId: string, withLock = true): Promise<void> => {
      await h.claim(taskId).expect(200);
      await h
        .revoked(taskId, {
          completion: 'RENEWAL_CANCELLED',
          evidence: 'đã hủy gia hạn',
          paidThroughOn: h.day(36),
          accessState: 'UNTIL_PAID_END',
          k1Checklist: k1Checklist('DEPARTURE', undefined, { withLock }),
        })
        .expect(200);
    };
    const mailboxLines = async (caseId: string) =>
      (
        await h.ctx.sql.query<{ changed_by_app_user_id: string | null; changed_by_ticket_id: string | null }>(
          `SELECT changed_by_app_user_id, changed_by_ticket_id FROM offboarding_case_changes WHERE case_id = $1 AND kind = 'MAILBOX_LOCKED'`,
          [caseId],
        )
      ).rows;

    it('writes it itself for the last K1 revocation of a person, with no account, and the route then answers as it was', async () => {
      const { seats, wire } = await lockedLeaver([k2, k1]);
      const [, k1Task] = await openedTasks(wire.id, seats);

      await completeK1(k1Task);

      const written = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
      expect(written.mailboxLock).toMatchObject({ recordedByAppUserId: null, recordedBySystem: true, note: null });
      const row = await h.caseRow(wire.id);
      expect([row.mailbox_lock_at !== null, row.mailbox_lock_by_app_user_id]).toEqual([true, null]);
      expect(await mailboxLines(wire.id)).toEqual([{ changed_by_app_user_id: null, changed_by_ticket_id: null }]);
      const [event] = await h.auditEventsOf('OFFBOARDING_CASE.MAILBOX_LOCK_RECORDED', wire.id);
      expect(event).toMatchObject({ actor_kind: 'SYSTEM', actor_app_user_id: null, after: { by: 'SYSTEM' } });

      const again = h.dataOf<CaseWire>(await h.lockMailbox(wire.id, MAILBOX).expect(200));
      expect(again.mailboxLock).toEqual(written.mailboxLock);
      expect(await mailboxLines(wire.id)).toHaveLength(1);
    });

    it('writes nothing for a K1 revocation that is not the last (five steps) and writes at the last one', async () => {
      const second = await h.subscription(60, 'K1');
      const { seats, wire } = await lockedLeaver([k1, second]);
      const tasks = await openedTasks(wire.id, seats);

      await completeK1(tasks[0], false);

      expect((await h.caseRow(wire.id)).mailbox_lock_at).toBeNull();
      expect(refused(await h.lockMailbox(wire.id))).toEqual([409, 'OFFBOARDING_CASE.MAILBOX_LOCK_BEFORE_K1']);
      await completeK1(tasks[1]);
      expect(h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200)).mailboxLock).toMatchObject({
        recordedBySystem: true,
      });
    });

    it('does not write it while a K1 seat of the person has no completed revocation: the task of the only seat opened does not carry the lock step (D-71, D-62)', async () => {
      const other = await h.subscription(60, 'K1');
      const { seats, wire } = await lockedLeaver([k1, other]);
      // The IT Admin opens the revocation of one of the two K1 seats only: the other seat is still the person's, so this task has five steps (D-62).
      await h.revokeRights(wire.id, { assignmentIds: [seats[0]] }).expect(200);
      const first =
        (await rightsOf(wire.id)).find((right) => right.assignmentId === seats[0])?.revocation?.taskId ?? '';

      await completeK1(first, false);

      expect((await h.caseRow(wire.id)).mailbox_lock_at).toBeNull();
      const route = await h.lockMailbox(wire.id);
      expect(refused(route)).toEqual([409, 'OFFBOARDING_CASE.MAILBOX_LOCK_BEFORE_K1']);
      expect(h.detailsOf(route)).toMatchObject({ k1RightsOpen: 1 });
      expect(await h.changeKinds(wire.id)).not.toContain('MAILBOX_LOCKED');
      // Nor does the hourly pass, which reads the checklist the first task kept: the same rule, the same seats.
      await settlement().settle();
      expect((await h.caseRow(wire.id)).mailbox_lock_at).toBeNull();

      // The other seat is taken away too: now nothing of the person is left on K1, and the system writes it.
      await h.revokeRights(wire.id, {}).expect(200);
      const second =
        (await rightsOf(wire.id)).find((right) => right.assignmentId === seats[1])?.revocation?.taskId ?? '';
      await completeK1(second);
      expect(h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200)).mailboxLock).toMatchObject({
        recordedBySystem: true,
      });
    });

    it('does not wait for a case another command holds: the revocation is completed, and the hourly pass writes the lock from the checklist it kept (D-72)', async () => {
      const { seats, wire } = await lockedLeaver([k1]);
      const [task] = await openedTasks(wire.id, seats);
      await h.claim(task).expect(200);

      await completeK1WhileCaseIsHeld(wire.id, task);

      expect((await h.caseRow(wire.id)).mailbox_lock_at).toBeNull();
      const pass = await settlement().settle();
      expect(pass.failed).toBe(0);
      expect(pass.written).toBeGreaterThanOrEqual(1);
      const settled = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
      expect(settled.mailboxLock).toMatchObject({ recordedByAppUserId: null, recordedBySystem: true, note: null });
      expect(await h.changeKinds(wire.id)).toContain('MAILBOX_LOCKED');
      // A pass that comes again finds it written: nothing more, and the route answers as it was.
      await settlement().settle();
      expect((await h.changeKinds(wire.id)).filter((kind) => kind === 'MAILBOX_LOCKED')).toHaveLength(1);
      expect(h.dataOf<CaseWire>(await h.lockMailbox(wire.id, MAILBOX).expect(200)).mailboxLock).toEqual(
        settled.mailboxLock,
      );
    }, 60_000);
  });

  describe('the system closes a departure that has left, whose revocations are done and whose mailbox is locked (QĐ-110e, T-MF2G)', () => {
    const closing = () => h.ctx.app.get(DepartureClosureService);
    const wireOf = async (id: string) => h.dataOf<CaseWire>(await h.readCase(id).expect(200));
    /** Takes the task and completes a K2 revocation. */
    const removeK2 = async (taskId: string) => {
      await h.claim(taskId).expect(200);
      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản' }).expect(200);
    };
    const taskOf = async (id: string, seat: string) =>
      (await rightsOf(id)).find((right) => right.assignmentId === seat)?.revocation?.taskId ?? '';
    const completeK1 = async (taskId: string) => {
      await h.claim(taskId).expect(200);
      await h
        .revoked(taskId, {
          completion: 'RENEWAL_CANCELLED',
          evidence: 'đã hủy gia hạn',
          paidThroughOn: h.day(36),
          accessState: 'UNTIL_PAID_END',
          k1Checklist: k1Checklist('DEPARTURE'),
        })
        .expect(200);
    };
    const closedBy = async (id: string) => {
      const row = await h.caseRow(id);

      return [row.closed_at !== null, row.closed_by_app_user_id];
    };

    it('closes when (1b) is the last thing the case waited for: nobody closes it, the answer of the route already says so', async () => {
      const { seats, wire } = await lockedLeaver([k2]);
      await h.revokeRights(wire.id, {}).expect(200);
      await removeK2(await taskOf(wire.id, seats[0]));
      expect(await wireOf(wire.id)).toMatchObject({ closed: false, blockers: { MAILBOX_LOCK_NOT_RECORDED: 1 } });

      const done = h.dataOf<CaseWire>(await h.lockMailbox(wire.id, MAILBOX).expect(200));

      expect(done).toMatchObject({ closed: true, blockers: {} });
      expect(done.closure).toMatchObject({ closedByAppUserId: null, closedBySystem: true });
      expect(await closedBy(wire.id)).toEqual([true, null]);
      expect(await h.changeKinds(wire.id)).toEqual([
        'RECORDED',
        'MARKED_LEFT',
        'ACCESS_BLOCKED',
        'ACCOUNT_LOCK_RECORDED',
        'REVOCATIONS_OPENED',
        'MAILBOX_LOCKED',
        'CLOSED_BY_SYSTEM',
      ]);
      const [event] = await h.auditEventsOf('OFFBOARDING_CASE.CLOSED', wire.id);
      expect(event).toMatchObject({ actor_kind: 'SYSTEM', actor_app_user_id: null });
      // The log tells the lines the system wrote apart from those of an account.
      const log = h.dataOf<{ items: { kind: string; changedByAppUserId: string | null; changedBySystem: boolean }[] }>(
        await h.caseChanges(wire.id, '?pageSize=100').expect(200),
      );
      expect(log.items.filter((line) => line.changedBySystem).map((line) => line.kind)).toEqual([
        'ACCESS_BLOCKED',
        'CLOSED_BY_SYSTEM',
      ]);
      expect(log.items.find((line) => line.kind === 'MAILBOX_LOCKED')).toMatchObject({
        changedByAppUserId: h.it1.appUserId,
        changedBySystem: false,
      });
      // Closed once: asking for (1b) again answers 200 with the case as it is and writes nothing more.
      await h.lockMailbox(wire.id, {}).expect(200);
      expect(await h.auditEventsOf('OFFBOARDING_CASE.CLOSED', wire.id)).toHaveLength(1);
    });

    it('keeps a person who holds a K1 seat open until the last revocation, whichever the order: the lock ticked there closes it', async () => {
      const first = await lockedLeaver([k2, k1]);
      await h.revokeRights(first.wire.id, {}).expect(200);
      await removeK2(await taskOf(first.wire.id, first.seats[0]));
      expect(await wireOf(first.wire.id)).toMatchObject({
        closed: false,
        mailboxLock: null,
        blockers: { MAILBOX_LOCK_NOT_RECORDED: 1, PERSONAL_RIGHTS_OPEN: 1 },
      });

      await completeK1(await taskOf(first.wire.id, first.seats[1]));

      const closed = await wireOf(first.wire.id);
      expect(closed).toMatchObject({ closed: true, mailboxLock: { recordedBySystem: true } });
      expect(closed.closure).toMatchObject({ closedByAppUserId: null, closedBySystem: true });

      // The other order: the K1 revocation ticks the lock first, the case waits for the K2 seat, and its completion closes it.
      const second = await lockedLeaver([k2, k1]);
      await h.revokeRights(second.wire.id, {}).expect(200);
      await completeK1(await taskOf(second.wire.id, second.seats[1]));
      expect(await wireOf(second.wire.id)).toMatchObject({
        closed: false,
        mailboxLock: { recordedBySystem: true },
        blockers: { PERSONAL_RIGHTS_OPEN: 1 },
      });
      await removeK2(await taskOf(second.wire.id, second.seats[0]));
      expect(await wireOf(second.wire.id)).toMatchObject({ closed: true, blockers: {} });
    });

    it('stays open when the last revocation could not write (1b) because the case was held, and the IT Admin who is quicker than the hourly pass writes it on the route and the case closes', async () => {
      const { seats, wire } = await lockedLeaver([k1]);
      await h.revokeRights(wire.id, {}).expect(200);
      const task = await taskOf(wire.id, seats[0]);
      await h.claim(task).expect(200);

      await completeK1WhileCaseIsHeld(wire.id, task);

      // Every task is completed and nothing closed the case: (1b) is missing, and the pass that closes has nothing to close without it.
      expect(await wireOf(wire.id)).toMatchObject({ closed: false, mailboxLock: null, heldRights: 1 });
      expect(await closing().sweep()).toMatchObject({ failed: 0 });
      expect((await h.caseRow(wire.id)).closed_at).toBeNull();

      const done = h.dataOf<CaseWire>(await h.lockMailbox(wire.id, {}).expect(200));

      expect(done).toMatchObject({ closed: true, mailboxLock: { recordedBySystem: false } });
    }, 60_000);

    it('is closed by the hourly pass when the last revocation could not write (1b) because the case was held: the pass writes it from the checklist and closes (D-72)', async () => {
      const { seats, wire } = await lockedLeaver([k1]);
      await h.revokeRights(wire.id, {}).expect(200);
      const task = await taskOf(wire.id, seats[0]);
      await h.claim(task).expect(200);
      await completeK1WhileCaseIsHeld(wire.id, task);
      expect(await wireOf(wire.id)).toMatchObject({ closed: false, mailboxLock: null });

      const pass = await settlement().settle();

      expect(pass.failed).toBe(0);
      const closed = await wireOf(wire.id);
      expect(closed).toMatchObject({ closed: true, mailboxLock: { recordedBySystem: true } });
      expect(closed.closure).toMatchObject({ closedByAppUserId: null, closedBySystem: true });
      expect(await h.changeKinds(wire.id)).toEqual(expect.arrayContaining(['MAILBOX_LOCKED', 'CLOSED_BY_SYSTEM']));
    }, 60_000);

    it('does not close while a task failed, and a new task done for the same seat closes it', async () => {
      const { seats, wire } = await lockedLeaver([k2]);
      await h.revokeRights(wire.id, {}).expect(200);
      const failed = await taskOf(wire.id, seats[0]);
      await h.claim(failed).expect(200);
      await h.fail(failed, { reason: 'Cổng quản trị từ chối xóa tài khoản' }).expect(200);

      const written = h.dataOf<CaseWire>(await h.lockMailbox(wire.id, {}).expect(200));

      expect(written).toMatchObject({ closed: false, mailboxLock: { recordedBySystem: false } });
      expect(written.blockers).toEqual({ PERSONAL_RIGHTS_OPEN: 1 });
      expect(await closing().sweep()).toMatchObject({ closed: 0, failed: 0 });
      // The IT Admin closes the failed task and opens a new one for the seat; its completion is what the case waited for.
      await h.closeFailed(failed, { reason: 'Mở tác vụ mới' }).expect(200);
      const reopened = h.dataOf<CaseWire>(await h.revokeRights(wire.id, {}).expect(200));
      expect(reopened.revocations).toEqual({ created: 1, reasonAdded: 0 });
      expect(reopened.closed).toBe(false);
      await removeK2(await taskOf(wire.id, seats[0]));
      expect(await wireOf(wire.id)).toMatchObject({ closed: true, blockers: {} });
    });

    it('is closed by the hourly pass when the person is marked as left after (1a), (1b) and the revocations were done, and not before', async () => {
      const made = await leaver([k2]);
      const wire = await h.recordedCase(made.person);
      // The last working day passed two days ago: the block is in force and the person is not yet marked as left.
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
        [wire.id, h.day(-2), h.day(-1)],
      );
      await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
        made.person.employeeId,
        h.day(-1),
      ]);
      await h.lockAccount(wire.id, LOCK).expect(200);
      await h.revokeRights(wire.id, {}).expect(200);
      await removeK2(await taskOf(wire.id, made.seats[0]));
      const locked = h.dataOf<CaseWire>(await h.lockMailbox(wire.id, {}).expect(200));
      expect(locked).toMatchObject({ state: 'HANDING_OVER', closed: false });
      expect(await closing().sweep()).toMatchObject({ closed: 0 });

      await h.markLeft(wire.id).expect(200);
      expect(await wireOf(wire.id)).toMatchObject({ state: 'LEFT', closed: false, blockers: {} });
      // Nothing closes the case before the hourly pass of the block moment has done what the block does (audit A-1).
      expect(await closing().sweep()).toMatchObject({ closed: 0 });
      await h.blockPass();
      const pass = await closing().sweep();

      expect(pass).toMatchObject({ failed: 0 });
      expect(pass.closed).toBeGreaterThanOrEqual(1);
      expect(await wireOf(wire.id)).toMatchObject({ closed: true });
      expect(await closedBy(wire.id)).toEqual([true, null]);
    });

    it('has no route for an IT Admin to close a case any more', async () => {
      const { wire } = await lockedLeaver();

      const route = await request(h.server()).post(`/api/v1/offboarding-cases/${wire.id}/closure`).set(h.as(h.it1));

      expect(route.status).toBe(404);
    });
  });
});
