import { randomUUID } from 'node:crypto';
import { PgRelay } from '../support/pg-relay';
import { dataStatements, QueryCounter } from '../support/query-count';
import type { Department, Person } from '../support/request-harness';
import { ServiceAccountHandoverHarness, type DutyWire } from '../support/service-account-handover-harness';
import type { CaseWire } from '../support/offboarding-harness';
import type { TransferWire } from '../support/transfer-harness';

const h = new ServiceAccountHandoverHarness();

/**
 * US-03-08 AC-1, AC-4, AC-5, AC-6, AC-7, AC-9, US-03-01 AC-9, US-03-04 AC-17: the service accounts that need a new person before a
 * transfer or a departure, over HTTP, on real PostgreSQL (case E1 answers for ci-bot and release-bot of P-DES and goes to P-FIN).
 */
describe('the service accounts of a person who is transferred or leaves (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let des: Department;
  let fin: Department;
  let head: Person;
  let seq = 0;
  let subscription: string;
  const code = (prefix = 'E') => `${prefix}-SD-${(seq += 1)}`;
  const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token thiết bị' };

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
    head = await h.worker(des, 'H1-SD');
    await h.makeHead(des, head);
    // Every account of the suite answers to a person of P-DES, so the subscription is P-DES's: a seat sits only on a subscription
    // of its own department (F20), and a subscription always has an owner department (F02).
    subscription = await h.subscription(400, 'K2', des.id);
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** A person of P-DES who answers for two service accounts. */
  const owner = async () => {
    const employeeCode = code();
    const person = await h.worker(des, employeeCode);
    const ci = await h.botOf(person, subscription, `ci-bot-${employeeCode}`, employeeCode);
    const release = await h.botOf(person, subscription, `release-bot-${employeeCode}`, employeeCode);

    return { person, ci, release };
  };
  const change = (assignmentId: string, to: Person, effectiveFrom: string, account = h.it1) =>
    h.changeResponsibleOf(assignmentId, { employeeId: to.employeeId, effectiveFrom }, account);
  const transferOf = (person: Person, extra: object = {}) =>
    h.recorded({
      employeeId: person.employeeId,
      toDepartmentId: fin.id,
      effectiveOn: h.day(10),
      grounds: h.grounds,
      ...extra,
    });

  it('records the transfer without waiting, tells the IT Admin which accounts need a person before the day, and takes none away (AC-1, US-03-01 AC-9)', async () => {
    const { person, ci, release } = await owner();
    const tasks = await h.taskCount();

    const transfer = await transferOf(person);

    expect(transfer).toMatchObject({ status: 'PENDING', effectiveOn: h.day(10) });
    const [event] = await h.auditEventsOf('SERVICE_ACCOUNT_DUTY.OPENED', person.employeeId);
    expect(event.actor_kind).toBe('SYSTEM');
    expect(event.after).toMatchObject({ fileKind: 'TRANSFER', fileId: transfer.id, dueOn: h.day(10), count: 2 });
    expect(((event.after as { assignmentIds: string[] }).assignmentIds ?? []).sort()).toEqual([ci, release].sort());
    expect(JSON.stringify(event)).not.toContain('ci-bot');
    const rows = await h.serviceDuties(`?employeeId=${person.employeeId}`);
    expect(rows.map((row) => row.assignmentId).sort()).toEqual([ci, release].sort());
    expect(rows[0]).toMatchObject({
      dueOn: h.day(10),
      fileKind: 'TRANSFER',
      fileId: transfer.id,
      overdue: false,
      owningDepartment: { id: des.id, code: 'P-DES' },
      responsible: { employeeId: person.employeeId },
    });
    expect(await h.taskCount()).toBe(tasks);
    const early = await h.closeTransfer(transfer.id);
    expect([early.status, h.codeOf(early)]).toEqual([409, 'DEPARTMENT_TRANSFER.NOT_CLOSEABLE']);
    expect(h.detailsOf(early).blockers).toEqual(['NOT_EFFECTIVE']);
  });

  it('names a person for one account and keeps the chain, the seats taken and the owner; the other account still waits (AC-4, AC-6)', async () => {
    const { person, ci, release } = await owner();
    const e5 = await h.worker(des, code());
    await transferOf(person);
    const days = [h.today(), h.day(4), h.day(5), h.day(9)];
    const before = await Promise.all(days.map((day) => h.seatsTaken(subscription, day)));
    const tasks = await h.taskCount();

    const response = await change(ci, e5, h.day(5));

    expect(response.status).toBe(200);
    const [old, next] = await h.chainOf(ci);
    expect(old).toMatchObject({ employee_id: person.employeeId, valid_until: h.day(5) });
    expect(next).toMatchObject({
      employee_id: e5.employeeId,
      valid_from: h.day(5),
      valid_until: null,
      predecessor_id: ci,
      source: 'HANDOVER',
      owning_department_id: des.id,
      cost_center_id: await h.unitOf(des),
    });
    expect(await Promise.all(days.map((day) => h.seatsTaken(subscription, day)))).toEqual(before);
    expect(await h.taskCount()).toBe(tasks);
    const actions = (await h.auditOf('LicenseAssignment')).filter((event) => [ci, next.id].includes(event.resource_id));
    expect(actions.map((event) => event.action)).toEqual(
      expect.arrayContaining(['LICENSE_ASSIGNMENT.ENDED', 'LICENSE_ASSIGNMENT.CREATED']),
    );
    expect(JSON.stringify(actions)).not.toContain('ci-bot');
    const rows = await h.serviceDuties(`?employeeId=${person.employeeId}`);
    expect(rows.map((row) => row.assignmentId)).toEqual([release]);
    expect((await h.chainOf(release)).length).toBe(1);
  });

  it('refuses a day after the day of the file, takes the day itself, and follows the file when its day moves (US-03-01 AC-9)', async () => {
    const { person, ci, release } = await owner();
    const e5 = await h.worker(des, code());
    const transfer = await transferOf(person);

    const late = await change(ci, e5, h.day(11));
    expect([late.status, h.codeOf(late)]).toEqual([409, 'LICENSE_ASSIGNMENT.RESPONSIBLE_AFTER_DEADLINE']);
    expect(h.detailsOf(late)).toEqual({ dueOn: h.day(10) });
    expect((await h.chainOf(ci)).length).toBe(1);
    await change(release, e5, h.day(10)).expect(200);

    await h
      .rescheduleTransfer(transfer.id, { newEffectiveOn: h.day(20), reason: 'Dời ngày', grounds: h.grounds })
      .expect(200);
    await change(ci, e5, h.day(15)).expect(200);
    expect((await h.chainOf(ci)).length).toBe(2);
    expect(await h.serviceDuties(`?employeeId=${person.employeeId}`)).toEqual([]);
    const [first, second] = await h.auditEventsOf('SERVICE_ACCOUNT_DUTY.OPENED', person.employeeId);
    expect(first.after).toMatchObject({ dueOn: h.day(10), count: 2 });
    expect(second.after).toMatchObject({ dueOn: h.day(20), count: 1 });
  });

  it('refuses the person who left, the one handing over, and one of another department, and changes nothing (AC-7)', async () => {
    const { person, ci } = await owner();
    await transferOf(person);
    const left = await h.worker(des, code());
    await h.recordedCase(left, { abrupt: true, lastWorkingDay: h.today() });
    const handing = await h.worker(des, code());
    await h.recordedCase(handing);
    const foreign = await h.worker(fin, code());

    for (const [to, problem] of [
      [left, 'NOT_ACTIVE'],
      [handing, 'HANDING_OVER'],
      [foreign, 'OUTSIDE_OWNING_DEPARTMENT'],
    ] as const) {
      const response = await change(ci, to, h.day(5));
      expect([response.status, h.codeOf(response), h.detailsOf(response)]).toEqual([
        422,
        'LICENSE_ASSIGNMENT.RESPONSIBLE_INVALID',
        { problem },
      ]);
    }
    const [only] = await h.chainOf(ci);
    expect(only).toMatchObject({ employee_id: person.employeeId, valid_until: null });
    expect((await h.chainOf(ci)).length).toBe(1);
  });

  it('lets only the IT Admin name the person: a head, Finance and an employee are refused and nothing changes (AC-9)', async () => {
    const { person, ci } = await owner();
    const e5 = await h.worker(des, code());

    for (const account of [head.account, h.finance, e5.account]) {
      const response = await change(ci, e5, h.day(5), account);
      expect([response.status, h.codeOf(response)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    }
    expect(await h.chainOf(ci)).toHaveLength(1);
    expect((await h.chainOf(ci))[0].employee_id).toBe(person.employeeId);
  });

  it('closes the transfer only when it has taken effect and no account waits on the person (AC-5, BM-04)', async () => {
    const { person, ci, release } = await owner();
    const e5 = await h.worker(des, code());
    const transfer = await transferOf(person, { effectiveOn: h.today() });
    expect(transfer.status).toBe('EFFECTIVE');

    const blocked = await h.closeTransfer(transfer.id);
    expect([blocked.status, h.codeOf(blocked)]).toEqual([409, 'DEPARTMENT_TRANSFER.NOT_CLOSEABLE']);
    expect(h.detailsOf(blocked)).toEqual({ blockers: ['SERVICE_ACCOUNT_UNASSIGNED'], serviceAccounts: 2 });
    await change(ci, e5, h.today()).expect(200);
    expect(h.detailsOf(await h.closeTransfer(transfer.id).expect(409)).serviceAccounts).toBe(1);
    await change(release, e5, h.today()).expect(200);

    const closed = h.dataOf<TransferWire & { closure: { closedAt: string } | null }>(
      await h.closeTransfer(transfer.id).expect(200),
    );
    expect(closed.closure).not.toBeNull();
    const twice = await h.closeTransfer(transfer.id);
    expect([twice.status, h.codeOf(twice)]).toEqual([409, 'DEPARTMENT_TRANSFER.ALREADY_CLOSED']);
    expect((await h.auditEventsOf('DEPARTMENT_TRANSFER.CLOSED', transfer.id)).length).toBe(1);
    const asHead = await h.closeTransfer(transfer.id, head.account);
    expect(asHead.status).toBe(403);
    const missing = await h.closeTransfer(randomUUID());
    expect([missing.status, h.codeOf(missing)]).toEqual([404, 'DEPARTMENT_TRANSFER.NOT_FOUND']);
  });

  it('never closes a transfer that was cancelled, and a cancelled transfer stops being a duty (AC-1)', async () => {
    const { person } = await owner();
    const transfer = await transferOf(person);
    await h.cancelTransfer(transfer.id, { reason: 'Hủy điều chuyển', grounds: h.grounds }).expect(200);

    const response = await h.closeTransfer(transfer.id);

    expect([response.status, h.codeOf(response)]).toEqual([409, 'DEPARTMENT_TRANSFER.ALREADY_CANCELLED']);
    expect(await h.serviceDuties(`?employeeId=${person.employeeId}`)).toEqual([]);
  });

  describe('a person who leaves (AC-5, US-03-04 AC-17)', () => {
    it('is recorded with its accounts untouched, kept open by them, and closes once both have a person', async () => {
      const { person, ci, release } = await owner();
      const e5 = await h.worker(des, code());
      const tasks = await h.taskCount();

      const wire = await h.recordedCase(person);

      const [event] = await h.auditEventsOf('SERVICE_ACCOUNT_DUTY.OPENED', person.employeeId);
      expect(event.after).toMatchObject({ fileKind: 'OFFBOARDING', fileId: wire.id, dueOn: h.day(11), count: 2 });
      expect(await h.serviceDuties(`?employeeId=${person.employeeId}`)).toHaveLength(2);
      const rights = h.dataOf<{ items: { assignmentId: string }[] }>(await h.rightsOf(wire.id).expect(200)).items;
      expect(rights.map((right) => right.assignmentId)).not.toEqual(expect.arrayContaining([ci]));

      await h.markLeft(wire.id).expect(200);
      await h.lockAccount(wire.id, LOCK).expect(200);
      expect(h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200)).blockers).toEqual({
        SERVICE_ACCOUNT_UNASSIGNED: 2,
      });
      expect(await h.taskCount()).toBe(tasks);
      expect((await h.chainOf(ci))[0]).toMatchObject({ employee_id: person.employeeId, valid_until: null });
      const blocked = await h.closeCase(wire.id);
      expect([blocked.status, h.codeOf(blocked)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_CLOSEABLE']);
      expect(h.detailsOf(blocked).blockers).toEqual(['SERVICE_ACCOUNT_UNASSIGNED']);

      const late = await change(ci, e5, h.day(12));
      expect([late.status, h.codeOf(late)]).toEqual([409, 'LICENSE_ASSIGNMENT.RESPONSIBLE_AFTER_DEADLINE']);
      await change(ci, e5, h.day(5)).expect(200);
      expect(h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200)).blockers).toMatchObject({
        SERVICE_ACCOUNT_UNASSIGNED: 1,
      });
      expect(h.detailsOf(await h.closeCase(wire.id).expect(409)).blockers).toEqual(['SERVICE_ACCOUNT_UNASSIGNED']);
      await change(release, e5, h.day(11)).expect(200);

      const closed = h.dataOf<CaseWire>(await h.closeCase(wire.id).expect(200));
      expect(closed).toMatchObject({ closed: true, blockers: {} });
    });

    it('is told as overdue once for each account when its day passes without a person, and nothing is changed (AC-5)', async () => {
      const { person, ci, release } = await owner();
      const wire = await h.recordedCase(person, { abrupt: true, lastWorkingDay: h.today() });
      expect(wire.state).toBe('LEFT');
      await h.lockAccount(wire.id, LOCK).expect(200);
      const later = new Date(`${h.day(3)}T05:00:00.000Z`);

      await h.sweepOverdue(later);
      await h.sweepOverdue(later);

      for (const assignmentId of [ci, release]) {
        expect(await h.noticeCount(assignmentId)).toBe(1);
        const events = await h.auditEventsOf('SERVICE_ACCOUNT_DUTY.OVERDUE', assignmentId);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ actor_kind: 'SYSTEM', actor_app_user_id: null });
        expect(events[0].after).toMatchObject({
          employeeId: person.employeeId,
          fileKind: 'OFFBOARDING',
          fileId: wire.id,
        });
        expect((await h.chainOf(assignmentId))[0]).toMatchObject({ employee_id: person.employeeId, valid_until: null });
      }
      const restore = h.pretendToday(h.day(3));
      try {
        const overdue = await h.serviceDuties(`?employeeId=${person.employeeId}&overdue=true`);
        const notYet = await h.serviceDuties(`?employeeId=${person.employeeId}&overdue=false`);
        expect(overdue.map((row) => row.overdue)).toEqual([true, true]);
        expect(notYet).toEqual([]);
      } finally {
        restore();
      }
      const closing = await h.closeCase(wire.id);
      expect([closing.status, h.codeOf(closing)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_CLOSEABLE']);
      expect(h.detailsOf(closing).blockers).toEqual(['SERVICE_ACCOUNT_UNASSIGNED']);
    });
  });

  describe('the list', () => {
    it('pages the duties by the day and then the account, and reads in a fixed number of statements', async () => {
      const first = await owner();
      await transferOf(first.person, { effectiveOn: h.day(7) });
      const query = '?pageSize=100';
      const read = async () => {
        const run = await counter.run(() => h.listServiceDuties(query).expect(200));

        return {
          rows: h.dataOf<{ items: DutyWire[] }>(run.result).items,
          statements: dataStatements(run.statements).length,
        };
      };
      const small = await read();

      for (let index = 0; index < 3; index += 1) {
        const extra = await owner();
        await transferOf(extra.person, { effectiveOn: h.day(8 + index) });
      }
      const large = await read();

      expect(large.rows.length).toBeGreaterThanOrEqual(small.rows.length + 6);
      expect(large.statements).toBe(small.statements);
      const days = large.rows.map((row) => row.dueOn);
      expect([...days].sort()).toEqual(days);
      const second = h.dataOf<{ items: unknown[]; pagination: { totalItems: number; totalPages: number } }>(
        await h.listServiceDuties('?pageSize=2&page=2').expect(200),
      );
      expect(second.items).toHaveLength(2);
      expect(second.pagination.totalItems).toBe(large.rows.length);
    });

    it('lets only the IT Admin read it, and refuses a filter it does not know', async () => {
      const outsider = await h.worker(des, code());

      expect((await h.listServiceDuties('', outsider.account)).status).toBe(403);
      expect((await h.listServiceDuties('?overdue=maybe')).status).toBe(422);
      expect((await h.listServiceDuties('?pageSize=101')).status).toBe(422);
    });
  });
});
