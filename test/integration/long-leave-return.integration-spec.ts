import { LeaveHarness, type LeaveChangeWire, type LeaveWire } from '../support/leave-harness';
import type { Department, Person } from '../support/request-harness';

const h = new LeaveHarness();

/**
 * US-03-03 AC-4, AC-7, AC-8: the day of return moves on a new basis, the person comes back (on the approved day without a new
 * document, on another day with one), and a late return is only told, once for each approved day. On real PostgreSQL.
 */
describe('the return from a long leave (integration, real PostgreSQL)', () => {
  let des: Department;
  let sequence = 0;
  const code = (prefix: string) => `${prefix}${(sequence += 1)}`;
  /** A person on leave since `startedOn`, due back on `approvedReturnOn`. */
  const onLeave = async (
    startedOn: string,
    approvedReturnOn: string,
  ): Promise<{ person: Person; leave: LeaveWire }> => {
    const person = await h.worker(des, code('E'));
    const leave = await h.started({ employeeId: person.employeeId, startedOn, approvedReturnOn, grounds: h.approval });

    return { person, leave };
  };

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('L-RET');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('a return on the approved day (AC-7)', () => {
    it('needs no new document: the person works again, and the Audit Trail keeps who confirmed and when', async () => {
      const { person, leave } = await onLeave(h.day(-90), h.today());

      const response = await h.confirmReturn(leave.id, { returnedOn: h.today() });

      expect(response.status).toBe(200);
      expect(h.dataOf<LeaveWire>(response)).toMatchObject({ status: 'ENDED', endKind: 'RETURNED', endedOn: h.today() });
      expect(await h.workState(person.employeeId)).toBe('WORKING');
      const [event] = await h.auditEventsOf('LONG_LEAVE.RETURNED', leave.id);
      expect(event).toMatchObject({
        actor_kind: 'USER',
        after: { onSchedule: true, workState: 'WORKING', grounds: null },
      });
      expect(event.actor_app_user_id).toBe(h.it1.appUserId);
      const log = h.dataOf<{ items: LeaveChangeWire[] }>(await h.leaveChanges(leave.id)).items;
      expect(log.map((change) => [change.kind, change.onSchedule, change.grounds])).toEqual([
        ['STARTED', null, h.approval],
        ['RETURNED', true, null],
      ]);
    });

    it('ignores a basis given on the day, wrong or not', async () => {
      const { leave } = await onLeave(h.day(-90), h.today());

      const response = await h.confirmReturn(leave.id, {
        returnedOn: h.today(),
        grounds: { reference: 'BM09-2026-000001' },
      });

      expect(response.status).toBe(200);
      expect(h.dataOf<LeaveWire>(response).status).toBe('ENDED');
    });
  });

  describe('a return on another day (AC-8)', () => {
    it.each([
      ['earlier than approved', () => [h.day(-30), h.day(30), h.today()]],
      ['later than approved', () => [h.day(-60), h.day(-3), h.today()]],
    ])('is refused without a basis and the person stays on leave, %s', async (_name, days) => {
      const [startedOn, approvedReturnOn, returnedOn] = days();
      const { person, leave } = await onLeave(startedOn, approvedReturnOn);

      const refused = await h.confirmReturn(leave.id, { returnedOn });
      const notice = await h.confirmReturn(leave.id, {
        returnedOn,
        grounds: { ...h.extension, reference: 'BM09-2026-000777' },
      });

      expect([refused.status, h.codeOf(refused)]).toEqual([422, 'LONG_LEAVE.GROUNDS_REQUIRED']);
      expect([notice.status, h.codeOf(notice)]).toEqual([422, 'LONG_LEAVE.GROUNDS_IS_NOTICE']);
      expect(await h.workState(person.employeeId)).toBe('ON_LONG_LEAVE');
      expect(h.dataOf<LeaveWire>(await h.readLeave(leave.id)).status).toBe('ACTIVE');

      const accepted = await h.confirmReturn(leave.id, { returnedOn, grounds: h.extension });

      expect(accepted.status).toBe(200);
      expect(await h.workState(person.employeeId)).toBe('WORKING');
      const log = h.dataOf<{ items: LeaveChangeWire[] }>(await h.leaveChanges(leave.id)).items;
      expect(log[1]).toMatchObject({ kind: 'RETURNED', onSchedule: false, returnedOn, grounds: h.extension });
    });

    it('refuses a day before the leave began, a day to come, and a leave that has ended', async () => {
      const { leave } = await onLeave(h.day(-30), h.day(30));

      const before = await h.confirmReturn(leave.id, { returnedOn: h.day(-31), grounds: h.extension });
      const future = await h.confirmReturn(leave.id, { returnedOn: h.day(1), grounds: h.extension });
      await h.confirmReturn(leave.id, { returnedOn: h.today(), grounds: h.extension }).expect(200);
      const again = await h.confirmReturn(leave.id, { returnedOn: h.today(), grounds: h.extension });
      const extend = await h.changeReturnDate(leave.id, { newApprovedReturnOn: h.day(40), grounds: h.extension });

      expect([before.status, h.codeOf(before)]).toEqual([422, 'LONG_LEAVE.RETURN_DATE_INVALID']);
      expect([future.status, h.codeOf(future)]).toEqual([422, 'LONG_LEAVE.RETURN_DATE_INVALID']);
      expect([again.status, h.codeOf(again)]).toEqual([409, 'LONG_LEAVE.NOT_ACTIVE']);
      expect([extend.status, h.codeOf(extend)]).toEqual([409, 'LONG_LEAVE.NOT_ACTIVE']);
    });

    it('lets a person who came back go on leave again', async () => {
      const { person, leave } = await onLeave(h.day(-30), h.today());
      await h.confirmReturn(leave.id, { returnedOn: h.today() }).expect(200);

      const second = await h.started({
        employeeId: person.employeeId,
        startedOn: h.today(),
        approvedReturnOn: h.day(20),
        grounds: h.approval,
      });

      expect(second.id).not.toBe(leave.id);
      expect((await h.leavesOf(person.employeeId)).map((row) => row.status)).toEqual(['ENDED', 'ACTIVE']);
    });
  });

  describe('a new day of return (AC-8)', () => {
    it('needs a new basis; with one the day and the basis are the new ones and the old ones stay in the log', async () => {
      const { person, leave } = await onLeave(h.day(-60), h.day(10));

      const without = await h.changeReturnDate(leave.id, { newApprovedReturnOn: h.day(40) });
      const response = await h.changeReturnDate(leave.id, { newApprovedReturnOn: h.day(40), grounds: h.extension });

      expect([without.status, h.codeOf(without)]).toEqual([422, 'LONG_LEAVE.GROUNDS_REQUIRED']);
      expect(response.status).toBe(200);
      expect(h.dataOf<LeaveWire>(response)).toMatchObject({
        status: 'ACTIVE',
        approvedReturnOn: h.day(40),
        grounds: h.extension,
      });
      expect(await h.workState(person.employeeId)).toBe('ON_LONG_LEAVE');
      const log = h.dataOf<{ items: LeaveChangeWire[] }>(await h.leaveChanges(leave.id)).items;
      expect(log.map((change) => [change.kind, change.oldReturnOn, change.newReturnOn])).toEqual([
        ['STARTED', null, h.day(10)],
        ['RETURN_DATE_CHANGED', h.day(10), h.day(40)],
      ]);
      expect(log[1].grounds).toEqual(h.extension);
      const [event] = await h.auditEventsOf('LONG_LEAVE.RETURN_DATE_CHANGED', leave.id);
      expect(event).toMatchObject({
        before: { approvedReturnOn: h.day(10), grounds: h.approval },
        after: { approvedReturnOn: h.day(40), grounds: h.extension },
      });
    });

    it.each([
      ['the same day', () => ({ newApprovedReturnOn: h.day(10) }), 'LONG_LEAVE.RETURN_DATE_INVALID'],
      ['a day not after the start', () => ({ newApprovedReturnOn: h.day(-60) }), 'LONG_LEAVE.RETURN_DATE_INVALID'],
      ['a day before today', () => ({ newApprovedReturnOn: h.day(-1) }), 'LONG_LEAVE.RETURN_DATE_IN_PAST'],
    ])('refuses %s and keeps the day', async (_name, extra, expected) => {
      const { leave } = await onLeave(h.day(-60), h.day(10));

      const response = await h.changeReturnDate(leave.id, { grounds: h.extension, ...extra() });

      expect([response.status, h.codeOf(response)]).toEqual([422, expected]);
      expect(h.dataOf<LeaveWire>(await h.readLeave(leave.id)).approvedReturnOn).toBe(h.day(10));
    });

    it('may bring the day forward as well as put it back', async () => {
      const { leave } = await onLeave(h.day(-60), h.day(30));

      const response = await h.changeReturnDate(leave.id, { newApprovedReturnOn: h.today(), grounds: h.extension });

      expect(h.dataOf<LeaveWire>(response).approvedReturnOn).toBe(h.today());
    });
  });

  describe('a late return is only told (AC-4)', () => {
    it('marks the leave overdue, tells the IT Admin once, never changes the state, and tells again after a new day passes', async () => {
      const { person, leave } = await onLeave(h.day(-60), h.day(-2));
      const overdue = () => h.listLeaves('?overdueReturn=true&pageSize=100');
      const ids = async () => h.dataOf<{ items: LeaveWire[] }>(await overdue()).items.map((item) => item.id);

      expect(h.dataOf<LeaveWire>(await h.readLeave(leave.id)).overdueReturn).toBe(true);
      expect(await ids()).toContain(leave.id);
      const first = await h.noticeOverdueAt();
      const second = await h.noticeOverdueAt();

      expect(first).toBeGreaterThanOrEqual(1);
      expect(second).toBe(0);
      const events = await h.auditEventsOf('LONG_LEAVE.RETURN_OVERDUE', leave.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actor_kind: 'SYSTEM',
        after: { employeeId: person.employeeId, approvedReturnOn: h.day(-2), overdueDays: 2 },
      });
      expect(await h.workState(person.employeeId)).toBe('ON_LONG_LEAVE');
      expect(h.dataOf<LeaveWire>(await h.readLeave(leave.id)).status).toBe('ACTIVE');

      // The day is put back; the person is no longer overdue, and not told.
      await h.changeReturnDate(leave.id, { newApprovedReturnOn: h.day(10), grounds: h.extension }).expect(200);
      expect(h.dataOf<LeaveWire>(await h.readLeave(leave.id)).overdueReturn).toBe(false);
      expect(await ids()).not.toContain(leave.id);
      await h.noticeOverdueAt(h.day(5));
      expect(await h.auditEventsOf('LONG_LEAVE.RETURN_OVERDUE', leave.id)).toHaveLength(1);

      // Eleven days on the new day has passed too: told again, once.
      await h.noticeOverdueAt(h.day(11));
      await h.noticeOverdueAt(h.day(12));
      expect(await h.auditEventsOf('LONG_LEAVE.RETURN_OVERDUE', leave.id)).toHaveLength(2);
      expect(await h.workState(person.employeeId)).toBe('ON_LONG_LEAVE');
    });

    it('does not tell a person who is back, nor one whose day is today', async () => {
      const back = await onLeave(h.day(-60), h.day(-2));
      await h.confirmReturn(back.leave.id, { returnedOn: h.today(), grounds: h.extension }).expect(200);
      const today = await onLeave(h.day(-60), h.today());

      await h.noticeOverdueAt();

      expect(await h.auditEventsOf('LONG_LEAVE.RETURN_OVERDUE', back.leave.id)).toEqual([]);
      expect(await h.auditEventsOf('LONG_LEAVE.RETURN_OVERDUE', today.leave.id)).toEqual([]);
      expect(h.dataOf<LeaveWire>(await h.readLeave(today.leave.id)).overdueReturn).toBe(false);
    });
  });
});
