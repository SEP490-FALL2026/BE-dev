import { clearSpendingApprover, setSpendingApprover } from '../../support/builders/account.builder';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';
import type { TransferWire } from '../../support/transfer-harness';

const h = new OffboardingHarness();

/**
 * US-03-04 AC-1, AC-2, AC-5, AC-8, AC-18, AC-19, AC-23, US-03-03 AC-6, US-03-01 AC-21: recording a person who leaves, over HTTP, on
 * real PostgreSQL (case E1 with four seats, head H1).
 */
describe('recording a departure (integration, real PostgreSQL)', () => {
  let des: Department;
  let h1: Person;
  let counter = 0;
  const code = (prefix = 'E') => `${prefix}-OR-${(counter += 1)}`;
  let subscriptions: string[];
  let chatgpt: string;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    h1 = await h.worker(des, 'H1-OR');
    await h.makeHead(des, h1);
    subscriptions = [await h.subscription(40, 'K2'), await h.subscription(40, 'K2'), await h.subscription(40, 'K2')];
    chatgpt = await h.subscription(40, 'K2');
    await h.describePlan(chatgpt, true, 'Xuất dữ liệu trước khi gỡ');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A person of P-DES with a seat in each of the four tools. */
  const leaver = async (department = des) => {
    const employeeCode = code();
    const person = await h.worker(department, employeeCode);
    const seats: string[] = [];
    for (const subscriptionId of [...subscriptions, chatgpt])
      seats.push(await h.seatOf(person, { subscriptionId }, employeeCode));

    return { person, seats };
  };

  const nothingWritten = async (person: Person) => ({
    cases: await h.caseCount(person.employeeId),
    state: await h.workState(person.employeeId),
    placements: await h.placements(person.employeeId),
  });

  it('records the handover of E1 with the days, asks the head to confirm every tool and takes nothing away (AC-1, AC-5)', async () => {
    const { person, seats } = await leaver();
    const tasks = await h.taskCount();

    const wire = await h.recordedCase(person);

    expect(wire).toMatchObject({
      state: 'HANDING_OVER',
      accessBlockMode: 'WITH_LAST_DAY',
      lastWorkingDay: h.day(10),
      departureEffectiveOn: h.day(11),
      // No deadline of a handover is told any more (QĐ-110g): the key stays, always null, though the column is still written.
      handoverDueOn: null,
      heldRights: 4,
      priorWorkState: 'WORKING',
      recordedByProcedure: false,
      groundsNote: h.groundsNote,
      employee: { id: person.employeeId },
      department: { id: des.id },
      headSuccessor: null,
      left: null,
      accountLockMissing: false,
    });
    // The old column is still written (its constraint asks for it) and never told.
    expect((await h.caseRow(wire.id)).handover_due_on).toBe(h.dueBefore(h.day(10)));
    expect(await h.workState(person.employeeId)).toBe('ACTIVE/HANDING_OVER');
    const placements = await h.placements(person.employeeId);
    expect(placements[placements.length - 1].valid_to).toBe(h.day(11));
    // No confirmation of a handover is asked of anyone (QĐ-110g): recording the departure opens no duty.
    expect(await h.count('handover_duties')).toBe(0);
    expect(await h.taskCount()).toBe(tasks);
    expect(await h.changeKinds(wire.id)).toEqual(['RECORDED']);
    const [event] = await h.auditEventsOf('OFFBOARDING_CASE.RECORDED', wire.id);
    expect(event.after).toMatchObject({
      lastWorkingDay: h.day(10),
      grounds: { reference: h.groundsNote },
      accessBlockMode: 'WITH_LAST_DAY',
    });
    expect((await h.auditEventsOf('PERSONNEL.EMPLOYEE_INFORMED', wire.id)).length).toBe(1);

    const rights = h.dataOf<{
      items: { assignmentId: string; revocable: boolean; handover: unknown }[];
    }>(await h.rightsOf(wire.id).expect(200)).items;
    expect(rights.map((right) => right.assignmentId).sort()).toEqual([...seats].sort());
    expect(rights.every((right) => right.revocable && right.handover === null)).toBe(true);
    const detail = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
    expect(detail.checklist?.dataHandover).toEqual({ state: 'DONE', pendingDuties: 0 });
    expect(detail.checklist?.accountLock).toEqual({ state: 'PENDING', urgent: false });
  });

  it('refuses a record without the last working day or without the mode, and one with `abrupt`, and writes nothing (AC-2, Q-04 B)', async () => {
    const { person } = await leaver();
    const before = await nothingWritten(person);
    const tasks = await h.taskCount();

    const withoutDay = await h.recordCase({
      employeeId: person.employeeId,
      accessBlockMode: 'WITH_LAST_DAY',
      groundsNote: h.groundsNote,
    });
    const withoutMode = await h.recordCase({
      employeeId: person.employeeId,
      lastWorkingDay: h.day(10),
      accessBlockMode: undefined,
      groundsNote: h.groundsNote,
    });
    const retired = await h.recordCase(h.body(person, { abrupt: true }));
    for (const response of [withoutDay, withoutMode, retired])
      expect([response.status, h.codeOf(response)]).toEqual([422, 'VALIDATION_ERROR']);
    // A planned handover cannot start in the past; a departure blocked now can have a last working day that has gone by.
    const past = await h.recordCase(h.body(person, { lastWorkingDay: h.day(-1) }));
    expect([past.status, h.codeOf(past)]).toEqual([422, 'OFFBOARDING_CASE.LAST_WORKING_DAY_INVALID']);

    expect(await nothingWritten(person)).toEqual(before);
    expect(await h.taskCount()).toBe(tasks);
  });

  it('refuses a departure without a basis in one box, with the old four-part one, or on the code of a notice and changes nothing (AC-23)', async () => {
    const { person } = await leaver();
    const before = await nothingWritten(person);

    const none = await h.recordCase({ employeeId: person.employeeId, lastWorkingDay: h.day(10) });
    const incomplete = await h.recordCase(
      h.body(person, { groundsNote: undefined, grounds: { type: 'HR_DECISION', reference: 'QD-1/2026' } }),
    );
    const notice = await h.recordCase(h.body(person, { groundsNote: 'BM09-2026-000123' }));

    expect([none, incomplete, notice].map((response) => [response.status, h.codeOf(response)])).toEqual([
      [422, 'VALIDATION_ERROR'],
      [422, 'VALIDATION_ERROR'],
      [422, 'OFFBOARDING_CASE.GROUNDS_IS_NOTICE'],
    ]);
    expect(await nothingWritten(person)).toEqual(before);
  });

  it('refuses a person who has left or is handing over already', async () => {
    const { person } = await leaver();
    await h.recordedCase(person);

    const again = await h.recordCase(h.body(person));
    expect([again.status, h.codeOf(again)]).toEqual([409, 'OFFBOARDING_CASE.ALREADY_HANDING_OVER']);
    const unknown = await h.recordCase(h.body({ ...person, employeeId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' }));
    expect([unknown.status, h.codeOf(unknown)]).toEqual([404, 'OFFBOARDING_CASE.EMPLOYEE_NOT_FOUND']);
  });

  describe('the head of the department who goes (AC-8)', () => {
    /** A department with a head who leaves and two members who can follow. */
    const headedDepartment = async () => {
      const department = await h.departmentWithUnit(code('P'));
      const head = await h.worker(department, code('E'));
      await h.makeHead(department, head);
      const next = await h.worker(department, code('H'), ['MANAGER']);

      return { department, head, next };
    };

    it('is recorded without a successor: the department has no head from the day after, and the answer warns of it', async () => {
      const { department, head } = await headedDepartment();

      const wire = await h.recordedCase(head);

      expect(wire.headSuccessor).toEqual({ kind: 'NONE', employee: null });
      expect(wire.warnings?.departmentWithoutHeadFrom).toBe(h.day(11));
      const periods = await h.headPeriods(department.id);
      expect(periods).toEqual([expect.objectContaining({ employee_id: head.employeeId, valid_to: h.day(11) })]);
    });

    it('hands the department to a member from the day after the last working day, and not before', async () => {
      const { department, head, next } = await headedDepartment();

      const wire = await h.recordedCase(head, { successor: { kind: 'EMPLOYEE', employeeId: next.employeeId } });

      expect(wire.headSuccessor).toMatchObject({ kind: 'EMPLOYEE', employee: { id: next.employeeId } });
      expect(wire.warnings?.departmentWithoutHeadFrom).toBeNull();
      const periods = await h.headPeriods(department.id);
      expect(periods).toEqual([
        expect.objectContaining({ employee_id: head.employeeId, valid_to: h.day(11) }),
        expect.objectContaining({ employee_id: next.employeeId, valid_from: h.day(11), valid_to: null }),
      ]);
    });

    it('refuses a successor without MANAGER and the spending approver, writes nothing, and still records the departure with nobody (US-03-04 AC-8, US-03-06 AC-23, AC-24)', async () => {
      const { department, head } = await headedDepartment();
      const withoutRole = await h.worker(department, code('N'));
      const approver = await h.worker(department, code('A'));
      await setSpendingApprover(h.ctx, h.admin, approver.employeeId);
      const before = await nothingWritten(head);
      const refusal = async (employeeId: string) => {
        const response = await h.recordCase(h.body(head, { successor: { kind: 'EMPLOYEE', employeeId } }));

        return [response.status, h.codeOf(response), h.detailsOf(response)];
      };

      expect(await refusal(withoutRole.employeeId)).toEqual([
        422,
        'OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
        { reason: 'MANAGER_ROLE_REQUIRED' },
      ]);
      expect(await refusal(approver.employeeId)).toEqual([
        422,
        'OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
        { reason: 'SPENDING_APPROVER_CANNOT_HEAD' },
      ]);
      expect(await nothingWritten(head)).toEqual(before);
      await clearSpendingApprover(h.ctx, h.admin);

      const recorded = await h.recordedCase(head, { successor: { kind: 'NONE' } });

      expect(recorded.headSuccessor).toEqual({ kind: 'NONE', employee: null });
      expect(await h.headPeriods(department.id)).toEqual([expect.objectContaining({ employee_id: head.employeeId })]);
    });

    it('refuses a successor who is not a member of the department that day, and writes nothing', async () => {
      const { department, head } = await headedDepartment();
      const other = await h.departmentWithUnit(code('P'));
      const outsider = await h.worker(other, code('E'));
      const before = await nothingWritten(head);

      const response = await h.recordCase(
        h.body(head, { successor: { kind: 'EMPLOYEE', employeeId: outsider.employeeId } }),
      );

      expect([response.status, h.codeOf(response)]).toEqual([422, 'OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE']);
      expect(await nothingWritten(head)).toEqual(before);
      expect(await h.headPeriods(department.id)).toEqual([
        expect.objectContaining({ employee_id: head.employeeId, valid_to: null }),
      ]);
    });
  });

  describe('a departure nobody planned (AC-18)', () => {
    it('is left at once: the sign-in is refused and no handover is asked about any tool, the one that loses data included (QĐ-110g)', async () => {
      const employeeCode = code();
      const person = await h.worker(des, employeeCode);
      await h.seatOf(person, { subscriptionId: chatgpt }, employeeCode);
      await h.seatOf(person, { subscriptionId: subscriptions[0] }, employeeCode);
      const tasks = await h.taskCount();

      const wire = await h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.today() });

      expect(wire).toMatchObject({
        state: 'LEFT',
        accessBlockMode: 'BLOCK_NOW',
        handoverDueOn: null,
        accountLockMissing: true,
      });
      expect(wire).not.toHaveProperty('abrupt');
      expect(wire.warnings).toMatchObject({ accountLockNotRecorded: true });
      expect(wire.checklist?.accountLock).toEqual({ state: 'PENDING', urgent: true });
      expect(await h.workState(person.employeeId)).toBe('TERMINATED/LEFT');
      expect(await h.employeeLeftOn(person.employeeId)).toBe(h.today());
      expect(await h.count('handover_duties')).toBe(0);
      expect(await h.taskCount()).toBe(tasks);
      await h.readCase(wire.id, person.account).expect(401);
      expect((await h.auditEventsOf('OFFBOARDING_CASE.LEFT', wire.id)).length).toBe(1);
      expect((await h.auditEventsOf('OFFBOARDING_CASE.ACCOUNT_LOCK_REMINDER', wire.id)).length).toBe(1);
    });

    it('does not wait for a successor of the head who goes: the department has no head from the day', async () => {
      const department = await h.departmentWithUnit(code('P'));
      const head = await h.worker(department, code('E'));
      await h.makeHead(department, head);
      await h.ctx.sql.query(`UPDATE department_head_periods SET valid_from = '2026-10-02' WHERE employee_id = $1`, [
        head.employeeId,
      ]);

      const wire = await h.recordedCase(head, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.day(-1) });

      expect(wire.state).toBe('LEFT');
      expect(wire.warnings?.departmentWithoutHeadFrom).toBe(h.today());
      expect((await h.headPeriods(department.id))[0].valid_to).toBe(h.today());
    });
  });

  describe('a transfer that waits (US-03-01 AC-21)', () => {
    const transferBody = (person: Person, department: Department, effectiveOn: string) => ({
      employeeId: person.employeeId,
      toDepartmentId: department.id,
      effectiveOn,
      groundsNote: h.groundsNote,
    });

    it('is cancelled in the same action when the last working day falls before it, on a confirmation, with the standard reason and the basis of the departure', async () => {
      const target = await h.departmentWithUnit(code('P'));
      const { person } = await leaver();
      const transfer = await h.recorded(transferBody(person, target, h.day(20)));

      const missing = await h.recordCase(h.body(person));
      expect([missing.status, h.codeOf(missing)]).toEqual([422, 'OFFBOARDING_CASE.TRANSFER_CANCELLATION_REQUIRED']);
      expect(h.dataOf<TransferWire>(await h.readTransfer(transfer.id).expect(200)).status).toBe('PENDING');
      expect(await h.caseCount(person.employeeId)).toBe(0);

      const retired = await h.recordCase(
        h.body(person, { pendingTransferCancellation: { reason: 'Nghỉ việc trước ngày chuyển' } }),
      );
      expect([retired.status, h.codeOf(retired)]).toEqual([422, 'VALIDATION_ERROR']);

      const wire = await h.recordedCase(person, { cancelPendingTransfer: true });

      expect(wire.state).toBe('HANDING_OVER');
      const cancelled = h.dataOf<TransferWire>(await h.readTransfer(transfer.id).expect(200));
      expect(cancelled).toMatchObject({
        status: 'CANCELLED',
        cancellation: { reason: 'DEPARTURE_BEFORE_TRANSFER' },
        groundsNote: h.groundsNote,
      });
      const placements = await h.placements(person.employeeId);
      expect(placements.map((placement) => placement.department_id)).toEqual([des.id]);
      expect(placements[0].valid_to).toBe(h.day(11));
    });

    it('is not touched when the last working day is on or after the day it takes effect: 409 PENDING_EVENT_EXISTS', async () => {
      const target = await h.departmentWithUnit(code('P'));
      const { person } = await leaver();
      const transfer = await h.recorded(transferBody(person, target, h.day(20)));

      const response = await h.recordCase(h.body(person, { lastWorkingDay: h.day(25) }));

      expect([response.status, h.codeOf(response)]).toEqual([409, 'OFFBOARDING_CASE.PENDING_EVENT_EXISTS']);
      expect(h.dataOf<TransferWire>(await h.readTransfer(transfer.id).expect(200)).status).toBe('PENDING');
      expect(await h.caseCount(person.employeeId)).toBe(0);
    });
  });

  describe('a person on long leave (US-03-03 AC-6)', () => {
    it('ends the leave the day the handover is recorded and takes it up again when the handover is cancelled', async () => {
      const person = await h.worker(des, code());
      await h
        .startLongLeave({
          employeeId: person.employeeId,
          startedOn: h.day(-30),
          approvedReturnOn: h.day(60),
          groundsNote: 'Đơn xin nghỉ dài hạn số DN-05/2026',
        })
        .expect(201);
      expect(await h.workState(person.employeeId)).toBe('ACTIVE/ON_LONG_LEAVE');

      const wire = await h.recordedCase(person);

      expect(wire.priorWorkState).toBe('ON_LONG_LEAVE');
      expect(await h.workState(person.employeeId)).toBe('ACTIVE/HANDING_OVER');
      const ended = await h.ctx.sql.query(
        `SELECT status::text AS status, end_kind::text AS end_kind, to_char(ended_on, 'YYYY-MM-DD') AS ended_on
           FROM employee_leaves WHERE employee_id = $1`,
        [person.employeeId],
      );
      expect(ended.rows).toEqual([{ status: 'ENDED', end_kind: 'DEPARTURE_STARTED', ended_on: h.today() }]);

      await h.cancelCase(wire.id, { reason: 'Quyết định nghỉ việc bị hủy' }).expect(200);

      expect(await h.workState(person.employeeId)).toBe('ACTIVE/ON_LONG_LEAVE');
    });
  });
});
