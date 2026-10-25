import { randomUUID } from 'node:crypto';
import { PgRelay } from '../support/pg-relay';
import { dataStatements, QueryCounter } from '../support/query-count';
import type { Department, Person } from '../support/request-harness';
import { ServiceAccountHandoverHarness, type MoveWire } from '../support/service-account-handover-harness';

const h = new ServiceAccountHandoverHarness();

/**
 * US-03-08 AC-10: moving a service account to another department, proposed by the IT Admin and confirmed by the head of the receiving
 * department, over HTTP, on real PostgreSQL (case: ci-bot of P-DES goes to P-FIN with E6, effective on a day with a commitment K-2026 in P-DES).
 */
describe('moving a service account to another department (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let des: Department;
  let fin: Department;
  let ops: Department;
  let desHead: Person;
  let finHead: Person;
  let fallback: Person;
  let seq = 0;
  let subscription: string;
  const code = (prefix = 'E') => `${prefix}-SM-${(seq += 1)}`;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    ops = await h.departmentWithUnit('P-QA');
    desHead = await h.worker(des, 'H1-SM');
    await h.makeHead(des, desHead);
    finHead = await h.worker(fin, 'H2-SM');
    await h.makeHead(fin, finHead);
    fallback = await h.worker(des, 'F1-SM');
    await h.setRole('FALLBACK_APPROVER', fallback);
    subscription = await h.subscription(400, 'K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const bot = async (department: Department = des) => {
    const employeeCode = code();
    const person = await h.worker(department, employeeCode);
    const assignmentId = await h.botOf(person, subscription, `ci-bot-${employeeCode}`, employeeCode);

    return { person, assignmentId };
  };
  const body = (to: Person, extra: object = {}, department: Department = fin) => ({
    toDepartmentId: department.id,
    newResponsibleEmployeeId: to.employeeId,
    effectiveFrom: h.day(10),
    ...extra,
  });
  const proposed = async (assignmentId: string, to: Person, extra: object = {}, department: Department = fin) =>
    h.moveOf(await h.proposeMove(assignmentId, body(to, extra, department)).expect(201));

  it('waits as a proposal without touching the assignment, then the head of P-FIN confirms and the account moves with its seat (AC-10)', async () => {
    const { person, assignmentId } = await bot();
    const e6 = await h.worker(fin, code());
    const days = [h.today(), h.day(9), h.day(10), h.day(11)];
    const seats = await Promise.all(days.map((day) => h.seatsTaken(subscription, day)));
    const commitments = await h.count('budget_commitments');
    const tasks = await h.taskCount();

    const move = await proposed(assignmentId, e6);

    expect(move).toMatchObject({
      status: 'PENDING',
      assignmentId,
      currentResponsible: { employeeId: person.employeeId },
      fromDepartment: { id: des.id, code: 'P-DES' },
      toDepartment: { id: fin.id, code: 'P-FIN' },
      newResponsible: { employeeId: e6.employeeId },
      effectiveFrom: h.day(10),
      confirmation: null,
      cancellation: null,
      resultingAssignmentId: null,
    });
    expect(await h.chainOf(assignmentId)).toHaveLength(1);
    expect((await h.chainOf(assignmentId))[0]).toMatchObject({ valid_until: null, owning_department_id: des.id });
    expect((await h.auditEventsOf('SERVICE_ACCOUNT_MOVE.PROPOSED', move.id)).length).toBe(1);

    const confirmed = h.moveOf(await h.confirmMove(move.id, finHead.account).expect(201));

    expect(confirmed).toMatchObject({
      status: 'CONFIRMED',
      confirmation: { confirmedByEmployeeId: finHead.employeeId, role: 'DEPARTMENT_HEAD' },
    });
    const [old, next] = await h.chainOf(assignmentId);
    expect(old).toMatchObject({ employee_id: person.employeeId, owning_department_id: des.id, valid_until: h.day(10) });
    expect(next).toMatchObject({
      id: confirmed.resultingAssignmentId,
      employee_id: e6.employeeId,
      owning_department_id: fin.id,
      cost_center_id: await h.unitOf(fin),
      valid_from: h.day(10),
      valid_until: null,
      predecessor_id: assignmentId,
      source: 'HANDOVER',
    });
    expect(old.cost_center_id).toBe(await h.unitOf(des));
    expect(await Promise.all(days.map((day) => h.seatsTaken(subscription, day)))).toEqual(seats);
    expect(await h.taskCount()).toBe(tasks);
    expect(await h.count('budget_commitments')).toBe(commitments);
    expect(await h.moveRow(move.id)).toMatchObject({
      status: 'CONFIRMED',
      resulting_assignment_id: next.id,
      confirmed_by_role: 'DEPARTMENT_HEAD',
      confirmed_by_employee_id: finHead.employeeId,
    });
    const [event] = await h.auditEventsOf('SERVICE_ACCOUNT_MOVE.CONFIRMED', move.id);
    expect(event.after).toMatchObject({
      confirmedByEmployeeId: finHead.employeeId,
      confirmedByRole: 'DEPARTMENT_HEAD',
      fromDepartmentId: des.id,
      toDepartmentId: fin.id,
      effectiveFrom: h.day(10),
      resultingAssignmentId: next.id,
    });
    expect(event.after).toHaveProperty('proposedByAppUserId');
    const twice = await h.confirmMove(move.id, finHead.account);
    expect([twice.status, h.codeOf(twice)]).toEqual([409, 'SERVICE_ACCOUNT_MOVE.NOT_PENDING']);
  });

  it('turns away everyone but the head of the receiving department, and nothing is written (AC-10)', async () => {
    const { assignmentId } = await bot();
    const e6 = await h.worker(fin, code());
    const move = await proposed(assignmentId, e6);
    const outsider = await h.worker(fin, code());

    for (const account of [outsider.account, desHead.account, fallback.account, h.it1, h.finance, e6.account]) {
      const response = await h.confirmMove(move.id, account);
      expect([response.status, h.codeOf(response)]).toEqual([403, 'SERVICE_ACCOUNT_MOVE.NOT_CONFIRMER']);
    }
    expect(await h.chainOf(assignmentId)).toHaveLength(1);
    expect((await h.moveRow(move.id)).status).toBe('PENDING');
    const missing = await h.confirmMove(randomUUID(), finHead.account);
    expect([missing.status, h.codeOf(missing)]).toEqual([404, 'SERVICE_ACCOUNT_MOVE.NOT_FOUND']);
  });

  it('lets the fallback approver confirm into a department that has no head, and only then (AC-10)', async () => {
    const { assignmentId } = await bot();
    const o1 = await h.worker(ops, code());
    const move = await proposed(assignmentId, o1, {}, ops);

    const byHead = await h.confirmMove(move.id, finHead.account);
    expect([byHead.status, h.codeOf(byHead)]).toEqual([403, 'SERVICE_ACCOUNT_MOVE.NOT_CONFIRMER']);
    const confirmed = h.moveOf(await h.confirmMove(move.id, fallback.account).expect(201));

    expect(confirmed.confirmation).toMatchObject({
      confirmedByEmployeeId: fallback.employeeId,
      role: 'FALLBACK_APPROVER',
    });
    expect((await h.chainOf(assignmentId))[1]).toMatchObject({
      owning_department_id: ops.id,
      employee_id: o1.employeeId,
    });

    // Once the department has a head the fallback approver is no longer the confirmer.
    const second = await bot();
    const o2 = await h.worker(ops, code());
    const next = await proposed(second.assignmentId, o2, {}, ops);
    await h.makeHead(ops, o2);
    const refused = await h.confirmMove(next.id, fallback.account);
    expect([refused.status, h.codeOf(refused)]).toEqual([403, 'SERVICE_ACCOUNT_MOVE.NOT_CONFIRMER']);
    await h.confirmMove(next.id, o2.account).expect(201);
  });

  it('refuses a confirmation after the day the move takes effect, and the account stays where it is (AC-10)', async () => {
    const { assignmentId } = await bot();
    const e6 = await h.worker(fin, code());
    const move = await proposed(assignmentId, e6, { effectiveFrom: h.day(2) });
    const restore = h.pretendToday(h.day(3));
    try {
      const response = await h.confirmMove(move.id, finHead.account);

      expect([response.status, h.codeOf(response)]).toEqual([409, 'SERVICE_ACCOUNT_MOVE.MOVE_EFFECTIVE_DATE_PASSED']);
    } finally {
      restore();
    }
    expect(await h.chainOf(assignmentId)).toHaveLength(1);
    expect((await h.moveRow(move.id)).status).toBe('PENDING');
  });

  it('is cancelled by the IT Admin with a reason, once, and a cancelled proposal cannot be confirmed', async () => {
    const { assignmentId } = await bot();
    const e6 = await h.worker(fin, code());
    const move = await proposed(assignmentId, e6);

    const noReason = await h.cancelMove(move.id, { reason: '  ' });
    expect([noReason.status, h.codeOf(noReason)]).toEqual([422, 'SERVICE_ACCOUNT_MOVE.REASON_REQUIRED']);
    expect((await h.cancelMove(move.id, { reason: 'Nhầm' }, finHead.account)).status).toBe(403);
    const cancelled = h.moveOf(await h.cancelMove(move.id, { reason: 'Đề xuất nhầm phòng' }).expect(200));

    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancellation: { reason: 'Đề xuất nhầm phòng' } });
    const again = await h.cancelMove(move.id, { reason: 'Lần nữa' });
    expect([again.status, h.codeOf(again)]).toEqual([409, 'SERVICE_ACCOUNT_MOVE.NOT_PENDING']);
    const confirm = await h.confirmMove(move.id, finHead.account);
    expect([confirm.status, h.codeOf(confirm)]).toEqual([409, 'SERVICE_ACCOUNT_MOVE.NOT_PENDING']);
    expect(await h.chainOf(assignmentId)).toHaveLength(1);
    expect((await h.auditEventsOf('SERVICE_ACCOUNT_MOVE.CANCELLED', move.id)).length).toBe(1);
    // A new proposal may follow a cancelled one.
    await proposed(assignmentId, e6);
  });

  it('refuses a proposal the department or the person cannot take, a second one, and a seat that is not a service account', async () => {
    const { assignmentId } = await bot();
    const e6 = await h.worker(fin, code());
    const ownCode = code();
    const own = await h.worker(des, ownCode);
    const personal = await h.seatOf(own, { subscriptionId: subscription }, ownCode);
    const handing = await h.worker(fin, code());
    await h.recordedCase(handing);
    const ended = await bot();
    await h
      .changeResponsibleOf(ended.assignmentId, { employeeId: own.employeeId, effectiveFrom: h.today() })
      .expect(200);

    const refusal = async (extra: object, to: Person = e6, department: Department = fin, id = assignmentId) => {
      const response = await h.proposeMove(id, body(to, extra, department));

      const error = (response.body as { error?: { code: string; details?: unknown } }).error;

      return [response.status, error?.code ?? null, error?.details ?? null];
    };

    expect(await refusal({}, own, des)).toEqual([
      422,
      'SERVICE_ACCOUNT_MOVE.TARGET_DEPARTMENT_INVALID',
      { reason: 'SAME_AS_OWNING' },
    ]);
    expect(await refusal({ toDepartmentId: randomUUID() })).toEqual([
      422,
      'SERVICE_ACCOUNT_MOVE.TARGET_DEPARTMENT_INVALID',
      { reason: 'NOT_FOUND' },
    ]);
    expect(await refusal({}, own)).toEqual([
      422,
      'SERVICE_ACCOUNT_MOVE.RESPONSIBLE_INVALID',
      { reason: 'OUTSIDE_TARGET_DEPARTMENT' },
    ]);
    expect(await refusal({}, handing)).toEqual([
      422,
      'SERVICE_ACCOUNT_MOVE.RESPONSIBLE_INVALID',
      { reason: 'HANDING_OVER' },
    ]);
    expect(await refusal({ newResponsibleEmployeeId: randomUUID() })).toEqual([
      422,
      'SERVICE_ACCOUNT_MOVE.RESPONSIBLE_INVALID',
      { reason: 'NOT_FOUND' },
    ]);
    expect(await refusal({ effectiveFrom: h.day(-1) })).toEqual([
      422,
      'LICENSE_ASSIGNMENT.EFFECTIVE_DATE_INVALID',
      { problem: 'IN_THE_PAST' },
    ]);
    expect((await refusal({}, e6, fin, randomUUID()))[0]).toBe(404);
    expect(await refusal({}, e6, fin, personal)).toEqual([422, 'LICENSE_ASSIGNMENT.NOT_SERVICE_ACCOUNT', null]);
    expect(await refusal({}, e6, fin, ended.assignmentId)).toEqual([409, 'LICENSE_ASSIGNMENT.NOT_OPEN', null]);

    await proposed(assignmentId, e6);
    expect(await refusal({})).toEqual([409, 'SERVICE_ACCOUNT_MOVE.PENDING_EXISTS', null]);

    // The day may not be later than the day the person who answers for the account is transferred or leaves.
    const other = await bot();
    await h.recorded({
      employeeId: other.person.employeeId,
      toDepartmentId: ops.id,
      effectiveOn: h.day(5),
      grounds: h.grounds,
    });
    const late = await refusal({ effectiveFrom: h.day(6) }, e6, fin, other.assignmentId);
    expect([late[0], late[1]]).toEqual([409, 'LICENSE_ASSIGNMENT.RESPONSIBLE_AFTER_DEADLINE']);
    expect((await refusal({ effectiveFrom: h.day(5) }, e6, fin, other.assignmentId))[0]).toBe(201);
  });

  describe('the list', () => {
    it('shows the IT Admin every proposal, the head of a department only what waits for them, and nothing to anyone else', async () => {
      const e6 = await h.worker(fin, code());
      // A department that has no head, whatever the other tests made of the first.
      const lab = await h.departmentWithUnit('P-ZZ1');
      const o1 = await h.worker(lab, code());
      const toFin = await proposed((await bot()).assignmentId, e6);
      const toOps = await proposed((await bot()).assignmentId, o1, {}, lab);
      const done = await proposed((await bot()).assignmentId, e6);
      await h.confirmMove(done.id, finHead.account).expect(201);
      const idsOf = async (account = h.it1, query = '') =>
        h
          .dataOf<{ items: MoveWire[] }>(await h.listMoves(`?pageSize=100${query}`, account).expect(200))
          .items.map((item) => item.id);

      const all = await idsOf();
      expect(all).toEqual(expect.arrayContaining([toFin.id, toOps.id, done.id]));
      expect(await idsOf(h.it1, '&status=CONFIRMED')).toEqual(expect.arrayContaining([done.id]));
      expect(await idsOf(h.it1, '&status=CONFIRMED')).not.toContain(toFin.id);
      const forFinHead = await idsOf(finHead.account);
      expect(forFinHead).toContain(toFin.id);
      expect(forFinHead).not.toContain(toOps.id);
      expect(forFinHead).not.toContain(done.id);
      const forFallback = await idsOf(fallback.account);
      expect(forFallback).toContain(toOps.id);
      expect(forFallback).not.toContain(toFin.id);
      expect(await idsOf(desHead.account)).toEqual([]);
      expect(await idsOf((await h.worker(fin, code())).account)).toEqual([]);
      expect((await h.listMoves('?status=DONE')).status).toBe(422);
    });

    it('reads in a fixed number of statements however many proposals the page holds, in a stable order', async () => {
      const e6 = await h.worker(fin, code());
      await proposed((await bot()).assignmentId, e6, { effectiveFrom: h.day(20) });
      const read = async (account = h.it1) => {
        const run = await counter.run(() => h.listMoves('?pageSize=100', account).expect(200));

        return {
          rows: h.dataOf<{ items: MoveWire[] }>(run.result).items,
          statements: dataStatements(run.statements).length,
        };
      };
      const small = await read();
      const smallHead = await read(finHead.account);

      for (let index = 0; index < 4; index += 1)
        await proposed((await bot()).assignmentId, e6, { effectiveFrom: h.day(21 + index) });
      const large = await read();
      const largeHead = await read(finHead.account);

      expect(large.rows.length).toBeGreaterThanOrEqual(small.rows.length + 4);
      expect(large.statements).toBe(small.statements);
      expect(largeHead.statements).toBe(smallHead.statements);
      const days = large.rows.map((row) => `${row.effectiveFrom}|${row.id}`);
      expect([...days].sort()).toEqual(days);
    });
  });
});
