import request from 'supertest';
import { HandoverHarness, type DutyWire } from '../support/handover-harness';
import type { Person } from '../support/request-harness';

const h = new HandoverHarness();

/** US-03-09 AC-6, AC-8, AC-10 and US-07-09 AC-18: who confirms when the department has no head or the head leaves. */
describe('the person a handover falls to when the head is missing or leaves (integration, real PostgreSQL)', () => {
  let counter = 0;
  const code = (prefix: string) => `${prefix}-HS-${(counter += 1)}`;
  let subscriptionId: string;

  beforeAll(async () => {
    await h.start();
    subscriptionId = await h.subscription(40, 'K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with the people named, none of them head. */
  const department = async (name: string, people: string[]) => {
    const created = await h.departmentWithUnit(`${name}-${(counter += 1)}`);
    const staff: Record<string, Person> = {};
    for (const person of people) staff[person] = await h.veteran(created, code(person));

    return { created, staff };
  };

  const seatOf = (person: Person, employeeCode: string) => h.seatOf(person, { subscriptionId }, employeeCode);
  const codeOfPerson = async (person: Person) =>
    (
      await h.ctx.sql.query<{ employee_code: string }>(`SELECT employee_code FROM employees WHERE id = $1`, [
        person.employeeId,
      ])
    ).rows[0].employee_code;

  const dutiesOf = async (account = h.it1, query = '') =>
    h.dataOf<{ items: DutyWire[] }>(await h.duties(`?pageSize=100${query}`, account).expect(200)).items;

  const leave = async (person: Person, extra: Record<string, unknown> = {}) => {
    const assignmentId = await seatOf(person, await codeOfPerson(person));
    await h.openDuties({
      leaverEmployeeId: person.employeeId,
      source: 'DEPARTURE',
      lastWorkingDay: h.day(4),
      dueOn: h.day(3),
      leaverIsHead: false,
      ...extra,
    });
    const [row] = await h.dutyRows(assignmentId);

    return { assignmentId, id: row.id };
  };

  it('US-03-09 AC-6, US-07-09 AC-18: a department with no head leaves the duty waiting with nobody named, and a head who arrives takes it with its deadline', async () => {
    const { created, staff } = await department('P-OPS', ['E2', 'H4']);
    const { assignmentId, id } = await leave(staff.E2);

    expect((await h.dutyRows(assignmentId))[0]).toMatchObject({
      confirmer_role: 'DEPARTMENT_HEAD',
      confirmer_employee_id: null,
    });
    const waiting = (await dutiesOf(h.it1, '&scope=all')).find((duty) => duty.id === id);
    expect(waiting).toMatchObject({ waitingReason: 'NO_HEAD', canConfirm: false, status: 'OPEN', dueOn: h.day(3) });
    // Not the IT Admin, not the person who leaves, not another person with a role: nobody is named.
    for (const account of [h.it1, staff.E2.account, h.finance, staff.H4.account]) {
      expect(h.codeOf(await h.confirmDuty(id, { value: 'NOT_NEEDED' }, account).expect(403))).toBe(
        'HANDOVER_DUTY.NOT_CONFIRMER',
      );
    }
    expect((await h.dutyRows(assignmentId))[0]).toMatchObject({ confirmed_value: null });
    expect(await dutiesOf(staff.H4.account)).toEqual([]);

    await h.makeHead(created, staff.H4);

    expect(await dutiesOf(staff.H4.account)).toEqual([
      expect.objectContaining({ id, canConfirm: true, waitingReason: null, dueOn: h.day(3) }),
    ]);
    expect((await h.dutyRows(assignmentId))[0]).toMatchObject({ due_on: h.day(3), overdue_noticed_at: null });
    const done = await h.confirmDuty(id, { value: 'HANDED_OVER' }, staff.H4.account).expect(201);
    expect(h.dataOf<DutyWire>(done)).toMatchObject({
      status: 'CONFIRMED',
      confirmation: { role: 'DEPARTMENT_HEAD', confirmedBy: { id: staff.H4.employeeId } },
    });
  });

  it('US-03-09 AC-6: a head with no one to confirm does not stop the work past the deadline, which goes on flagged', async () => {
    const { staff } = await department('P-NOH', ['E']);
    const assignmentId = await seatOf(staff.E, await codeOfPerson(staff.E));
    await h.openDuties({
      leaverEmployeeId: staff.E.employeeId,
      source: 'DEPARTURE',
      lastWorkingDay: h.day(0),
      dueOn: h.day(-1),
      leaverIsHead: false,
    });
    const { taskId } = await h.open(assignmentId, 'DEPARTURE');

    await h.claim(taskId).expect(200);

    const row = (await h.dutyRows(assignmentId))[0];
    expect(row.proceeded_unconfirmed_at).not.toBeNull();
    expect(row.confirmed_value).toBeNull();
  });

  it('US-03-09 AC-8: the head who leaves is followed by the successor designated, who confirms before taking office and gets no other right by it', async () => {
    const { created, staff } = await department('P-LD', ['HL', 'H5']);
    await h.makeHead(created, staff.HL);
    await h.makeHeadFrom(created, staff.H5, h.day(5));
    const { id, assignmentId } = await leave(staff.HL, { leaverIsHead: true });

    expect((await h.dutyRows(assignmentId))[0]).toMatchObject({ leaver_is_head: true, resolve_on: h.day(5) });
    const asked = (await dutiesOf(staff.H5.account)).find((duty) => duty.id === id);
    expect(asked).toMatchObject({ canConfirm: true, waitingReason: null, role: 'DEPARTMENT_HEAD' });
    // The head who leaves is not who confirms, even while they still head the department.
    expect(await dutiesOf(staff.HL.account)).toEqual([]);
    expect(h.codeOf(await h.confirmDuty(id, { value: 'HANDED_OVER' }, staff.HL.account).expect(403))).toBe(
      'HANDOVER_DUTY.NOT_CONFIRMER',
    );
    const before = h.dataOf(await request(h.server()).get('/api/v1/me').set(h.as(staff.H5.account)).expect(200));

    const done = await h.confirmDuty(id, { value: 'HANDED_OVER' }, staff.H5.account).expect(201);

    expect(h.dataOf<DutyWire>(done)).toMatchObject({
      status: 'CONFIRMED',
      confirmation: { role: 'DESIGNATED_SUCCESSOR', confirmedBy: { id: staff.H5.employeeId } },
    });
    expect(await h.auditActions(id)).toEqual(['HANDOVER_DUTY.OPENED', 'HANDOVER_DUTY.CONFIRMED']);
    // Confirming grants nothing: what the person may do is what their own periods give, before and after.
    expect(h.dataOf(await request(h.server()).get('/api/v1/me').set(h.as(staff.H5.account)).expect(200))).toEqual(
      before,
    );
  });

  it('US-03-09 AC-10: a head who leaves with no successor designated leaves the duty waiting, and the one designated later takes it with its deadline', async () => {
    const { created, staff } = await department('P-NS', ['HL', 'H5', 'E']);
    await h.makeHead(created, staff.HL);
    const { id, assignmentId } = await leave(staff.HL, { leaverIsHead: true });

    const waiting = (await dutiesOf(h.it1, '&scope=all')).find((duty) => duty.id === id);
    expect(waiting).toMatchObject({ waitingReason: 'NO_SUCCESSOR', canConfirm: false, dueOn: h.day(3) });
    for (const account of [h.it1, staff.HL.account, staff.E.account, staff.H5.account]) {
      expect(h.codeOf(await h.confirmDuty(id, { value: 'HANDED_OVER' }, account).expect(403))).toBe(
        'HANDOVER_DUTY.NOT_CONFIRMER',
      );
    }

    await h.makeHeadFrom(created, staff.H5, h.day(5));

    expect((await dutiesOf(h.it1, '&scope=all')).find((duty) => duty.id === id)).toMatchObject({
      waitingReason: null,
      dueOn: h.day(3),
    });
    expect((await dutiesOf(staff.H5.account)).map((duty) => duty.id)).toEqual([id]);
    await h.confirmDuty(id, { value: 'NOT_NEEDED' }, staff.H5.account).expect(201);
    expect((await h.dutyRows(assignmentId))[0]).toMatchObject({
      confirmed_by_employee_id: staff.H5.employeeId,
      confirmed_role: 'DESIGNATED_SUCCESSOR',
    });
  });

  it('US-03-09 AC-10: with nobody confirming, the work goes on after the deadline flagged', async () => {
    const { created, staff } = await department('P-NF', ['HL']);
    await h.makeHead(created, staff.HL);
    const assignmentId = await seatOf(staff.HL, await codeOfPerson(staff.HL));
    await h.openDuties({
      leaverEmployeeId: staff.HL.employeeId,
      source: 'DEPARTURE',
      lastWorkingDay: h.day(0),
      dueOn: h.day(-1),
      leaverIsHead: true,
    });
    const { taskId } = await h.open(assignmentId, 'DEPARTURE');

    await h.claim(taskId).expect(200);
    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã gỡ' }).expect(200);

    const row = (await h.dutyRows(assignmentId))[0];
    expect(row.confirmed_value).toBeNull();
    expect(row.proceeded_unconfirmed_at).not.toBeNull();
    expect((await h.assignmentRow(assignmentId)).valid_until).not.toBeNull();
  });
});
