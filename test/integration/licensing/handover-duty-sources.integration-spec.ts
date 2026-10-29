import { randomUUID } from 'node:crypto';
import { REVOCATION_SOURCES } from '../../../src/modules/licensing/public/licensing.types';
import { HandoverHarness, type DutyWire } from '../../support/handover-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new HandoverHarness();

/** US-07-09, US-07-05 AC-13, AC-16: the handover confirmation of every source of a revocation, opened through the one gate. */
describe('the handover confirmation of the sources of a revocation (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let h1: Person;
  let h2: Person;
  let counter = 0;
  const NOTE = 'Sao lưu cuộc trò chuyện trước khi gỡ';
  let lossy: string;
  let plain: string;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    h1 = await h.veteran(des, 'H1-SRC');
    h2 = await h.veteran(fin, 'H2-SRC');
    await h.makeHead(des, h1);
    await h.makeHead(fin, h2);
    lossy = await h.subscription(80, 'K2');
    plain = await h.subscription(80, 'K2');
    await h.describePlan(lossy, true, NOTE);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A person of P-DES with a seat in the tool that loses data and in the one that does not. */
  const holder = async () => {
    const employeeCode = `E-SRC-${(counter += 1)}`;
    const person = await h.veteran(des, employeeCode);

    return {
      person,
      lossy: await h.seatOf(person, { subscriptionId: lossy }, employeeCode),
      plain: await h.seatOf(person, { subscriptionId: plain }, employeeCode),
    };
  };

  const dutyOf = async (assignmentId: string) => (await h.dutyRows(assignmentId)).at(-1);
  const wire = async (id: string, account = h.it1) => h.dataOf<DutyWire>(await h.duty(id, account).expect(200));
  const decided = (employee: Person | null, role = 'MANAGER') => ({
    decidedByEmployeeId: employee?.employeeId ?? null,
    decidedRole: role,
  });

  it('US-07-09 AC-1, AC-2, US-07-05 AC-13: a departure holds the tool that loses data until the head confirms, and the seat keeps counting', async () => {
    const { person, lossy: seat, plain: other } = await holder();
    const free = await h.freeSeats(lossy);
    const lossyTask = await h.open(seat, 'ABRUPT_DEPARTURE');
    const plainTask = await h.open(other, 'ABRUPT_DEPARTURE');

    expect(await h.dutyRows(other)).toEqual([]);
    const row = await dutyOf(seat);
    expect(row).toMatchObject({
      confirmer_role: 'DEPARTMENT_HEAD',
      department_id: des.id,
      leaver_is_head: false,
      notice_text: NOTE,
    });
    expect((row?.due_on ?? '') > h.today()).toBe(true);
    const held = await h.claim(lossyTask.taskId).expect(409);
    expect(h.codeOf(held)).toBe('HANDOVER.CONFIRMATION_PENDING');
    expect(h.detailsOf(held)).toMatchObject({
      dutyId: row?.id,
      dueOn: row?.due_on,
      role: 'DEPARTMENT_HEAD',
      waitingReason: null,
    });
    // The tool that loses nothing is taken away at once, and the seat of the other is not given back.
    await h.claim(plainTask.taskId).expect(200);
    expect(await h.freeSeats(lossy)).toBe(free);
    expect(await h.assignmentRow(seat)).toMatchObject({ valid_until: null });
    // Not the person who leaves and not the IT Admin: the head.
    expect((await wire(row?.id ?? '', h1.account)).canConfirm).toBe(true);
    expect(h.codeOf(await h.confirmDuty(row?.id ?? '', { value: 'HANDED_OVER' }, h.it1).expect(403))).toBe(
      'HANDOVER_DUTY.NOT_CONFIRMER',
    );

    await h.confirmDuty(row?.id ?? '', { value: 'HANDED_OVER' }, h1.account).expect(201);

    await h.claim(lossyTask.taskId).expect(200);
    await h.revoked(lossyTask.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(200);
    expect(await h.freeSeats(lossy)).toBe((free ?? 0) + 1);
    expect(person.employeeId).toBe(row?.employee_id);
  });

  it('US-07-09 AC-17, US-03-09 AC-5: past the short deadline the revocation goes on and is flagged, in the list of the head and of the IT Admin', async () => {
    const { lossy: seat } = await holder();
    const { taskId } = await h.open(seat, 'ABRUPT_DEPARTURE');
    await h.claim(taskId).expect(409);
    await h.ctx.sql.query(`UPDATE handover_duties SET due_on = $2 WHERE assignment_id = $1`, [seat, h.day(-1)]);

    await h.claim(taskId).expect(200);
    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(200);

    const row = await dutyOf(seat);
    expect(row?.confirmed_value).toBeNull();
    expect(row?.proceeded_unconfirmed_at).not.toBeNull();
    const forHead = await wire(row?.id ?? '', h1.account);
    const forIt = await wire(row?.id ?? '', h.it1);
    expect(forHead).toMatchObject({ flaggedUnconfirmed: true, overdue: true, status: 'OPEN' });
    expect(forIt).toMatchObject({ flaggedUnconfirmed: true, canConfirm: false });
  });

  it('US-07-09 AC-3, AC-4, AC-16: a return is confirmed by the person who returned the seat, a head who decided is confirmed by that head, and a tool that loses nothing asks for nothing', async () => {
    const { person, lossy: seat, plain: other } = await holder();
    const returned = await h.open(seat, 'RETURN', { decision: decided(person, 'EMPLOYEE') });
    const noLoss = await h.open(other, 'RETURN', { decision: decided(person, 'EMPLOYEE') });

    expect(await dutyOf(seat)).toMatchObject({ confirmer_role: 'REQUESTER', confirmer_employee_id: person.employeeId });
    expect(await h.dutyRows(other)).toEqual([]);
    await h.claim(noLoss.taskId).expect(200);
    const id = (await dutyOf(seat))?.id ?? '';
    for (const account of [h.it1, h1.account, h2.account]) {
      expect(h.codeOf(await h.confirmDuty(id, { value: 'HANDLED' }, account).expect(403))).toBe(
        'HANDOVER_DUTY.NOT_CONFIRMER',
      );
    }
    expect(h.codeOf(await h.confirmDuty(id, { value: 'HANDED_OVER' }, person.account).expect(422))).toBe(
      'HANDOVER_DUTY.VALUE_NOT_ALLOWED',
    );
    expect(await wire(id, person.account)).toMatchObject({ canConfirm: true, role: 'REQUESTER', noticeText: NOTE });

    await h.confirmDuty(id, { value: 'HANDLED' }, person.account).expect(201);

    await h.claim(returned.taskId).expect(200);
    const notNeeded = await holder();
    await h.open(notNeeded.lossy, 'MANAGER_NOT_NEEDED', { decision: decided(h1) });
    expect(await dutyOf(notNeeded.lossy)).toMatchObject({
      confirmer_role: 'DEPARTMENT_HEAD',
      confirmer_employee_id: h1.employeeId,
    });
    const notNeededId = (await dutyOf(notNeeded.lossy))?.id ?? '';
    expect(h.codeOf(await h.confirmDuty(notNeededId, { value: 'HANDLED' }, h2.account).expect(403))).toBe(
      'HANDOVER_DUTY.NOT_CONFIRMER',
    );
    await h.confirmDuty(notNeededId, { value: 'HANDLED' }, h1.account).expect(201);
  });

  it('US-07-09: the return that has its own record keeps its own light handover, and the gate is not asked twice', async () => {
    const { person, lossy: seat } = await holder();

    await h.open(seat, 'RETURN', {
      decision: { ...decided(person, 'EMPLOYEE'), referenceKind: 'RETURN_REQUEST', referenceId: randomUUID() },
    });

    expect(await h.dutyRows(seat)).toEqual([]);
  });

  it('US-07-09 AC-5, AC-6: the review after a transfer goes to the new head of the department that receives the person, a ghost seat to the head who chose to take it back', async () => {
    const { lossy: seat } = await holder();
    await h.open(seat, 'TRANSFER_REVIEW', { decision: decided(null, 'HR'), context: { departmentId: fin.id } });

    const row = await dutyOf(seat);
    expect(row).toMatchObject({
      confirmer_role: 'DEPARTMENT_HEAD',
      confirmer_employee_id: null,
      department_id: fin.id,
      source: 'TRANSFER_REVIEW',
    });
    expect(h.codeOf(await h.confirmDuty(row?.id ?? '', { value: 'HANDLED' }, h1.account).expect(403))).toBe(
      'HANDOVER_DUTY.NOT_CONFIRMER',
    );
    await h.confirmDuty(row?.id ?? '', { value: 'HANDLED' }, h2.account).expect(201);

    const ghost = await holder();
    await h.open(ghost.lossy, 'GHOST_SEAT', { decision: decided(h1) });
    expect(await dutyOf(ghost.lossy)).toMatchObject({ confirmer_employee_id: h1.employeeId, source: 'GHOST_SEAT' });
  });

  it.each([
    'TIME_LIMITED_EXPIRY',
    'SUBSCRIPTION_REDUCTION',
    'SUBSCRIPTION_CANCELLATION',
    'SUBSCRIPTION_EXPIRED',
    'NOT_LEGALIZED',
    'RE_EXECUTION',
  ] as const)(
    'US-07-09 AC-7 to AC-10: %s is confirmed by the IT Admin, never by the head of the department',
    async (source) => {
      const { lossy: seat } = await holder();
      await h.open(seat, source, { decision: decided(null, 'SYSTEM'), context: { noticeText: `Lưu ý của ${source}` } });

      const row = await dutyOf(seat);
      expect(row).toMatchObject({ confirmer_role: 'IT_ADMIN', confirmer_employee_id: null, source });
      expect(await wire(row?.id ?? '', h.it1)).toMatchObject({
        canConfirm: true,
        role: 'IT_ADMIN',
        noticeText: `Lưu ý của ${source}`,
      });
      expect(h.codeOf(await h.confirmDuty(row?.id ?? '', { value: 'HANDLED' }, h1.account).expect(403))).toBe(
        'HANDOVER_DUTY.NOT_CONFIRMER',
      );
      expect(h.codeOf(await h.confirmDuty(row?.id ?? '', { value: 'NOT_NEEDED' }, h.it1).expect(422))).toBe(
        'HANDOVER_DUTY.VALUE_NOT_ALLOWED',
      );

      await h.confirmDuty(row?.id ?? '', { value: 'HANDLED' }, h.it1).expect(201);

      expect(await dutyOf(seat)).toMatchObject({ confirmed_role: 'IT_ADMIN', confirmed_value: 'HANDLED' });
    },
  );

  it('US-07-09 AC-7, AC-16: a tool that loses nothing is not held by any source but a departure', async () => {
    for (const source of REVOCATION_SOURCES.filter((one) => one !== 'DEPARTURE' && one !== 'RETURN')) {
      const { plain: seat } = await holder();
      const { taskId } = await h.open(seat, source, { decision: decided(h1), context: { departmentId: des.id } });

      expect(await h.dutyRows(seat)).toEqual([]);
      await h.claim(taskId).expect(200);
    }
    // A planned departure is confirmed for every tool, even one that loses nothing.
    const { plain: seat } = await holder();
    await h.open(seat, 'DEPARTURE');
    expect(await dutyOf(seat)).toMatchObject({ confirmer_role: 'DEPARTMENT_HEAD', data_loss: false });
  });

  describe('a seat that two reasons ask for is confirmed once (US-07-09 AC-11, AC-12, AC-23)', () => {
    it.each([
      'SUBSCRIPTION_REDUCTION',
      'SUBSCRIPTION_CANCELLATION',
      'SUBSCRIPTION_EXPIRED',
      'TIME_LIMITED_EXPIRY',
      'RE_EXECUTION',
    ] as const)(
      'a ghost seat and %s: the head who chose Revoke confirms, the IT Admin does not, in either order',
      async (other) => {
        const first = await holder();
        await h.open(first.lossy, 'GHOST_SEAT', { decision: decided(h1) });
        await h.open(first.lossy, other, { decision: decided(null, 'SYSTEM') });
        const second = await holder();
        await h.open(second.lossy, other, { decision: decided(null, 'SYSTEM') });
        expect(await dutyOf(second.lossy)).toMatchObject({ confirmer_role: 'IT_ADMIN' });
        await h.open(second.lossy, 'GHOST_SEAT', { decision: decided(h1) });

        for (const seat of [first.lossy, second.lossy]) {
          const rows = await h.dutyRows(seat);
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            confirmer_role: 'DEPARTMENT_HEAD',
            confirmer_employee_id: h1.employeeId,
            source: 'GHOST_SEAT',
          });
          expect(h.codeOf(await h.confirmDuty(rows[0].id, { value: 'HANDLED' }, h.it1).expect(403))).toBe(
            'HANDOVER_DUTY.NOT_CONFIRMER',
          );
        }
        const [row] = await h.dutyRows(second.lossy);
        expect(await h.auditActions(row.id)).toEqual(['HANDOVER_DUTY.OPENED', 'HANDOVER_DUTY.ROLE_CHANGED']);
        await h.confirmDuty(row.id, { value: 'HANDLED' }, h1.account).expect(201);
      },
    );

    it('relies on a confirmation of the right role that is already there, and asks the head after an IT Admin who confirmed', async () => {
      const departed = await holder();
      await h.open(departed.lossy, 'ABRUPT_DEPARTURE');
      await h.confirmDuty((await dutyOf(departed.lossy))?.id ?? '', { value: 'HANDED_OVER' }, h1.account).expect(201);
      await h.open(departed.lossy, 'SUBSCRIPTION_CANCELLATION', { decision: decided(null, 'SYSTEM') });
      expect(await h.dutyRows(departed.lossy)).toHaveLength(1);

      const itFirst = await holder();
      await h.open(itFirst.lossy, 'RE_EXECUTION', { decision: decided(null, 'SYSTEM') });
      await h.confirmDuty((await dutyOf(itFirst.lossy))?.id ?? '', { value: 'HANDLED' }, h.it1).expect(201);
      await h.open(itFirst.lossy, 'GHOST_SEAT', { decision: decided(h1) });
      const rows = await h.dutyRows(itFirst.lossy);
      expect(rows.map((row) => [row.confirmer_role, row.confirmed_value])).toEqual([
        ['IT_ADMIN', 'HANDLED'],
        ['DEPARTMENT_HEAD', null],
      ]);

      const other = await holder();
      await h.open(other.lossy, 'SUBSCRIPTION_REDUCTION', { decision: decided(null, 'SYSTEM') });
      expect(await dutyOf(other.lossy)).toMatchObject({ confirmer_role: 'IT_ADMIN' });
    });
  });

  it('US-07-09 AC-19 to AC-22: the confirmation and the work on the revocation are two events of two people, and an unrelated role writes neither', async () => {
    const { lossy: seat } = await holder();
    const { taskId } = await h.open(seat, 'SUBSCRIPTION_CANCELLATION', { decision: decided(null, 'SYSTEM') });
    const id = (await dutyOf(seat))?.id ?? '';
    expect(h.codeOf(await h.confirmDuty(id, { value: 'HANDLED' }, h.finance).expect(403))).toBe(
      'HANDOVER_DUTY.NOT_CONFIRMER',
    );
    await h.claim(taskId).expect(409);

    await h.confirmDuty(id, { value: 'HANDLED' }, h.it1).expect(201);
    await h.claim(taskId).expect(200);
    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(200);

    const confirmation = await h.ctx.sql.query<{ actor_app_user_id: string; resource_type: string }>(
      `SELECT actor_app_user_id, resource_type FROM audit_events WHERE resource_id = $1 AND action = 'HANDOVER_DUTY.CONFIRMED'`,
      [id],
    );
    const completion = await h.ctx.sql.query<{ resource_type: string; after: Record<string, unknown> }>(
      `SELECT resource_type, after FROM audit_events WHERE resource_id = $1 AND action = 'PROVISIONING_TASK.REVOCATION_COMPLETED'`,
      [taskId],
    );
    expect(confirmation.rows).toEqual([{ actor_app_user_id: h.it1.appUserId, resource_type: 'HandoverDuty' }]);
    expect(completion.rows).toHaveLength(1);
    expect(JSON.stringify(completion.rows[0].after)).not.toContain(id);
    // The row of the confirmation keeps the person, the role and the moment; the task keeps who completed it.
    expect(await dutyOf(seat)).toMatchObject({
      confirmed_by_employee_id: h.it1.employeeId,
      confirmed_role: 'IT_ADMIN',
    });
  });
});
