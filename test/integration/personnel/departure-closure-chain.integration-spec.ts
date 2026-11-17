import { MailboxLockSettlement } from '../../../src/modules/personnel/departure-closure/mailbox-lock-settlement.service';
import { BlockMomentSweeper } from '../../../src/modules/personnel/departure-deadline/block-moment.job';
import { DepartureClosureSweeper } from '../../../src/modules/personnel/departure-closure/departure-closure.job';
import { OffboardingHarness, type CaseWire, type RightWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';
import { k1Checklist } from '../../support/k1-checklist';

const h = new OffboardingHarness();
const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token thiết bị' };
const MAILBOX = { note: 'Đã khóa hẳn hộp thư, chuyển thư cho quản lý' };

/**
 * `MF-2` from the record of a departure to the closing of its case, in one chain (SPEC S1, S17, T-MF2G; the milestone of `MF2-G`): the Super
 * Admin records it, the hourly pass of the block moment announces it, the IT Admin blocks the account and opens the revocations, completes them
 * (the lock of the mailbox written by the system when the last K1 revocation ticks it, or by the IT Admin for a person with no K1), the Super
 * Admin marks the person as left, and the hourly pass of the closing closes the case. The two passes are the real sweepers of the application,
 * run once by hand; the days go by in the database (the last working day moves back), the way the other suites of the departure do.
 */
describe('a departure from the record to the closing, with the real sweepers (integration, real PostgreSQL)', () => {
  let des: Department;
  let k1: string;
  let k2: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-CHAIN');
    await h.setItAdminInCharge(des, { employeeId: h.it1.employeeId, account: h.it1 });
    k1 = await h.subscription(60, 'K1');
    k2 = await h.subscription(60, 'K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** One hourly pass of a sweeper of the application, as the timer runs it. */
  const hourlyPass = async (sweeper: BlockMomentSweeper | DepartureClosureSweeper): Promise<void> => {
    await (sweeper as unknown as { sweep: () => Promise<void> }).sweep();
  };
  const blockMoment = () => hourlyPass(h.ctx.app.get(BlockMomentSweeper, { strict: false }));
  const closing = () => hourlyPass(h.ctx.app.get(DepartureClosureSweeper, { strict: false }));

  const leaver = async (subscriptions: string[]): Promise<{ person: Person; seats: string[] }> => {
    const employeeCode = `E-CH-${(counter += 1)}`;
    const person = await h.worker(des, employeeCode);
    const seats: string[] = [];
    for (const subscriptionId of subscriptions) seats.push(await h.seatOf(person, { subscriptionId }, employeeCode));

    return { person, seats };
  };
  /** The last working day was two days ago: the block is in force from yesterday, as it would be after two days. */
  const timePasses = async (wire: CaseWire, person: Person): Promise<void> => {
    await h.ctx.sql.query(
      `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
      [wire.id, h.day(-2), h.day(-1)],
    );
    await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
      person.employeeId,
      h.day(-1),
    ]);
  };
  const wireOf = async (id: string) => h.dataOf<CaseWire>(await h.readCase(id).expect(200));
  const taskOf = async (id: string, seat: string): Promise<string> => {
    const rights = h.dataOf<{ items: RightWire[] }>(await h.rightsOf(id, '?pageSize=100').expect(200)).items;

    return rights.find((right) => right.assignmentId === seat)?.revocation?.taskId ?? '';
  };
  const blockNotices = async (caseId: string) =>
    (
      await h.ctx.sql.query<{ recipient: string; audience: string }>(
        `SELECT recipient_employee_id AS recipient, params ->> 'audience' AS audience
           FROM in_app_notifications WHERE code = 'DEPARTURE_ACCESS_BLOCKED' AND subject_id = $1 ORDER BY recipient_employee_id`,
        [caseId],
      )
    ).rows;
  const removeK2 = async (taskId: string): Promise<void> => {
    await h.claim(taskId).expect(200);
    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản' }).expect(200);
  };

  it('closes the case of a person with a K1 seat and a K2 seat: block, 1a, K2, K1 with the six steps (1b by the system), marked as left, closed by the system', async () => {
    const { person, seats } = await leaver([k1, k2]);
    const [k1Seat, k2Seat] = seats;
    const wire = await h.recordedCase(person);
    expect(wire).toMatchObject({ state: 'HANDING_OVER', accessBlocked: false, closed: false });

    // Before the block moment the pass announces nothing for the case.
    await blockMoment();
    expect(await h.changeKinds(wire.id)).toEqual(['RECORDED']);

    // The last working day passes: the block is in force and the pass announces it, once.
    await timePasses(wire, person);
    await blockMoment();
    await blockMoment();
    expect(await h.changeKinds(wire.id)).toEqual(['RECORDED', 'ACCESS_BLOCKED']);
    expect((await blockNotices(wire.id)).map((notice) => [notice.recipient, notice.audience])).toEqual(
      [
        [h.sa.employeeId, 'SUPER_ADMIN'],
        [h.it1.employeeId, 'IT_ADMIN'],
      ].sort(),
    );
    expect(await wireOf(wire.id)).toMatchObject({ state: 'HANDING_OVER', accessBlocked: true, closed: false });

    // The IT Admin blocks the company account (1a) and opens the revocation of both seats.
    await h.lockAccount(wire.id, LOCK).expect(200);
    const opened = h.dataOf<CaseWire>(await h.revokeRights(wire.id, {}).expect(200));
    expect(opened.revocations).toEqual({ created: 2, reasonAdded: 0 });
    const [k1Task, k2Task] = [await taskOf(wire.id, k1Seat), await taskOf(wire.id, k2Seat)];

    // The K2 seat first: the case still waits for the K1 seat and for (1b).
    await removeK2(k2Task);
    expect(await wireOf(wire.id)).toMatchObject({
      closed: false,
      mailboxLock: null,
      blockers: {},
    });

    // The K1 seat, with the six steps of a departure in order: it was the last, so the lock of the mailbox is written by the system.
    await h.claim(k1Task).expect(200);
    await h
      .revoked(k1Task, {
        completion: 'RENEWAL_CANCELLED',
        evidence: 'đã hủy gia hạn',
        paidThroughOn: h.day(36),
        accessState: 'UNTIL_PAID_END',
        k1Checklist: k1Checklist('DEPARTURE'),
      })
      .expect(200);
    const written = await wireOf(wire.id);
    expect(written).toMatchObject({
      state: 'HANDING_OVER',
      closed: false,
      mailboxLock: { recordedByAppUserId: null, recordedBySystem: true },
    });

    // The Super Admin marks the person as left: every condition holds now, and the pass that closes does it.
    await h.markLeft(wire.id).expect(200);
    expect(await wireOf(wire.id)).toMatchObject({ state: 'LEFT', closed: false, blockers: {} });
    await closing();

    const closed = await wireOf(wire.id);
    expect(closed).toMatchObject({ state: 'LEFT', closed: true, blockers: {}, heldRights: 1 });
    expect(closed.closure).toMatchObject({ closedByAppUserId: null, closedBySystem: true });
    expect(await h.changeKinds(wire.id)).toEqual([
      'RECORDED',
      'ACCESS_BLOCKED',
      'ACCOUNT_LOCK_RECORDED',
      'REVOCATIONS_OPENED',
      'MAILBOX_LOCKED',
      'MARKED_LEFT',
      'CLOSED_BY_SYSTEM',
    ]);
    expect((await h.auditEventsOf('OFFBOARDING_CASE.CLOSED', wire.id)).map((event) => event.actor_kind)).toEqual([
      'SYSTEM',
    ]);
    // A pass that comes again finds nothing to do.
    await closing();
    expect(await h.auditEventsOf('OFFBOARDING_CASE.CLOSED', wire.id)).toHaveLength(1);
  }, 240_000);

  it('closes the case of a person with no K1 seat: block, 1a, 1b written by the IT Admin while blocked, revocations done, marked as left, closed by the system', async () => {
    const { person, seats } = await leaver([k2]);
    const wire = await h.recordedCase(person);
    await timePasses(wire, person);
    await blockMoment();
    expect(await h.changeKinds(wire.id)).toEqual(['RECORDED', 'ACCESS_BLOCKED']);

    // Right after (1a) a person with no K1 locks the mailbox: nothing waits for a K1 revocation.
    await h.lockAccount(wire.id, LOCK).expect(200);
    const locked = h.dataOf<CaseWire>(await h.lockMailbox(wire.id, MAILBOX).expect(200));
    expect(locked).toMatchObject({
      state: 'HANDING_OVER',
      closed: false,
      mailboxLock: { recordedByAppUserId: h.it1.appUserId, recordedBySystem: false, note: MAILBOX.note },
    });
    await h.revokeRights(wire.id, {}).expect(200);
    await removeK2(await taskOf(wire.id, seats[0]));
    // Everything the IT Admin does is done, but the person has not been marked as left: the case stays open.
    expect(await wireOf(wire.id)).toMatchObject({ state: 'HANDING_OVER', closed: false, heldRights: 0 });
    await closing();
    expect((await h.caseRow(wire.id)).closed_at).toBeNull();

    await h.markLeft(wire.id).expect(200);
    await closing();

    const closed = await wireOf(wire.id);
    expect(closed).toMatchObject({ state: 'LEFT', closed: true, blockers: {} });
    expect(closed.closure).toMatchObject({ closedByAppUserId: null, closedBySystem: true });
    expect(await h.changeKinds(wire.id)).toEqual([
      'RECORDED',
      'ACCESS_BLOCKED',
      'ACCOUNT_LOCK_RECORDED',
      'MAILBOX_LOCKED',
      'REVOCATIONS_OPENED',
      'MARKED_LEFT',
      'CLOSED_BY_SYSTEM',
    ]);
  }, 240_000);

  it('keeps the case open through the whole chain while one thing is missing, whichever it is, and closes it when the last one is done', async () => {
    const { person, seats } = await leaver([k2]);
    const wire = await h.recordedCase(person);
    await timePasses(wire, person);
    await blockMoment();
    await h.markLeft(wire.id).expect(200);
    await h.lockAccount(wire.id, LOCK).expect(200);
    await h.revokeRights(wire.id, {}).expect(200);
    const task = await taskOf(wire.id, seats[0]);

    // Nothing but (1a) is done: the pass that closes finds nothing to close.
    await closing();
    expect(await wireOf(wire.id)).toMatchObject({
      closed: false,
      blockers: { MAILBOX_LOCK_NOT_RECORDED: 1, PERSONAL_RIGHTS_OPEN: 1 },
    });
    // (1b) is written but a seat has no completed task.
    await h.lockMailbox(wire.id, {}).expect(200);
    await closing();
    expect(await wireOf(wire.id)).toMatchObject({ closed: false, blockers: { PERSONAL_RIGHTS_OPEN: 1 } });
    // The last revocation is completed: the closing needs no pass and no click.
    await removeK2(task);
    expect(await wireOf(wire.id)).toMatchObject({ closed: true, blockers: {} });
  }, 240_000);
  it('lets the Super Admin cancel a handover that is blocked after (1a) and (1b) were written: both stay on the cancelled case, which nothing closes (D-73)', async () => {
    const { person } = await leaver([k2]);
    const wire = await h.recordedCase(person);
    await timePasses(wire, person);
    await blockMoment();
    await h.lockAccount(wire.id, LOCK).expect(200);
    await h.lockMailbox(wire.id, MAILBOX).expect(200);

    const cancelled = h.dataOf<CaseWire>(await h.cancelCase(wire.id, { reason: 'Người ở lại làm việc' }).expect(200));

    // The locks were done outside the system and it does not undo them: they stay on the case, and the case is not closed.
    expect(cancelled).toMatchObject({
      state: 'CANCELLED',
      closed: false,
      blockers: {},
      accountLock: { note: LOCK.note },
      mailboxLock: { note: MAILBOX.note, recordedBySystem: false },
    });
    const kinds = await h.changeKinds(wire.id);
    await h.ctx.app.get(MailboxLockSettlement, { strict: false }).settle();
    await closing();
    expect(await h.changeKinds(wire.id)).toEqual(kinds);
    expect(kinds.at(-1)).toBe('CANCELLED');
    expect((await h.caseRow(wire.id)).closed_at).toBeNull();
    // (1b) is written once: asking again answers as it was, whatever the case has become.
    const again = await h.lockMailbox(wire.id, {});
    expect(again.status).toBe(200);
    expect(h.dataOf<CaseWire>(again).mailboxLock).toEqual(cancelled.mailboxLock);
  }, 240_000);
});
