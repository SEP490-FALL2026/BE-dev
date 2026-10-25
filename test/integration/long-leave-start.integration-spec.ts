import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { LeaveHarness, type LeaveWire } from '../support/leave-harness';
import type { Department, Person } from '../support/request-harness';

const h = new LeaveHarness();

/** US-03-03 AC-5 (and the states a long leave may begin from): recording the start of a long leave, over HTTP, on real PostgreSQL. */
describe('recording the start of a long leave (integration, real PostgreSQL)', () => {
  let des: Department;
  let sequence = 0;
  const code = (prefix: string) => `${prefix}${(sequence += 1)}`;
  const body = (employeeId: string, extra: object = {}) => ({
    employeeId,
    startedOn: h.day(-30),
    approvedReturnOn: h.day(60),
    grounds: h.approval,
    ...extra,
  });
  const nothingWritten = async (person: Person) => ({
    leaves: (await h.leavesOf(person.employeeId)).length,
    state: await h.workState(person.employeeId),
  });

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('L-DES');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('puts the person on long leave with the basis kept in the Audit Trail and no verification record (AC-5)', async () => {
    const person = await h.worker(des, code('E'));

    const wire = await h.started(body(person.employeeId));

    expect(wire).toMatchObject({
      status: 'ACTIVE',
      startedOn: h.day(-30),
      approvedReturnOn: h.day(60),
      endedOn: null,
      overdueReturn: false,
      grounds: h.approval,
      selfExecuted: false,
      employee: { id: person.employeeId },
    });
    expect(await h.workState(person.employeeId)).toBe('ON_LONG_LEAVE');
    const [event] = await h.auditEventsOf('LONG_LEAVE.STARTED', wire.id);
    expect(event.after).toMatchObject({ workState: 'ON_LONG_LEAVE', grounds: h.approval, approvedReturnOn: h.day(60) });
    expect(await h.changeRows(wire.id)).toEqual([{ kind: 'STARTED' }]);
    const tables = await h.ctx.sql.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%leave%verification%'`,
    );
    expect(tables.rows).toEqual([]);
    // Recorded straight from a document, the leave names no notice (the notices have a verification of their own).
    const origin = await h.ctx.sql.query(`SELECT notice_id FROM employee_leaves WHERE id = $1`, [wire.id]);
    expect(origin.rows).toEqual([{ notice_id: null }]);
  });

  it('is read back in the list, the detail and the log', async () => {
    const person = await h.worker(des, code('E'));
    const wire = await h.started(body(person.employeeId, { startedOn: h.today() }));

    const list = h.dataOf<{ items: LeaveWire[] }>(await h.listLeaves(`?employeeId=${person.employeeId}`));
    const detail = h.dataOf<LeaveWire>(await h.readLeave(wire.id));
    const log = h.dataOf<{ items: { kind: string; newReturnOn: string; grounds: object }[] }>(
      await h.leaveChanges(wire.id),
    );

    expect(list.items.map((item) => item.id)).toEqual([wire.id]);
    expect(detail.id).toBe(wire.id);
    expect(log.items).toMatchObject([{ kind: 'STARTED', newReturnOn: h.day(60), grounds: h.approval }]);
  });

  it('shows the work state in the members of the department: on leave for the one away, working for the other', async () => {
    const awayCode = code('E');
    const workingCode = code('E');
    const away = await h.worker(des, awayCode);
    await h.worker(des, workingCode);
    await h.started(body(away.employeeId));

    const members = h.dataOf<{ items: { employeeCode: string; workState: string }[] }>(
      await request(h.server())
        .get(`/api/v1/departments/${des.id}/employees?pageSize=100`)
        .set(h.as(h.it1))
        .expect(200),
    ).items;

    expect(Object.fromEntries(members.map((member) => [member.employeeCode, member.workState]))).toMatchObject({
      [awayCode]: 'ON_LONG_LEAVE',
      [workingCode]: 'WORKING',
    });
  });

  describe('refuses what is not a basis, and writes nothing', () => {
    it.each([
      ['no basis', undefined, 'LONG_LEAVE.GROUNDS_REQUIRED'],
      ['an empty basis', {}, 'LONG_LEAVE.GROUNDS_REQUIRED'],
      [
        'a basis without the issuer',
        { type: 'X', reference: 'Y', issuedOn: '2026-05-25' },
        'LONG_LEAVE.GROUNDS_INCOMPLETE',
      ],
      [
        'only the code of a notice',
        { ...{ type: 'X', issuer: 'HR', issuedOn: '2026-05-25' }, reference: 'BM09-2026-000123' },
        'LONG_LEAVE.GROUNDS_IS_NOTICE',
      ],
    ])('%s', async (_name, grounds, expected) => {
      const person = await h.worker(des, code('E'));
      const before = await nothingWritten(person);

      const response = await h.startLeave(body(person.employeeId, { grounds }));

      expect([response.status, h.codeOf(response)]).toEqual([422, expected]);
      expect(await nothingWritten(person)).toEqual(before);
    });

    it('names the parts the basis lacks', async () => {
      const person = await h.worker(des, code('E'));

      const response = await h.startLeave(
        body(person.employeeId, { grounds: { type: 'X', reference: 'Y', issuedOn: '2026-05-25' } }),
      );

      expect((response.body as { error: { details: unknown } }).error.details).toEqual({ missing: ['issuer'] });
    });

    it.each([['reason'], ['medical'], ['diagnosis']])(
      'refuses a field %s, so no reason for a leave is kept',
      async (field) => {
        const person = await h.worker(des, code('E'));
        const before = await nothingWritten(person);

        const response = await h.startLeave(body(person.employeeId, { [field]: 'whatever' }));

        expect([response.status, h.codeOf(response)]).toEqual([422, 'VALIDATION_ERROR']);
        expect(await nothingWritten(person)).toEqual(before);
      },
    );
  });

  describe('judges the days', () => {
    it.each([
      [
        'a start in the future',
        () => ({ startedOn: h.day(1), approvedReturnOn: h.day(60) }),
        'LONG_LEAVE.START_DATE_INVALID',
      ],
      ['a start before the person joined', () => ({ startedOn: '2019-12-31' }), 'LONG_LEAVE.START_DATE_INVALID'],
      ['a return on the day it starts', () => ({ approvedReturnOn: h.day(-30) }), 'LONG_LEAVE.RETURN_DATE_INVALID'],
      ['a return before the start', () => ({ approvedReturnOn: h.day(-40) }), 'LONG_LEAVE.RETURN_DATE_INVALID'],
    ])('refuses %s', async (_name, extra, expected) => {
      const person = await h.worker(des, code('E'));
      const before = await nothingWritten(person);

      const response = await h.startLeave(body(person.employeeId, extra()));

      expect([response.status, h.codeOf(response)]).toEqual([422, expected]);
      expect(await nothingWritten(person)).toEqual(before);
    });

    it('takes a leave that began today', async () => {
      const person = await h.worker(des, code('E'));

      await h.started(body(person.employeeId, { startedOn: h.today() }));

      expect(await h.workState(person.employeeId)).toBe('ON_LONG_LEAVE');
    });
  });

  describe('the states a person may begin a leave from', () => {
    it('refuses a person who is on leave already, a person who hands over and a person who has left', async () => {
      const onLeave = await h.worker(des, code('E'));
      await h.started(body(onLeave.employeeId));
      const handing = await h.worker(des, code('E'));
      await h.ctx.sql.query(`UPDATE employees SET work_state = 'HANDING_OVER' WHERE id = $1`, [handing.employeeId]);
      const gone = await h.worker(des, code('E'));
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [gone.employeeId]);

      const results = [
        await h.startLeave(body(onLeave.employeeId)),
        await h.startLeave(body(handing.employeeId)),
        await h.startLeave(body(gone.employeeId)),
        await h.startLeave(body(randomUUID())),
      ].map((response) => [response.status, h.codeOf(response)]);

      expect(results).toEqual([
        [409, 'LONG_LEAVE.ALREADY_ON_LEAVE'],
        [409, 'LONG_LEAVE.EMPLOYEE_NOT_WORKING'],
        [409, 'LONG_LEAVE.EMPLOYEE_NOT_WORKING'],
        [404, 'LONG_LEAVE.EMPLOYEE_NOT_FOUND'],
      ]);
      expect((await h.leavesOf(onLeave.employeeId)).length).toBe(1);
      expect((await h.leavesOf(handing.employeeId)).length).toBe(0);
      expect((await h.leavesOf(gone.employeeId)).length).toBe(0);
    });

    it('lets only one of two concurrent starts of the same person through', async () => {
      const person = await h.worker(des, code('E'));

      const responses = await Promise.all([
        h.startLeave(body(person.employeeId)),
        h.startLeave(body(person.employeeId)),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect((await h.leavesOf(person.employeeId)).length).toBe(1);
    });
  });

  describe('an IT Admin recording a leave about themselves (SoD-5)', () => {
    it('is accepted and flagged for the Super Admin while they are the only one, as is their return', async () => {
      const wire = await h.started(body(h.it1.employeeId, { startedOn: h.today() }));

      expect(wire.selfExecuted).toBe(true);
      expect((await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).length).toBe(1);

      await h.confirmReturn(wire.id, { returnedOn: h.today(), grounds: h.extension }).expect(200);
      expect((await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).length).toBe(2);
      expect(await h.workState(h.it1.employeeId)).toBe('WORKING');
    });

    it('is refused while another IT Admin can act, accepted from the other one, and never flagged then', async () => {
      const it2 = await h.worker(des, 'E-IT2L', ['IT_ADMIN']);

      const own = await h.startLeave(body(h.it1.employeeId));
      expect([own.status, h.codeOf(own)]).toEqual([409, 'LONG_LEAVE.SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN']);
      const wire = await h.started(body(h.it1.employeeId), it2.account);

      expect(wire.selfExecuted).toBe(false);
      expect(await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).toEqual([]);
    });
  });
});
