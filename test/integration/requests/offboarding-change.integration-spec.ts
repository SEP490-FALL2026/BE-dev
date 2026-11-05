import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();

/**
 * US-03-04 AC-14, AC-15, AC-19, AC-22, AC-26: moving the last working day of a handover and cancelling it, over HTTP, on real
 * PostgreSQL. The periods the record wrote go back exactly, the confirmation of the handover follows the day, and nothing is revoked.
 */
describe('moving and cancelling a handover (integration, real PostgreSQL)', () => {
  let des: Department;
  let h1: Person;
  let counter = 0;
  const code = (prefix = 'E') => `${prefix}-OC-${(counter += 1)}`;
  let subscription: string;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    h1 = await h.worker(des, 'H1-OC');
    await h.makeHead(des, h1);
    subscription = await h.subscription(40, 'K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const leaver = async (department = des) => {
    const employeeCode = code();
    const person = await h.worker(department, employeeCode);
    const seat = await h.seatOf(person, { subscriptionId: subscription }, employeeCode);

    return { person, seat };
  };

  describe('moving the last working day (AC-14)', () => {
    it('moves the placement and the day the confirmation is due, and keeps the reason', async () => {
      const { person, seat } = await leaver();
      const wire = await h.recordedCase(person);

      const moved = h.dataOf<CaseWire>(
        await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Bàn giao kéo dài' }).expect(200),
      );

      expect(moved).toMatchObject({
        lastWorkingDay: h.day(20),
        departureEffectiveOn: h.day(21),
        handoverDueOn: h.dueBefore(h.day(20)),
      });
      const placements = await h.placements(person.employeeId);
      expect(placements[placements.length - 1].valid_to).toBe(h.day(21));
      expect((await h.dutyRows(seat))[0].due_on).toBe(h.dueBefore(h.day(20)));
      expect(await h.changeKinds(wire.id)).toEqual(['RECORDED', 'LAST_DAY_CHANGED']);
      const log = h.dataOf<{ items: { kind: string; oldLastWorkingDay: string | null; reason: string | null }[] }>(
        await h.caseChanges(wire.id).expect(200),
      ).items;
      expect(log[1]).toMatchObject({
        kind: 'LAST_DAY_CHANGED',
        oldLastWorkingDay: h.day(10),
        reason: 'Bàn giao kéo dài',
      });
      const [event] = await h.auditEventsOf('OFFBOARDING_CASE.LAST_DAY_CHANGED', wire.id);
      expect(event.after).toMatchObject({ lastWorkingDay: h.day(20), reason: 'Bàn giao kéo dài' });
    });

    it('refuses no reason, a day in the past and the same day, and keeps the old day', async () => {
      const { person } = await leaver();
      const wire = await h.recordedCase(person);

      const responses = [
        await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20) }),
        await h.changeLastDay(wire.id, { lastWorkingDay: h.day(-1), reason: 'Sai ngày' }),
        await h.changeLastDay(wire.id, { lastWorkingDay: h.day(10), reason: 'Không đổi' }),
      ];

      expect(responses.map((response) => [response.status, h.codeOf(response)])).toEqual([
        [422, 'VALIDATION_ERROR'],
        [422, 'OFFBOARDING_CASE.LAST_WORKING_DAY_INVALID'],
        [422, 'OFFBOARDING_CASE.NO_CHANGE'],
      ]);
      expect((await h.caseRow(wire.id)).last_working_day).toBe(h.day(10));
      expect(await h.changeKinds(wire.id)).toEqual(['RECORDED']);
    });

    it('is refused once today is past the last working day, and once the person has left', async () => {
      const { person } = await leaver();
      const passed = await h.recordedCase(person);
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
        [passed.id, h.day(-2), h.day(-1)],
      );

      const late = await h.changeLastDay(passed.id, { lastWorkingDay: h.day(5), reason: 'Muộn' });
      expect([late.status, h.codeOf(late)]).toEqual([409, 'OFFBOARDING_CASE.LAST_DAY_ALREADY_PASSED']);
      // A handover past its last working day is listed for the IT Admin, and still takes nothing away (AC-10).
      const listed = h.dataOf<{ items: CaseWire[] }>(
        await h.listCases('?state=HANDING_OVER&pastLastDay=true&pageSize=100').expect(200),
      ).items;
      expect(listed.map((row) => [row.id, row.pastLastDay])).toContainEqual([passed.id, true]);

      const other = await leaver();
      const left = await h.recordedCase(other.person);
      await h.leaveOnLastDay(left.id).expect(200);
      const response = await h.changeLastDay(left.id, { lastWorkingDay: h.day(20), reason: 'Đã nghỉ' });
      expect([response.status, h.codeOf(response)]).toEqual([409, 'OFFBOARDING_CASE.CASE_LEFT']);
    });
  });

  describe('the head of the department follows the day (AC-22)', () => {
    const headedDepartment = async () => {
      const department = await h.departmentWithUnit(code('P'));
      const head = await h.worker(department, code('E'));
      await h.makeHead(department, head);
      const next = await h.worker(department, code('H'), ['MANAGER']);
      const other = await h.worker(department, code('H'), ['MANAGER']);

      return { department, head, next, other };
    };

    it('moves the handover of the head to the day after the new last working day, and can change who follows', async () => {
      const { department, head, next, other } = await headedDepartment();
      const wire = await h.recordedCase(head, { successor: { kind: 'EMPLOYEE', employeeId: next.employeeId } });

      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Dời ngày' }).expect(200);
      expect(await h.headPeriods(department.id)).toEqual([
        expect.objectContaining({ employee_id: head.employeeId, valid_to: h.day(21) }),
        expect.objectContaining({ employee_id: next.employeeId, valid_from: h.day(21), valid_to: null }),
      ]);

      await h
        .changeLastDay(wire.id, {
          lastWorkingDay: h.day(22),
          reason: 'Đổi người kế nhiệm',
          successor: { kind: 'EMPLOYEE', employeeId: other.employeeId },
        })
        .expect(200);
      expect(await h.headPeriods(department.id)).toEqual([
        expect.objectContaining({ employee_id: head.employeeId, valid_to: h.day(23) }),
        expect.objectContaining({ employee_id: other.employeeId, valid_from: h.day(23), valid_to: null }),
      ]);
    });

    it('refuses a new successor without MANAGER when the day changes, and saves nothing (US-03-04 AC-8)', async () => {
      const { department, head, next } = await headedDepartment();
      const withoutRole = await h.worker(department, code('N'));
      const wire = await h.recordedCase(head, { successor: { kind: 'EMPLOYEE', employeeId: next.employeeId } });
      const periods = await h.headPeriods(department.id);

      const response = await h.changeLastDay(wire.id, {
        lastWorkingDay: h.day(22),
        reason: 'Đổi người kế nhiệm',
        successor: { kind: 'EMPLOYEE', employeeId: withoutRole.employeeId },
      });

      expect([response.status, h.codeOf(response)]).toEqual([422, 'OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE']);
      expect(h.detailsOf(response)).toEqual({ reason: 'MANAGER_ROLE_REQUIRED' });
      expect(await h.headPeriods(department.id)).toEqual(periods);
    });

    it('refuses the whole command when the successor cannot take the department on the new day, and saves nothing', async () => {
      const { department, head, next } = await headedDepartment();
      const wire = await h.recordedCase(head, { successor: { kind: 'EMPLOYEE', employeeId: next.employeeId } });
      const elsewhere = await h.departmentWithUnit(code('P'));
      const outsider = await h.worker(elsewhere, code('E'));
      const before = await h.headPeriods(department.id);

      const response = await h.changeLastDay(wire.id, {
        lastWorkingDay: h.day(20),
        reason: 'Đổi người',
        successor: { kind: 'EMPLOYEE', employeeId: outsider.employeeId },
      });

      expect([response.status, h.codeOf(response)]).toEqual([422, 'OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE']);
      expect(await h.headPeriods(department.id)).toEqual(before);
      expect((await h.caseRow(wire.id)).last_working_day).toBe(h.day(10));
      const placements = await h.placements(head.employeeId);
      expect(placements[placements.length - 1].valid_to).toBe(h.day(11));
    });
  });

  describe('cancelling (AC-15, AC-19, AC-26)', () => {
    it('gives the person back the department, the confirmations are cancelled, and no task was ever made', async () => {
      const { person, seat } = await leaver();
      const wire = await h.recordedCase(person);
      const tasks = await h.taskCount();

      const cancelled = h.dataOf<CaseWire>(await h.cancelCase(wire.id, { reason: 'Rút đơn nghỉ việc' }).expect(200));

      expect(cancelled).toMatchObject({
        state: 'CANCELLED',
        cancellation: { reason: 'Rút đơn nghỉ việc' },
        checklist: null,
      });
      expect(await h.workState(person.employeeId)).toBe('ACTIVE/WORKING');
      const placements = await h.placements(person.employeeId);
      expect(placements[placements.length - 1].valid_to).toBeNull();
      expect((await h.dutyRows(seat))[0]).toMatchObject({ cancel_reason: 'Rút đơn nghỉ việc' });
      expect(await h.taskCount()).toBe(tasks);
      expect(await h.changeKinds(wire.id)).toEqual(['RECORDED', 'CANCELLED']);
      // The person can be recorded again.
      expect((await h.recordedCase(person)).state).toBe('HANDING_OVER');
    });

    it('puts the head of the department back, and refuses no reason and a person who has left', async () => {
      const department = await h.departmentWithUnit(code('P'));
      const head = await h.worker(department, code('E'));
      await h.makeHead(department, head);
      const next = await h.worker(department, code('H'), ['MANAGER']);
      const wire = await h.recordedCase(head, { successor: { kind: 'EMPLOYEE', employeeId: next.employeeId } });

      const none = await h.cancelCase(wire.id, {});
      expect([none.status, h.codeOf(none)]).toEqual([422, 'VALIDATION_ERROR']);
      await h.cancelCase(wire.id, { reason: 'Ở lại' }).expect(200);

      expect(await h.headPeriods(department.id)).toEqual([
        expect.objectContaining({ employee_id: head.employeeId, valid_to: null }),
      ]);
      const left = await h.recordedCase((await leaver()).person);
      await h.leaveOnLastDay(left.id).expect(200);
      const response = await h.cancelCase(left.id, { reason: 'Muộn' });
      expect([response.status, h.codeOf(response)]).toEqual([409, 'OFFBOARDING_CASE.CASE_LEFT']);
    });

    const onLeave = async (returnOn: string) => {
      const person = await h.worker(des, code());
      await h
        .startLongLeave({
          employeeId: person.employeeId,
          startedOn: h.day(-30),
          approvedReturnOn: returnOn,
          grounds: {
            type: 'APPROVED_APPLICATION',
            reference: 'DN-05/2026',
            issuer: 'HR Department',
            issuedOn: '2026-05-25',
          },
        })
        .expect(201);

      return person;
    };

    it('takes the long leave up again with the approved day when it is still ahead', async () => {
      const person = await onLeave(h.day(60));
      const wire = await h.recordedCase(person);

      await h.cancelCase(wire.id, { reason: 'Hủy bàn giao' }).expect(200);

      expect(await h.workState(person.employeeId)).toBe('ACTIVE/ON_LONG_LEAVE');
      const leaves = await h.ctx.sql.query(
        `SELECT status::text AS status, to_char(approved_return_on, 'YYYY-MM-DD') AS approved FROM employee_leaves
          WHERE employee_id = $1 ORDER BY started_at, id`,
        [person.employeeId],
      );
      expect(leaves.rows).toEqual([
        { status: 'ENDED', approved: h.day(60) },
        { status: 'ACTIVE', approved: h.day(60) },
      ]);
    });

    it('returns the person to work when the day they were due back has passed', async () => {
      const person = await onLeave(h.day(-5));
      const wire = await h.recordedCase(person);

      await h.cancelCase(wire.id, { reason: 'Hủy bàn giao' }).expect(200);

      expect(await h.workState(person.employeeId)).toBe('ACTIVE/WORKING');
    });
  });
});
