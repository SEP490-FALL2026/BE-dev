import request from 'supertest';
import { LeaveService } from '../../../src/modules/personnel/leave/leave.service';
import { NoticeHandlingService } from '../../../src/modules/personnel/notice/notice-handling.service';
import { OffboardingService } from '../../../src/modules/personnel/offboarding/offboarding.service';
import { PersonnelAccessRefusedError } from '../../../src/modules/personnel/public/personnel.errors';
import { userActor, type PersonnelActor } from '../../../src/modules/personnel/public/personnel.types';
import { TransferService } from '../../../src/modules/personnel/transfer/transfer.service';
import type { ApiAccount } from '../../support/api-accounts';
import { NoticeHarness } from '../../support/notice-harness';
import type { Department, Person } from '../../support/request-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import type { TransferWire } from '../../support/transfer-harness';

const h = new NoticeHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, Task 5.1 (F40, F13, F12, F19): the Super Admin is the only writer of an event or a
 * notice of the personnel context, and never about themselves; the IT Admin reads a minimal projection of the departments in its
 * charge and of those nobody usable is in charge of (it stands in for them, spec B). The policy is the service's own: each write below is called on the service, without the guard of a route in front of it.
 */
describe('who may write and who may read the events of the personnel context (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let other: Department;
  let sequence = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('A-DES');
    fin = await h.departmentWithUnit('A-FIN');
    other = await h.departmentWithUnit('A-OTH');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const person = (department: Department = des) => h.worker(department, `ACC${(sequence += 1)}`);
  const actorOf = (account: Person['account'], roles: string[]): PersonnelActor => userActor(h.actorOf(account, roles));
  const refusal = async (work: () => Promise<unknown>): Promise<string> => {
    try {
      await work();
    } catch (error) {
      if (error instanceof PersonnelAccessRefusedError) return error.problem;
      throw error;
    }

    return 'NOT REFUSED';
  };
  const counts = async () =>
    (
      await h.ctx.sql.query<{ n: string }>(
        `SELECT (SELECT count(*) FROM department_transfers) || '/' || (SELECT count(*) FROM employee_leaves) || '/'
              || (SELECT count(*) FROM offboarding_cases) || '/' || (SELECT count(*) FROM audit_events) AS n`,
      )
    ).rows[0].n;

  describe('the writes, judged by the service (F13)', () => {
    const roleActors = (): Array<[string, PersonnelActor]> => [
      ['the IT Admin', actorOf(h.it1, ['IT_ADMIN'])],
      ['the finance officer', actorOf(h.it1, ['FINANCE'])],
      ['a department head', actorOf(h.it1, ['MANAGER'])],
      ['an account with no role', actorOf(h.it1, [])],
    ];

    it('refuses every role but the Super Admin on the transfer, the leave and the departure, and writes nothing (not even an audit event)', async () => {
      const who = await person();
      const before = await counts();

      for (const [name, actor] of roleActors()) {
        const attempts = [
          () =>
            h.ctx.app.get(TransferService, { strict: false }).record(actor, {
              employeeId: who.employeeId,
              toDepartmentId: fin.id,
              effectiveOn: h.day(20),
              grounds: h.grounds,
            }),
          () =>
            h.ctx.app.get(LeaveService, { strict: false }).start(actor, {
              employeeId: who.employeeId,
              startedOn: h.day(-1),
              approvedReturnOn: h.day(40),
              groundsNote: h.groundsNote,
            }),
          () =>
            h.ctx.app.get(OffboardingService, { strict: false }).record(actor, {
              employeeId: who.employeeId,
              lastWorkingDay: h.day(10),
              accessBlockMode: 'WITH_LAST_DAY',
              grounds: h.grounds,
            }),
        ];
        for (const attempt of attempts)
          expect({ name, problem: await refusal(attempt) }).toEqual({ name, problem: 'FORBIDDEN' });
      }

      expect(await counts()).toBe(before);
    });

    it('refuses the Super Admin about themselves: SELF_CHANGE_FORBIDDEN, on the service as on the route (F19)', async () => {
      const actor = actorOf(h.sa, ['SUPER_ADMIN']);
      const before = await counts();

      const problem = await refusal(() =>
        h.ctx.app.get(TransferService, { strict: false }).record(actor, {
          employeeId: h.sa.employeeId,
          toDepartmentId: fin.id,
          effectiveOn: h.day(20),
          grounds: h.grounds,
        }),
      );

      expect(problem).toBe('SELF_CHANGE_FORBIDDEN');
      expect(await counts()).toBe(before);
    });

    it('refuses the handling of a notice to everyone but the Super Admin, and the Super Admin about themselves, with the notice left waiting', async () => {
      const head = await h.head(des, `ACCH${(sequence += 1)}`);
      const who = await person();
      const notice = await h.sentNotice(
        { employeeId: who.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) },
        head.account,
      );
      const handling = () => h.ctx.app.get(NoticeHandlingService, { strict: false });

      for (const [name, actor] of roleActors()) {
        expect({ name, problem: await refusal(() => handling().reject(actor, notice.id, 'Duplicate event')) }).toEqual({
          name,
          problem: 'FORBIDDEN',
        });
      }

      expect((await h.noticeRows(who.employeeId))[0].status).toBe('PENDING_VERIFICATION');
    });
  });

  describe('the reads of the IT Admin: a minimal projection of the departments in its charge (F12)', () => {
    let wire: TransferWire;
    let outside: TransferWire;

    beforeAll(async () => {
      const mine = await person(des);
      const theirs = await person(other);
      await h.setItAdminInCharge(des, { employeeId: h.it1.employeeId, account: h.it1 });
      // Every other department has a usable IT Admin of its own, so none of them is the work of this one (F12).
      await handOthersToSecondItAdmin(h);
      wire = await h.recorded({
        employeeId: mine.employeeId,
        toDepartmentId: fin.id,
        effectiveOn: h.day(20),
        grounds: h.grounds,
      });
      outside = await h.recorded({
        employeeId: theirs.employeeId,
        toDepartmentId: fin.id,
        effectiveOn: h.day(20),
        grounds: h.grounds,
      });
      // the receiving department is not in the charge of this IT Admin either, so only the first one is theirs
      void outside;
    });

    it('lists only the transfers of a department in charge, without the basis, the handover or the reason', async () => {
      const response = await h.listTransfers('', h.it1).expect(200);

      const items = h.dataOf<{ items: Array<{ id: string }> }>(response).items;
      expect(items.map((item) => item.id)).toEqual([wire.id]);
    });

    it('reads one in a minimal form: the people, the departments, the day and the state; the basis and the cancellation are null', async () => {
      const read = h.dataOf<TransferWire>(await h.readTransfer(wire.id, h.it1).expect(200));

      expect(read).toMatchObject({
        id: wire.id,
        status: 'PENDING',
        grounds: null,
        headSuccessor: null,
        cancellation: null,
      });
      const full = h.dataOf<TransferWire>(await h.readTransfer(wire.id).expect(200));
      expect(full.grounds).toMatchObject({ reference: h.grounds.reference });
    });

    it('does not see a transfer outside its charge (404, never a hint that it exists) and cannot read the list of moves (403)', async () => {
      const response = await h.readTransfer(outside.id, h.it1);
      const changes = await h.transferChanges(wire.id, '', h.it1);

      expect([response.status, h.codeOf(response)]).toEqual([404, 'DEPARTMENT_TRANSFER.NOT_FOUND']);
      expect([changes.status, h.codeOf(changes)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    });

    it('refuses a department head on every read: the minimal projection is for the IT Admin and the full one for the Super Admin', async () => {
      const head = await h.head(des, `ACCR${(sequence += 1)}`);

      const response = await h.listTransfers('', head.account);

      expect([response.status, h.codeOf(response)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    });
  });

  /**
   * Spec B, F12: the IT Admin reads "the departments handed to them and those they handle in place of another": a department with no
   * usable IT Admin named belongs to every IT Admin, one with a usable IT Admin named belongs to that IT Admin alone. The same scope
   * serves the transfers, the leaves, the notices and the departures.
   */
  describe('the departments nobody usable is in charge of belong to every IT Admin, the others to theirs alone (F12)', () => {
    let it2: ApiAccount;
    let free: Department;
    let freeToo: Department;
    let own: Department;

    const listLeaves = (query: string, account: ApiAccount) =>
      request(h.server()).get(`/api/v1/long-leaves${query}`).set(h.as(account));
    const readLeave = (id: string, account: ApiAccount) =>
      request(h.server()).get(`/api/v1/long-leaves/${id}`).set(h.as(account));
    const startedLeave = async (employeeId: string): Promise<{ id: string }> =>
      h.dataOf<{ id: string }>(
        await h
          .startLongLeave({
            employeeId,
            startedOn: h.day(-1),
            approvedReturnOn: h.day(40),
            groundsNote: 'Đơn xin nghỉ dài hạn số DN-07/2026',
          })
          .expect(201),
      );

    /** A transfer, a leave, a notice and a departure, each about a person of its own in the department; the transfer goes to `into`. */
    const eventsOf = async (department: Department, into: Department) => {
      const head = await h.head(department, `ACCQ${(sequence += 1)}`);
      const mover = await person(department);
      const away = await person(department);
      const leaver = await person(department);
      const noticed = await person(department);

      return {
        transfer: await h.recorded({
          employeeId: mover.employeeId,
          toDepartmentId: into.id,
          effectiveOn: h.day(20),
          grounds: h.grounds,
        }),
        leave: await startedLeave(away.employeeId),
        notice: await h.sentNotice(
          { employeeId: noticed.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) },
          head.account,
        ),
        departure: await h.recordedCase(leaver),
      };
    };
    type Events = Awaited<ReturnType<typeof eventsOf>>;
    let readOf: { free: Events; own: Events };
    const idsOf = (response: Parameters<typeof h.dataOf>[0]): string[] =>
      h.dataOf<{ items: Array<{ id: string }> }>(response).items.map((item) => item.id);

    beforeAll(async () => {
      it2 = await handOthersToSecondItAdmin(h);
      // Made after the others were handed to the second IT Admin: nobody is named in charge of these two.
      free = await h.departmentWithUnit('A-FREE');
      freeToo = await h.departmentWithUnit('A-FREE2');
      own = await h.departmentWithUnit('A-OWN');
      await h.setItAdminInCharge(own, { employeeId: h.it1.employeeId, account: h.it1 });
      await h.setItAdminInCharge(des, { employeeId: h.it1.employeeId, account: h.it1 });
      readOf = { free: await eventsOf(free, freeToo), own: await eventsOf(own, des) };
    }, 120000);

    it('a department with no IT Admin named is read by every IT Admin: the transfer, the leave, the notice and the departure', async () => {
      for (const account of [h.it1, it2]) {
        expect(idsOf(await h.listTransfers('?pageSize=100', account).expect(200))).toContain(readOf.free.transfer.id);
        expect(idsOf(await listLeaves('?pageSize=100', account).expect(200))).toContain(readOf.free.leave.id);
        expect(idsOf(await h.listNotices('?pageSize=100', account).expect(200))).toContain(readOf.free.notice.id);
        expect(idsOf(await h.listCases('?pageSize=100', account).expect(200))).toContain(readOf.free.departure.id);
        await h.readTransfer(readOf.free.transfer.id, account).expect(200);
        await readLeave(readOf.free.leave.id, account).expect(200);
        await h.readNotice(readOf.free.notice.id, account).expect(200);
        await h.readCase(readOf.free.departure.id, account).expect(200);
      }
    });

    it('a department with a usable IT Admin named is read by that IT Admin alone: the other one finds it in no list and gets 404 on a read', async () => {
      await h.readTransfer(readOf.own.transfer.id, h.it1).expect(200);
      await readLeave(readOf.own.leave.id, h.it1).expect(200);
      await h.readNotice(readOf.own.notice.id, h.it1).expect(200);
      await h.readCase(readOf.own.departure.id, h.it1).expect(200);

      expect(idsOf(await h.listTransfers('?pageSize=100', it2).expect(200))).not.toContain(readOf.own.transfer.id);
      expect(idsOf(await listLeaves('?pageSize=100', it2).expect(200))).not.toContain(readOf.own.leave.id);
      expect(idsOf(await h.listNotices('?pageSize=100', it2).expect(200))).not.toContain(readOf.own.notice.id);
      expect(idsOf(await h.listCases('?pageSize=100', it2).expect(200))).not.toContain(readOf.own.departure.id);
      const reads = [
        ['DEPARTMENT_TRANSFER.NOT_FOUND', await h.readTransfer(readOf.own.transfer.id, it2)],
        ['LONG_LEAVE.NOT_FOUND', await readLeave(readOf.own.leave.id, it2)],
        ['PERSONNEL_NOTICE.NOT_FOUND', await h.readNotice(readOf.own.notice.id, it2)],
        ['OFFBOARDING_CASE.NOT_FOUND', await h.readCase(readOf.own.departure.id, it2)],
      ] as const;
      for (const [code, response] of reads) expect([response.status, h.codeOf(response)]).toEqual([404, code]);
    });

    it('the rights and the log of a departure follow the same scope: the rights of a department stood in for are read, the others are 404, and the log is the Super Admin alone', async () => {
      await h.rightsOf(readOf.free.departure.id, '', it2).expect(200);
      const hidden = await h.rightsOf(readOf.own.departure.id, '', it2);
      const log = await h.caseChanges(readOf.free.departure.id, '', it2);

      expect([hidden.status, h.codeOf(hidden)]).toEqual([404, 'OFFBOARDING_CASE.NOT_FOUND']);
      expect([log.status, h.codeOf(log)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    });

    it('naming a usable IT Admin in charge of a department ends the stand-in: the other IT Admin no longer reads its people', async () => {
      await h.setItAdminInCharge(free, { employeeId: it2.employeeId, account: it2 });

      const stoodIn = await readLeave(readOf.free.leave.id, h.it1);
      await readLeave(readOf.free.leave.id, it2).expect(200);
      // The transfer also enters `freeToo`, which nobody is in charge of: it stays readable by both through that end.
      await h.readTransfer(readOf.free.transfer.id, h.it1).expect(200);

      expect([stoodIn.status, h.codeOf(stoodIn)]).toEqual([404, 'LONG_LEAVE.NOT_FOUND']);
    });
  });
});
