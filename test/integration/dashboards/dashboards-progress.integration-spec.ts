import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { addWorkingDays } from '../../../src/core/working-days';
import { BlockAnnouncementService } from '../../../src/modules/personnel/departure-deadline/block-announcement.service';
import { DepartureClosureService } from '../../../src/modules/personnel/departure-closure/departure-closure.service';
import type { ApiAccount } from '../../support/api-accounts';
import { DashboardHarness, OVERVIEW_PATHS, type SectionWire } from '../../support/dashboard-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new DashboardHarness();
const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token thiết bị' };

interface Progress {
  calendar: { from: string; to: string };
  sections: {
    departures: Record<
      | 'upcoming'
      | 'awaitingRevocation'
      | 'revocationOverdue'
      | 'closedThisMonth'
      | 'itHandoverPending'
      | 'mailboxLockPending',
      SectionWire
    >;
    transfers: Record<'inGrace' | 'graceEndingSoon' | 'revoking', SectionWire>;
    seatsReturned: Record<'thisMonth' | 'reusedThisMonth', SectionWire>;
    plansBelowVendorAdminMinimum: SectionWire;
  };
}

/**
 * RD.1 (SPEC P21, R5 E1, E2, E6, E9, QĐ-110 G2): the progress of the departures and the transfers on the overviews of an IT Admin (the departments
 * in charge, and the tasks of this IT Admin for the seats) and of the Super Admin (the whole company), with the calendar of the next ten working days,
 * and the filters of the lists that show the rows of the calendar: `lastWorkingDayFrom/To` (P3) and `graceEndsFrom`/`graceEndsBefore` (P7). Real PostgreSQL.
 */
describe('progress of the departures and the transfers on the overviews (integration, real PostgreSQL)', () => {
  let des: { department: Department; head: Person };
  let eng: { department: Department; head: Person };
  let ops: { department: Department; head: Person };
  let it1: ApiAccount;
  let it2: Person;
  let it3: Person;
  let counter = 0;

  const progressOf = async (path: string, account: ApiAccount): Promise<Progress> =>
    (await h.overviewOf(path, account)) as unknown as Progress;
  const person = async (department: Department, roles: string[] = ['EMPLOYEE']): Promise<Person & { code: string }> => {
    const code = `RD-${(counter += 1)}`;

    return Object.assign(await h.employeeIn(department, code, roles), { code });
  };
  const announce = () => h.ctx.app.get(BlockAnnouncementService, { strict: false }).announce(new Date());
  const closing = () => h.ctx.app.get(DepartureClosureService);
  /** The days of the grace of a transfer moved to days of our choice: the table guards its columns, so only this fixture turns the guard off. */
  const moveGrace = async (transferId: string, days: { effective: string; reminder: string; ends: string }) => {
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        'UPDATE department_transfers SET effective_on = $2, grace_reminder_on = $3, grace_ends_on = $4 WHERE id = $1',
        [transferId, days.effective, days.reminder, days.ends],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
  };

  beforeAll(async () => {
    await h.start();
    it1 = h.it1;
    des = await h.departmentWithHead('P-RD-DES');
    eng = await h.departmentWithHead('P-RD-ENG');
    ops = await h.departmentWithHead('P-RD-OPS');
    it2 = await h.staff(eng.department, 'RD-IT2', 'IT_ADMIN');
    it3 = await h.staff(ops.department, 'RD-IT3', 'IT_ADMIN');
    await h.setItAdminInCharge(des.department, { employeeId: it1.employeeId, account: it1 });
    await h.setItAdminInCharge(eng.department, it2);
    await h.setItAdminInCharge(ops.department, it3);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the calendar of the next ten working days', () => {
    it('is from today to the tenth working day after it, on the overview of each role', async () => {
      const today = h.today();
      const expected = { from: today, to: addWorkingDays(today, 10, new Set()) };

      expect((await progressOf(OVERVIEW_PATHS.itAdmin, it1)).calendar).toEqual(expected);
      expect((await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).calendar).toEqual(expected);
    });
  });

  describe('the departures', () => {
    it('counts each by where it stands, for the departments of the IT Admin and for the whole company', async () => {
      const inWindow = await h.recordedCase(await person(des.department), { lastWorkingDay: h.day(10) });
      await h.recordedCase(await person(des.department), { lastWorkingDay: h.day(30) });
      await h.recordedCase(await person(eng.department), { lastWorkingDay: h.day(10) });
      // Blocked now and announced: awaiting the revocations (not late: the deadline is the next working day).
      await h.recordedCase(await person(des.department), { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.today() });
      await announce();
      // Past the deadline of the revocations with a right left (the example of the deadline of MF2-D): the person holds a seat.
      const holder = await person(des.department);
      const late = await h.recordedCase(holder, { lastWorkingDay: h.day(10) });
      await h.rightOf(holder, holder.code, {
        subscriptionId: await h.subscription(10, 'K2', des.department.id),
      });
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = '2026-09-30', departure_effective_on = '2026-10-01',
                revocation_due_on = '2026-10-01', handover_due_on = '2026-09-29', block_announced_at = now() WHERE id = $1`,
        [late.id],
      );

      const asIt = (await progressOf(OVERVIEW_PATHS.itAdmin, it1)).sections.departures;
      const asOther = (await progressOf(OVERVIEW_PATHS.itAdmin, it3.account)).sections.departures;
      const asSuper = (await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).sections.departures;

      // IT1 reads the departments P-RD-DES: one in the window (the one of 30 days is out, the one of ENG is not theirs).
      expect([asIt.upcoming.count, asIt.awaitingRevocation.count, asIt.revocationOverdue.count]).toEqual([1, 1, 1]);
      expect([asSuper.upcoming.count, asSuper.awaitingRevocation.count, asSuper.revocationOverdue.count]).toEqual([
        2, 1, 1,
      ]);
      expect([asOther.upcoming.count, asOther.awaitingRevocation.count, asOther.revocationOverdue.count]).toEqual([
        0, 0, 0,
      ]);
      expect(inWindow.id).toBeDefined();
    });

    it('names the list that answers the same number: the total of `offboardingCaseList` for the same filter and scope', async () => {
      const { calendar, sections } = await progressOf(OVERVIEW_PATHS.itAdmin, it1);
      const window = { lastWorkingDayFrom: calendar.from, lastWorkingDayTo: calendar.to };

      expect(sections.departures.upcoming).toMatchObject({
        state: 'COUNTED',
        sourceOperationId: 'offboardingCaseList',
      });
      expect(sections.departures.upcoming.count).toBe(
        await h.totalOf('/api/v1/offboarding-cases', it1, { state: 'HANDING_OVER', ...window }),
      );
      expect(sections.departures.revocationOverdue.count).toBe(
        await h.totalOf('/api/v1/offboarding-cases', it1, { revocationOverdue: 'true' }),
      );
      const asSuper = (await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).sections.departures;
      expect(asSuper.upcoming.count).toBe(
        await h.totalOf('/api/v1/offboarding-cases', h.sa, { state: 'HANDING_OVER', ...window }),
      );
      expect(asSuper.revocationOverdue.count).toBe(
        await h.totalOf('/api/v1/offboarding-cases', h.sa, { revocationOverdue: 'true' }),
      );
    });

    it('P3 filters by the last working day, both ends included, and the IT Admin reads only the departments in charge', async () => {
      const ids = async (query: Record<string, string>, account: ApiAccount = h.sa) =>
        (await h.itemsOf<{ id: string; lastWorkingDay: string }>('/api/v1/offboarding-cases', account, query)).map(
          (item) => item.lastWorkingDay,
        );
      const day10 = h.day(10);

      expect(await ids({ lastWorkingDayFrom: day10, lastWorkingDayTo: day10 })).toEqual([day10, day10]);
      expect(await ids({ lastWorkingDayFrom: day10, lastWorkingDayTo: day10 }, it1)).toEqual([day10]);
      expect(await ids({ lastWorkingDayFrom: h.day(11), lastWorkingDayTo: h.day(29) })).toEqual([]);
      // The case aged to the end of September and the one blocked now, whose last working day is today.
      expect(await ids({ lastWorkingDayTo: h.day(9) })).toEqual(['2026-09-30', h.today()]);
      expect(await ids({ lastWorkingDayFrom: h.day(30) })).toEqual([h.day(30)]);
    });

    it('counts the lock of the mailbox waiting and the closing of this month, and the hand-over of an IT Admin who left', async () => {
      const before = (await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).sections.departures;
      // A person who holds nothing: blocked now, (1a) written ⟹ (1b) pending; written ⟹ the system closes it.
      const gone = await h.recordedCase(await person(des.department), {
        accessBlockMode: 'BLOCK_NOW',
        lastWorkingDay: h.today(),
      });
      await h.lockAccount(gone.id, LOCK).expect(200);
      const waiting = (await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).sections.departures;
      expect(waiting.mailboxLockPending.count).toBe((before.mailboxLockPending.count ?? 0) + 1);

      await announce();
      await h.lockMailbox(gone.id, {}).expect(200);
      await closing().sweep();
      const closed = (await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).sections.departures;
      expect(closed.mailboxLockPending.count).toBe(before.mailboxLockPending.count);
      expect(closed.closedThisMonth.count).toBe((before.closedThisMonth.count ?? 0) + 1);

      // An IT Admin who answers for a subscription leaves: the hand-over is pending until they hand it over, across the company.
      const leaver = await h.employeeIn(ops.department, `RD-LV-${(counter += 1)}`, ['IT_ADMIN']);
      const subscriptionId = await h.subscription(10, 'K2', ops.department.id);
      await h.ctx.sql.query('UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1', [
        subscriptionId,
        leaver.employeeId,
      ]);
      const wire = await h.recordedCase(leaver);
      expect((await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).sections.departures.itHandoverPending.count).toBe(1);
      expect((await progressOf(OVERVIEW_PATHS.itAdmin, it1)).sections.departures.itHandoverPending.count).toBe(1);

      await request(h.server())
        .post(`/api/v1/offboarding-cases/${wire.id}/it-admin-handover`)
        .set(h.as(leaver.account))
        .send({ toItAdminEmployeeId: it1.employeeId })
        .expect(200);
      expect((await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).sections.departures.itHandoverPending.count).toBe(0);
    });
  });

  describe('the transfers', () => {
    it('counts each by phase, in the departments it leaves or enters, and P7 filters the graces that end in a range of days', async () => {
      const mover = await person(des.department);
      await h.moveToday(mover, eng.department);
      const transfers = await h.itemsOf<{ id: string; employee: { id: string }; grace: { endsOn: string } }>(
        '/api/v1/department-transfers',
        h.sa,
      );
      const transfer = transfers.find((item) => item.employee.id === mover.employeeId);
      if (!transfer) throw new Error('the transfer is not listed');
      const today = h.today();

      // Day 1 of the grace: in the grace, the reminder is still ahead.
      const desIt = async () => (await progressOf(OVERVIEW_PATHS.itAdmin, it1)).sections.transfers;
      expect((await desIt()).inGrace.count).toBe(1);
      expect((await desIt()).graceEndingSoon.count).toBe(0);
      expect((await desIt()).revoking.count).toBe(0);
      // The department that enters sees it too; a department that neither leaves nor enters does not; the company sees it.
      expect((await progressOf(OVERVIEW_PATHS.itAdmin, it2.account)).sections.transfers.inGrace.count).toBe(1);
      expect((await progressOf(OVERVIEW_PATHS.itAdmin, it3.account)).sections.transfers.inGrace.count).toBe(0);
      expect((await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).sections.transfers.inGrace.count).toBe(1);

      // From the day of the reminder on the grace is ending.
      await moveGrace(transfer.id, { effective: addDays(today, -2), reminder: today, ends: addDays(today, 2) });
      expect((await desIt()).graceEndingSoon.count).toBe(1);
      expect((await desIt()).inGrace.count).toBe(1);

      // P7: the graces that end in the window of the calendar (from the day, before the day after it).
      const ending = async (query: Record<string, string>) =>
        (await h.itemsOf<{ id: string }>('/api/v1/department-transfers', h.sa, query)).map((item) => item.id);
      expect(await ending({ graceEndsFrom: today, graceEndsBefore: addDays(today, 3) })).toEqual([transfer.id]);
      expect(await ending({ graceEndsFrom: addDays(today, 2), graceEndsBefore: addDays(today, 3) })).toEqual([
        transfer.id,
      ]);
      expect(await ending({ graceEndsFrom: addDays(today, 3) })).toEqual([]);
      expect(await ending({ graceEndsBefore: addDays(today, 2) })).toEqual([]);

      // The grace is over: the rights are being taken back.
      await moveGrace(transfer.id, {
        effective: addDays(today, -7),
        reminder: addDays(today, -3),
        ends: addDays(today, -1),
      });
      expect((await desIt()).revoking.count).toBe(1);
      expect((await desIt()).inGrace.count).toBe(0);
      expect((await desIt()).graceEndingSoon.count).toBe(0);
    });
  });

  describe('the seats of the pools and the plans short of admins', () => {
    it('counts the K2 seats got back for a departure this month and the K2 grants of the pool, in the tasks of the IT Admin', async () => {
      const k2 = await h.subscription(10, 'K2', des.department.id);
      const leaver = await person(des.department);
      const seat = await h.rightOf(leaver, leaver.code, { subscriptionId: k2 });
      const before = (await progressOf(OVERVIEW_PATHS.itAdmin, it1)).sections.seatsReturned;
      const beforeIt2 = (await progressOf(OVERVIEW_PATHS.itAdmin, it2.account)).sections.seatsReturned;
      const wire = await h.recordedCase(leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.today() });
      await h.lockAccount(wire.id, LOCK).expect(200);
      await h.revokeRights(wire.id, {}).expect(200);
      const rights = h.dataOf<{ items: { assignmentId: string; revocation: { taskId: string } | null }[] }>(
        await h.rightsOf(wire.id, '?pageSize=100').expect(200),
      ).items;
      const task = rights.find((right) => right.assignmentId === seat)?.revocation?.taskId ?? '';
      await h.claim(task).expect(200);
      await h.revoked(task, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản' }).expect(200);

      // A seat of the pool given out again today (the row the grant from the shared stock leaves, QĐ-106e).
      const taker = await person(des.department);
      const takerSeat = await h.rightOf(taker, taker.code, { subscriptionId: k2 });
      const grantTask = await h.openTask(takerSeat, 'GRANT', it1.employeeId);
      await h.ctx.sql.query(
        `INSERT INTO pool_grant_avoided_costs (organization_id, provisioning_task_id, assignment_id, request_id, plan_id,
                                               provisioning_type, months, unit_minor, amount_minor, currency, recorded_on)
         SELECT a.organization_id, $2, a.id, gen_random_uuid(), a.plan_id, 'K2', 1, 1000, 1000, 'VND', $3
           FROM license_assignments a WHERE a.id = $1`,
        [takerSeat, grantTask, h.today()],
      );

      const after = (await progressOf(OVERVIEW_PATHS.itAdmin, it1)).sections.seatsReturned;
      expect(after.thisMonth.count).toBe((before.thisMonth.count ?? 0) + 1);
      expect(after.reusedThisMonth.count).toBe((before.reusedThisMonth.count ?? 0) + 1);
      expect((await progressOf(OVERVIEW_PATHS.itAdmin, it2.account)).sections.seatsReturned.reusedThisMonth.count).toBe(
        beforeIt2.reusedThisMonth.count,
      );
      // The task belongs to the IT Admin in charge of the department of the person: another IT Admin does not count it, the company does.
      expect((await progressOf(OVERVIEW_PATHS.itAdmin, it2.account)).sections.seatsReturned.thisMonth.count).toBe(
        beforeIt2.thisMonth.count,
      );
      expect(
        (await progressOf(OVERVIEW_PATHS.superAdmin, h.sa)).sections.seatsReturned.thisMonth.count,
      ).toBeGreaterThanOrEqual(1);
    });

    it('counts the plans in use that need admins and have fewer than two who work, across the company, and falls when a second admin works', async () => {
      const k2 = await h.subscription(10, 'K2', des.department.id);
      const { rows } = await h.ctx.sql.query<{ plan_id: string }>('SELECT plan_id FROM subscriptions WHERE id = $1', [
        k2,
      ]);
      const planId = rows[0].plan_id;
      const countBy = async (path: string, account: ApiAccount) =>
        (await progressOf(path, account)).sections.plansBelowVendorAdminMinimum;
      const shortOf = async () => (await countBy(OVERVIEW_PATHS.superAdmin, h.sa)).count ?? 0;
      const record = async (admins: string[]) => {
        await h.ctx.sql.query('DELETE FROM plan_workspace_admins WHERE plan_id = $1', [planId]);
        for (const employeeId of admins)
          await h.ctx.sql.query(
            `INSERT INTO plan_workspace_admins (plan_id, employee_id, role) VALUES ($1, $2, 'ADMIN'::"WorkspaceRole")`,
            [planId, employeeId],
          );
      };

      // Two IT Admins who work: the plan is not short. One: it is. None recorded: it is too (a plan older than the rule).
      await record([it1.employeeId, it2.employeeId]);
      const enough = await shortOf();
      await record([it1.employeeId]);
      expect(await shortOf()).toBe(enough + 1);
      await record([]);
      expect(await shortOf()).toBe(enough + 1);
      await record([it1.employeeId, it2.employeeId]);
      expect(await shortOf()).toBe(enough);

      // The same number on both overviews: it is the company's, not the department's.
      expect(await countBy(OVERVIEW_PATHS.superAdmin, h.sa)).toEqual({
        state: 'COUNTED',
        count: enough,
        sourceOperationId: null,
        reason: null,
      });
      expect((await countBy(OVERVIEW_PATHS.itAdmin, it1)).count).toBe(enough);
      expect((await countBy(OVERVIEW_PATHS.itAdmin, it3.account)).count).toBe(enough);
    });
  });
});
