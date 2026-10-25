import request from 'supertest';
import { HandoverHarness, type DutyWire } from '../support/handover-harness';
import type { Department, Person } from '../support/request-harness';

const h = new HandoverHarness();

/** US-03-09: the handover of the data of each tool of a person who leaves, over HTTP, on real PostgreSQL (case E1, head H1). */
describe('the handover confirmation of a planned departure (integration, real PostgreSQL)', () => {
  let des: Department;
  let h1: Person;
  let counter = 0;
  const code = (prefix = 'E') => `${prefix}-HD-${(counter += 1)}`;
  const NOTE = 'Xuất các bản thiết kế sang thư mục chung trước khi gỡ';

  /** The three tools E1 holds: Figma (no data lost), ChatGPT Business (data is lost, with a notice) and Canva. */
  let figma: string;
  let chatgpt: string;
  let canva: string;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    h1 = await h.veteran(des, 'H1-HD');
    await h.makeHead(des, h1);
    figma = await h.subscription(40, 'K2');
    chatgpt = await h.subscription(40, 'K2');
    canva = await h.subscription(40, 'K2');
    await h.describePlan(chatgpt, true, NOTE);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A person of P-DES with a seat in each of the three tools. */
  const leaver = async (department = des) => {
    const employeeCode = code();
    const person = await h.veteran(department, employeeCode);
    const seats = {
      figma: await h.seatOf(person, { subscriptionId: figma }, employeeCode),
      chatgpt: await h.seatOf(person, { subscriptionId: chatgpt }, employeeCode),
      canva: await h.seatOf(person, { subscriptionId: canva }, employeeCode),
    };

    return { person, seats };
  };

  const open = (person: Person, extra: Record<string, unknown> = {}) =>
    h.openDuties({
      leaverEmployeeId: person.employeeId,
      source: 'DEPARTURE',
      caseRefId: null,
      lastWorkingDay: h.day(10),
      dueOn: h.day(9),
      leaverIsHead: false,
      ...extra,
    });

  const dutiesOf = async (account = h1.account, query = '') =>
    h.dataOf<{ items: DutyWire[] }>(await h.duties(`?pageSize=100${query}`, account).expect(200)).items;

  it('US-03-09 AC-1: the head sees one duty for each tool, the notice of the plan and the mark of lost data, due a working day before the last day', async () => {
    const { person, seats } = await leaver();

    const opened = await open(person);

    expect(opened).toMatchObject({ reused: 0, notRequired: 0 });
    expect(opened.opened.map((duty) => duty.assignmentId).sort()).toEqual(Object.values(seats).sort());
    const mine = (await dutiesOf()).filter((duty) => duty.employee.id === person.employeeId);
    expect(mine).toHaveLength(3);
    expect(mine.map((duty) => duty.application.name).sort()).toHaveLength(3);
    expect(mine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assignmentId: seats.chatgpt,
          dataLoss: true,
          role: 'DEPARTMENT_HEAD',
          status: 'OPEN',
          dueOn: h.day(9),
          canConfirm: true,
          waitingReason: null,
        }),
        expect.objectContaining({ assignmentId: seats.canva, dataLoss: false, canConfirm: true }),
      ]),
    );
    const detail = h.dataOf<DutyWire>(
      await h.duty(mine.find((duty) => duty.assignmentId === seats.chatgpt)?.id ?? '', h1.account).expect(200),
    );
    expect(detail).toMatchObject({ noticeText: NOTE, confirmer: { id: h1.employeeId }, confirmation: null });
    // The person who leaves has nothing to confirm and sees nothing; asking again opens nothing new.
    expect(await dutiesOf(person.account)).toEqual([]);
    expect(await open(person)).toMatchObject({ opened: [], reused: 3 });
    expect(await h.dutyRows(seats.figma)).toHaveLength(1);
  });

  it('US-03-09 AC-2: the head confirms each tool once, with the person, the moment and the value, and no revocation is made or blocked', async () => {
    const { person, seats } = await leaver();
    await open(person);
    const rows = await dutiesOf(h1.account, `&employeeId=${person.employeeId}`);
    const duty = (assignmentId: string) => rows.find((row) => row.assignmentId === assignmentId)?.id ?? '';
    const tasksBefore = await h.count('provisioning_tasks');

    const figmaDone = await h.confirmDuty(duty(seats.figma), { value: 'HANDED_OVER' }, h1.account).expect(201);
    await h.confirmDuty(duty(seats.chatgpt), { value: 'NOT_NEEDED' }, h1.account).expect(201);

    expect(h.dataOf<DutyWire>(figmaDone)).toMatchObject({
      status: 'CONFIRMED',
      canConfirm: false,
      confirmation: { value: 'HANDED_OVER', role: 'DEPARTMENT_HEAD', confirmedBy: { id: h1.employeeId }, late: false },
    });
    expect(await h.dutyRows(seats.figma)).toEqual([
      expect.objectContaining({ confirmed_value: 'HANDED_OVER', confirmed_by_employee_id: h1.employeeId }),
    ]);
    expect((await h.dutyRows(seats.canva))[0]).toMatchObject({ confirmed_value: null });
    // Nothing was made, held or ended by it, and the audit event names the person who confirmed.
    expect(await h.count('provisioning_tasks')).toBe(tasksBefore);
    expect(await h.liveTaskOf(seats.figma)).toBeNull();
    expect(await h.assignmentRow(seats.figma)).toMatchObject({ valid_until: null });
    const events = await h.auditActions(duty(seats.figma));
    expect(events).toEqual(['HANDOVER_DUTY.OPENED', 'HANDOVER_DUTY.CONFIRMED']);
    // A confirmation is written once; the value is the one of a departure.
    expect(h.codeOf(await h.confirmDuty(duty(seats.figma), { value: 'HANDED_OVER' }, h1.account).expect(409))).toBe(
      'HANDOVER_DUTY.ALREADY_CONFIRMED',
    );
    expect(h.codeOf(await h.confirmDuty(duty(seats.canva), { value: 'HANDLED' }, h1.account).expect(422))).toBe(
      'HANDOVER_DUTY.VALUE_NOT_ALLOWED',
    );
    expect((await h.dutyRows(seats.canva))[0]).toMatchObject({ confirmed_value: null });
  });

  it('US-03-09 AC-7: nobody but the head of the department confirms: another head, the IT Admin, Finance, the person who leaves', async () => {
    const { person, seats } = await leaver();
    await open(person);
    const id = (await dutiesOf(h1.account, `&employeeId=${person.employeeId}`))[0].id;
    const fin = await h.departmentWithUnit(`P-FIN-${counter}`);
    const otherHead = await h.veteran(fin, code('H'));
    await h.makeHead(fin, otherHead);

    for (const account of [otherHead.account, h.it1, h.finance, person.account]) {
      expect(h.codeOf(await h.confirmDuty(id, { value: 'HANDED_OVER' }, account).expect(403))).toBe(
        'HANDOVER_DUTY.NOT_CONFIRMER',
      );
    }
    expect((await h.dutyRows(seats.figma)).concat(await h.dutyRows(seats.canva))).toEqual(
      expect.arrayContaining([expect.objectContaining({ confirmed_value: null })]),
    );
    // A person the duty has nothing to do with is told it does not exist when reading it.
    expect(h.codeOf(await h.duty(id, otherHead.account).expect(404))).toBe('HANDOVER_DUTY.NOT_FOUND');
    expect(h.codeOf(await h.duty(id, h.finance).expect(404))).toBe('HANDOVER_DUTY.NOT_FOUND');
    expect(await dutiesOf(otherHead.account)).toEqual([]);
    // The IT Admin reads every duty and confirms none of a head.
    expect(h.dataOf<DutyWire>(await h.duty(id, h.it1).expect(200))).toMatchObject({ canConfirm: false });
  });

  it('US-03-09 AC-3: past the deadline the work goes on, the duty is flagged and the reminder is written once', async () => {
    const { person, seats } = await leaver();
    await open(person, { dueOn: h.day(-1), lastWorkingDay: h.day(0) });
    const { taskId } = await h.open(seats.canva, 'DEPARTURE');

    const first = await h.noticeOverdue();
    const again = await h.noticeOverdue();

    expect(first).toBeGreaterThanOrEqual(3);
    expect(again).toBe(0);
    const row = (await h.dutyRows(seats.canva))[0];
    expect(row.overdue_noticed_at).not.toBeNull();
    expect(await h.auditActions(row.id)).toEqual(['HANDOVER_DUTY.OPENED', 'HANDOVER_DUTY.OVERDUE']);
    await h.claim(taskId).expect(200);
    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản' }).expect(200);
    const proceeded = await h.dutyRows(seats.canva);
    expect(proceeded).toHaveLength(1);
    expect(proceeded[0].confirmed_value).toBeNull();
    expect(proceeded[0].proceeded_unconfirmed_at).not.toBeNull();
    expect(await h.auditActions(row.id)).toEqual([
      'HANDOVER_DUTY.OPENED',
      'HANDOVER_DUTY.OVERDUE',
      'HANDOVER_DUTY.FLAGGED_UNCONFIRMED',
    ]);
    const flagged = (await dutiesOf(h1.account, `&overdue=true&employeeId=${person.employeeId}`)).find(
      (duty) => duty.assignmentId === seats.canva,
    );
    expect(flagged).toMatchObject({ overdue: true, flaggedUnconfirmed: true, status: 'OPEN' });
    expect((await dutiesOf(h.it1, `&scope=all&employeeId=${person.employeeId}&overdue=true`)).length).toBe(3);
    // The confirmation that comes after the work went on is only recorded: the seat is not touched again.
    const done = h.dataOf<DutyWire>(
      await h.confirmDuty(flagged?.id ?? '', { value: 'NOT_NEEDED' }, h1.account).expect(201),
    );
    expect(done).toMatchObject({ status: 'CONFIRMED', flaggedUnconfirmed: true, confirmation: { late: true } });
    expect((await h.assignmentRow(seats.canva)).valid_until).not.toBeNull();
  });

  it('US-03-09 AC-4: a confirmation survives a revocation that failed, and a revocation that succeeded neither makes nor removes one', async () => {
    const { person, seats } = await leaver();
    await open(person);
    const rows = await dutiesOf(h1.account, `&employeeId=${person.employeeId}`);
    for (const row of rows) await h.confirmDuty(row.id, { value: 'HANDED_OVER' }, h1.account).expect(201);
    const failing = await h.open(seats.figma, 'DEPARTURE');
    await h.makeConnector(failing.taskId);
    await h.recordFailure(failing.taskId, 'PERMANENT', 'the provider refused');
    await h.closeFailed(failing.taskId, { reason: 'We will remove it by hand later' }).expect(200);

    expect(await h.dutyRows(seats.figma)).toEqual([expect.objectContaining({ confirmed_value: 'HANDED_OVER' })]);
    expect(await h.assignmentRow(seats.figma)).toMatchObject({ valid_until: null, failed_at: null });

    const succeeding = await h.open(seats.chatgpt, 'DEPARTURE');
    await h.claim(succeeding.taskId).expect(200);
    await h.revoked(succeeding.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(200);
    expect(await h.dutyRows(seats.chatgpt)).toEqual([expect.objectContaining({ confirmed_value: 'HANDED_OVER' })]);
    expect((await h.assignmentRow(seats.chatgpt)).valid_until).not.toBeNull();
  });

  it('US-03-04 AC-14, AC-15: the deadline of the case moves the duties that wait, a cancelled case cancels them and a confirmed one stays', async () => {
    const { person, seats } = await leaver();
    const caseRefId = '7d6a3a4e-2b9c-4c6e-9e0a-1f5b8a7c3d21';
    await open(person, { caseRefId });
    const rows = await dutiesOf(h1.account, `&employeeId=${person.employeeId}`);
    await h
      .confirmDuty(rows.find((row) => row.assignmentId === seats.figma)?.id ?? '', { value: 'NOT_NEEDED' }, h1.account)
      .expect(201);

    expect(await h.reconcileDuties(caseRefId, h.day(20), h.day(21))).toBe(2);
    expect((await h.dutyRows(seats.canva))[0]).toMatchObject({ due_on: h.day(20) });
    expect((await h.dutyRows(seats.figma))[0]).toMatchObject({ due_on: h.day(9) });

    expect(await h.cancelDuties(caseRefId, 'The departure was cancelled')).toBe(2);

    expect((await h.dutyRows(seats.canva))[0]).toMatchObject({ cancel_reason: 'The departure was cancelled' });
    expect((await h.dutyRows(seats.figma))[0]).toMatchObject({ confirmed_value: 'NOT_NEEDED', cancelled_at: null });
    const cancelled = rows.find((row) => row.assignmentId === seats.canva);
    expect(h.codeOf(await h.confirmDuty(cancelled?.id ?? '', { value: 'HANDED_OVER' }, h1.account).expect(409))).toBe(
      'HANDOVER_DUTY.CANCELLED',
    );
    expect(await h.cancelDuties(caseRefId, 'again')).toBe(0);
    // The seat may owe a new handover once the cancelled one is out of the way.
    expect((await open(person)).opened).toHaveLength(2);
  });

  it('keeps the person out of the reach of anything but the routes: the unknown id is a 404 and a bad one a 422', async () => {
    expect(h.codeOf(await h.duty('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', h1.account).expect(404))).toBe(
      'HANDOVER_DUTY.NOT_FOUND',
    );
    expect(
      h.codeOf(
        await h.confirmDuty('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', { value: 'HANDLED' }, h1.account).expect(404),
      ),
    ).toBe('HANDOVER_DUTY.NOT_FOUND');
    expect(h.codeOf(await h.duties('?scope=all', h1.account).expect(403))).toBe('HANDOVER_DUTY.SCOPE_FORBIDDEN');
    await request(h.server()).get('/api/v1/handover-duties').expect(401);
  });
});
