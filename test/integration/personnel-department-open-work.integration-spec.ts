import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { NoticeHarness } from '../support/notice-harness';
import type { Department, Person } from '../support/request-harness';

const h = new NoticeHarness();

interface Use {
  items: { kind: string; id: string; label: string | null }[];
  total: number;
}

/**
 * `g0-g6-final-business-baseline-remediation`, F15 (QĐ-90e), the personnel part of the group OPEN_WORK of what keeps a department in
 * use: a transfer that still waits and leaves or enters it, a departure being handed over for a person of it, a notice of a head not
 * yet verified that it sent or that names it as the target. What is over does not count, nor does a long leave of a member. Asked
 * through the organization facade, as the retiring of a department asks it.
 */
describe('what the personnel context keeps a department in use for (integration, real PostgreSQL)', () => {
  let fin: Department;
  let sequence = 0;

  beforeAll(async () => {
    await h.start();
    fin = await h.departmentWithUnit('W-FIN');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A new department with a head and a person, so one test never sees the facts of another. */
  const world = async () => {
    const n = (sequence += 1);
    const department = await h.departmentWithUnit(`W-D${n}`);
    const head = await h.head(department, `W-H${n}`);
    const member = await h.worker(department, `W-M${n}`);

    return { department, head, member };
  };
  const openWork = async (departmentId: string, limit = 50): Promise<Use> =>
    (await h.organizationService().getDepartmentUse(departmentId, h.today(), limit)).openWork;
  const move = (member: Person, to: Department, effectiveOn = h.day(20)) =>
    h.recorded({ employeeId: member.employeeId, toDepartmentId: to.id, effectiveOn, grounds: h.grounds });
  const depart = (member: Person) => h.recordedCase(member, { lastWorkingDay: h.day(10) });
  const leaveNotice = (member: Person, head: Person, extra: object = {}) =>
    h.sentNotice({ employeeId: member.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5), ...extra }, head.account);

  it('is nothing for a department with people and no event that waits: no items and a total of zero', async () => {
    const { department } = await world();

    expect(await openWork(department.id)).toEqual({ items: [], total: 0 });
  });

  describe('a transfer that waits', () => {
    it('keeps both departments in use, the one it leaves and the one it enters, as a transfer with no label', async () => {
      const { department, member } = await world();

      const transfer = await move(member, fin);

      expect(await openWork(department.id)).toEqual({
        items: [{ kind: 'DEPARTMENT_TRANSFER', id: transfer.id, label: null }],
        total: 1,
      });
      expect((await openWork(fin.id)).items).toContainEqual({
        kind: 'DEPARTMENT_TRANSFER',
        id: transfer.id,
        label: null,
      });
    });

    it('stops keeping them in use once it was cancelled, and once it has taken effect', async () => {
      const cancelled = await world();
      const effective = await world();
      const toCancel = await move(cancelled.member, fin);
      await h.cancelTransfer(toCancel.id, { reason: 'No longer needed', grounds: h.grounds }).expect(200);
      await move(effective.member, fin, h.today());
      await h.sweepAt();

      expect(await openWork(cancelled.department.id)).toEqual({ items: [], total: 0 });
      expect(await openWork(effective.department.id)).toEqual({ items: [], total: 0 });
    });
  });

  describe('a departure being handed over', () => {
    it('keeps the department of the person in use, and not the department they never belonged to', async () => {
      const { department, member } = await world();
      const other = await world();

      const wire = await depart(member);

      expect(await openWork(department.id)).toEqual({
        items: [{ kind: 'OFFBOARDING_CASE', id: wire.id, label: null }],
        total: 1,
      });
      expect(await openWork(other.department.id)).toEqual({ items: [], total: 0 });
    });

    it('stops keeping it in use once the person has left, and once the handover was cancelled', async () => {
      const left = await world();
      const cancelled = await world();
      const leaving = await depart(left.member);
      const staying = await depart(cancelled.member);
      await h.markLeft(leaving.id).expect(200);
      await h.cancelCase(staying.id, { reason: 'The person stays' }).expect(200);

      expect(await openWork(left.department.id)).toEqual({ items: [], total: 0 });
      expect(await openWork(cancelled.department.id)).toEqual({ items: [], total: 0 });
    });
  });

  describe('a notice of a head that is not yet verified (BM-09)', () => {
    it('keeps the department that sent it in use, labelled with its code, and the department it names as the target', async () => {
      const { department, head, member } = await world();
      const notice = await h.sentNotice(
        {
          employeeId: member.employeeId,
          kind: 'DEPARTMENT_TRANSFER_OUT',
          proposedOn: h.day(7),
          targetDepartmentId: fin.id,
        },
        head.account,
      );

      expect(await openWork(department.id)).toEqual({
        items: [{ kind: 'PERSONNEL_NOTICE', id: notice.id, label: notice.code }],
        total: 1,
      });
      expect((await openWork(fin.id)).items).toContainEqual({
        kind: 'PERSONNEL_NOTICE',
        id: notice.id,
        label: notice.code,
      });
      expect(notice.code).toMatch(/^BM09-\d{4}-\d{6}$/);
    });

    it('stops keeping it in use once it was withdrawn or rejected: it is handled', async () => {
      const withdrawn = await world();
      const rejected = await world();
      const first = await leaveNotice(withdrawn.member, withdrawn.head);
      const second = await leaveNotice(rejected.member, rejected.head);
      await h.withdrawNotice(first.id, withdrawn.head.account).expect(200);
      await h.rejectNotice(second.id, { reason: 'Duplicate event' }).expect(200);

      expect(await openWork(withdrawn.department.id)).toEqual({ items: [], total: 0 });
      expect(await openWork(rejected.department.id)).toEqual({ items: [], total: 0 });
    });

    it('stops keeping it in use once it was recorded as the event it announces', async () => {
      const { department, head, member } = await world();
      const notice = await leaveNotice(member, head);

      await h.recordNotice(notice.id, h.recording({ lastWorkingDay: h.day(12) })).expect(201);

      const use = await openWork(department.id);
      expect(use.items.map((item) => item.kind)).toEqual(['OFFBOARDING_CASE']);
      expect(use.total).toBe(1);
    });
  });

  describe('what is not told', () => {
    it('does not tell a long leave of a member: the members already keep the department in use', async () => {
      const { department, member } = await world();

      await h
        .startLongLeave({
          employeeId: member.employeeId,
          startedOn: h.day(-1),
          approvedReturnOn: h.day(40),
          grounds: { type: 'LEAVE_APPROVAL', reference: 'DN-05/2026', issuer: 'HR Department', issuedOn: '2026-05-25' },
        })
        .expect(201);

      expect(await openWork(department.id)).toEqual({ items: [], total: 0 });
    });
  });

  describe('a department with several things that wait', () => {
    it('gives the first `limit` ordered by kind and id with the exact total, and the same total for any limit', async () => {
      const { department, head, member } = await world();
      const second = await h.worker(department, `W-M${(sequence += 1)}`);
      const third = await h.worker(department, `W-M${(sequence += 1)}`);
      const fourth = await h.worker(department, `W-M${(sequence += 1)}`);
      const one = await move(member, fin);
      const two = await move(second, fin);
      const wire = await depart(third);
      const notice = await h.sentNotice(
        { employeeId: fourth.employeeId, kind: 'DEPARTURE', proposedOn: h.day(6) },
        head.account,
      );
      const transfers = [one.id, two.id].sort();

      const all = await openWork(department.id, 10);
      const few = await openWork(department.id, 2);
      const none = await openWork(department.id, 1);

      expect(all.total).toBe(4);
      expect(all.items).toEqual([
        { kind: 'DEPARTMENT_TRANSFER', id: transfers[0], label: null },
        { kind: 'DEPARTMENT_TRANSFER', id: transfers[1], label: null },
        { kind: 'OFFBOARDING_CASE', id: wire.id, label: null },
        { kind: 'PERSONNEL_NOTICE', id: notice.id, label: notice.code },
      ]);
      expect(few).toEqual({ items: all.items.slice(0, 2), total: 4 });
      expect(none).toEqual({ items: all.items.slice(0, 1), total: 4 });
    });

    it('reads inside the transaction of the caller when it gives one', async () => {
      const { department, member } = await world();
      await move(member, fin);

      const inside = await h.ctx.app
        .get(TransactionRunner, { strict: false })
        .run((tx) => h.organizationService().getDepartmentUse(department.id, h.today(), 10, tx));

      expect(inside.openWork.total).toBe(1);
    });
  });
});
