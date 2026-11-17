import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { nthWorkingDayFrom } from '../../../src/core/working-days';
import { RevocationOverdueService } from '../../../src/modules/personnel/departure-deadline/revocation-overdue.service';
import { TransferRevocationService } from '../../../src/modules/personnel/transfer-grace/transfer-revocation.service';
import type { ApiAccount } from '../../support/api-accounts';
import { DashboardHarness } from '../../support/dashboard-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new DashboardHarness();
const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token thiết bị' };
const NO_DAYS_OFF: ReadonlySet<string> = new Set();

interface ReportWire {
  from: string;
  to: string;
  source: string | null;
  groupBy: string;
  completed: number;
  onTime: number;
  overdueOpen: number;
  medianWorkingDays: number | null;
  onTimeRate: number | null;
  rows: {
    key: { id: string | null; name: string | null };
    completed: number;
    onTime: number;
    overdueOpen: number;
    medianWorkingDays: number | null;
    onTimeRate: number | null;
  }[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  transferReRequests: { total: number; provisionedWithinGrace: number };
}

/**
 * RD.2 (SPEC P22, R5 E3, E7, QĐ-110c): the report of the SLA of the revocations on real PostgreSQL. Departures and transfers are made through their routes, the
 * windows are aged by SQL where a test needs a deadline in the past, and the tasks are done through the route of the IT Admin: what the report says of
 * on time, late and overdue is what the IT Admin did. A transfer's tasks carry no deadline (D-99), so its deadline is worked out the same way as a
 * departure's; the sweeper of the overdue notices judges departures only and stays silent about a transfer (D-124).
 */
describe('the report of the SLA of the revocations (integration, real PostgreSQL)', () => {
  let des: { department: Department; head: Person };
  let eng: { department: Department; head: Person };
  let it1: ApiAccount;
  let it2: Person;
  let desPool: string;
  let engPool: string;
  let counter = 0;
  let transferOverdue: { id: string; mover: Person & { code: string }; tasks: string[] };
  let openDeparture: string;

  const today = () => h.today();
  const person = async (department: Department): Promise<Person & { code: string }> => {
    const code = `SLA-${(counter += 1)}`;

    return Object.assign(await h.employeeIn(department, code), { code });
  };
  const report = async (
    account: ApiAccount,
    query: Record<string, string | number> = {},
    status = 200,
  ): Promise<ReportWire> => {
    const response = await request(h.server())
      .get('/api/v1/reports/revocation-sla')
      .query({ from: addDays(today(), -30), to: addDays(today(), 5), ...query })
      .set(h.as(account));
    expect(response.status).toBe(status);

    return status === 200 ? h.dataOf<ReportWire>(response) : (response.body as ReportWire);
  };
  const taskIdsOf = async (referenceId: string): Promise<string[]> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT t.id FROM provisioning_tasks t JOIN provisioning_task_reasons r ON r.task_id = t.id
          WHERE r.reference_id = $1 AND t.kind = 'REVOKE' ORDER BY t.id`,
        [referenceId],
      )
    ).rows.map((row) => row.id);
  const finish = async (taskId: string, by: ApiAccount): Promise<void> => {
    await h.claim(taskId, by).expect(200);
    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản' }, by).expect(200);
  };

  /** A departure blocked now whose person holds a K2 seat, the account locked and the rights opened for the IT Admin: the tasks exist and wait. */
  const departure = async (department: Department, pool: string) => {
    const leaver = await person(department);
    await h.rightOf(leaver, leaver.code, { subscriptionId: pool });
    const wire = await h.recordedCase(leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: today() });
    await h.lockAccount(wire.id, LOCK).expect(200);
    await h.revokeRights(wire.id, {}).expect(200);

    return { leaver, id: wire.id, tasks: await taskIdsOf(wire.id) };
  };
  /** The window of the departure moved back so its deadline is in the past (the way the tests of the deadline age a case). */
  const age = async (caseId: string, daysAgo: number): Promise<void> => {
    const lastDay = addDays(today(), -daysAgo);
    await h.ctx.sql.query('BEGIN');
    try {
      // A case of a person who has left keeps its days: only this fixture, to put its window in the past, turns the guard of the table off.
      await h.ctx.sql.query('ALTER TABLE offboarding_cases DISABLE TRIGGER USER');
      // A departure blocked now has no handover day (the table holds it): only the days of the window move.
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = $2, departure_effective_on = $3, revocation_due_on = $4 WHERE id = $1`,
        [caseId, lastDay, addDays(lastDay, 1), nthWorkingDayFrom(addDays(lastDay, 1), 1, NO_DAYS_OFF)],
      );
      await h.ctx.sql.query('ALTER TABLE offboarding_cases ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
  };
  /** The grace of a transfer moved to days of our choice: the table guards its columns, so only this fixture turns the guard off. */
  const moveGrace = async (transferId: string, endsDaysAgo: number): Promise<void> => {
    const ends = addDays(today(), -endsDaysAgo);
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        'UPDATE department_transfers SET effective_on = $2, grace_reminder_on = $3, grace_ends_on = $4 WHERE id = $1',
        [transferId, addDays(ends, -4), addDays(ends, -2), ends],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
  };
  /** A person with a K2 seat moves between the departments today; the grace ended `endsDaysAgo` days ago and the system opened the revocation. */
  const transfer = async (from: Department, to: Department, pool: string, endsDaysAgo: number) => {
    const mover = await person(from);
    await h.rightOf(mover, mover.code, { subscriptionId: pool });
    await h.moveToday(mover, to);
    const { rows } = await h.ctx.sql.query<{ id: string }>(
      'SELECT id FROM department_transfers WHERE employee_id = $1 ORDER BY recorded_at DESC LIMIT 1',
      [mover.employeeId],
    );
    await moveGrace(rows[0].id, endsDaysAgo);
    await h.ctx.app.get(TransferRevocationService, { strict: false }).sweep(new Date());

    return { id: rows[0].id, mover, tasks: await taskIdsOf(rows[0].id) };
  };

  beforeAll(async () => {
    await h.start();
    it1 = h.it1;
    des = await h.departmentWithHead('P-SLA-DES');
    eng = await h.departmentWithHead('P-SLA-ENG');
    it2 = await h.staff(eng.department, 'SLA-IT2', 'IT_ADMIN');
    await h.setItAdminInCharge(des.department, { employeeId: it1.employeeId, account: it1 });
    await h.setItAdminInCharge(eng.department, it2);
    desPool = await h.subscription(40, 'K2', des.department.id);
    engPool = await h.subscription(40, 'K2', eng.department.id);

    // Departures: U1 late (done after the deadline), U2 on time, U3 open past the deadline, U4 on time in the other department.
    const u1 = await departure(des.department, desPool);
    await age(u1.id, 8);
    for (const task of u1.tasks) await finish(task, it1);
    const u2 = await departure(des.department, desPool);
    for (const task of u2.tasks) await finish(task, it1);
    const u3 = await departure(des.department, desPool);
    await age(u3.id, 8);
    openDeparture = u3.id;
    const u4 = await departure(eng.department, engPool);
    for (const task of u4.tasks) await finish(task, it2.account);

    // Transfers: T1 into ENG, the grace ended long ago and done late; T2 into DES, ended yesterday and done at once; T3 into DES, ended long ago and still open.
    const t1 = await transfer(des.department, eng.department, desPool, 9);
    for (const task of t1.tasks) await finish(task, it2.account);
    const t2 = await transfer(eng.department, des.department, engPool, 1);
    for (const task of t2.tasks) await finish(task, it1);
    transferOverdue = await transfer(eng.department, des.department, engPool, 9);
  }, 600000);

  afterAll(async () => {
    await h.stop();
  });

  it('gives the figures of the whole company to the Super Admin: completed, on time, overdue open, the median and the share', async () => {
    const all = await report(h.sa);

    // Completed: U1 (late), U2, U4, T1 (late), T2; open past the deadline: U3 and T3.
    expect([all.completed, all.onTime, all.overdueOpen]).toEqual([5, 3, 2]);
    expect(all.onTimeRate).toBeCloseTo(3 / 7, 10);
    expect(all.medianWorkingDays).toEqual(expect.any(Number));
    expect(all.source).toBeNull();
    expect(all.groupBy).toBe('department');
  });

  it('tells departures from transfers with `source`, and gives each its own figures', async () => {
    const departures = await report(h.sa, { source: 'OFFBOARDING' });
    const transfers = await report(h.sa, { source: 'TRANSFER' });

    expect([departures.completed, departures.onTime, departures.overdueOpen]).toEqual([3, 2, 1]);
    expect([transfers.completed, transfers.onTime, transfers.overdueOpen]).toEqual([2, 1, 1]);
    expect(departures.source).toBe('OFFBOARDING');
    expect(transfers.source).toBe('TRANSFER');
  });

  it('an IT Admin reads only the departments in charge: no row, no figure of another department', async () => {
    const asIt1 = await report(it1);
    const asIt2 = await report(it2.account);

    // DES: U1, U2, U3 and the transfers into DES (T2 done on time, T3 open past the deadline).
    expect([asIt1.completed, asIt1.onTime, asIt1.overdueOpen]).toEqual([3, 2, 2]);
    // ENG: U4 and T1.
    expect([asIt2.completed, asIt2.onTime, asIt2.overdueOpen]).toEqual([2, 1, 0]);
    expect(asIt1.rows.map((row) => row.key.name)).toEqual([`Department ${des.department.code}`]);
    expect(asIt2.rows.map((row) => row.key.name)).toEqual([`Department ${eng.department.code}`]);
  });

  it('groups by department or by IT Admin, the ones with the most overdue first, named, and pages the rows', async () => {
    const byDepartment = await report(h.sa, { groupBy: 'department' });
    const byItAdmin = await report(h.sa, { groupBy: 'itAdmin' });

    expect(byDepartment.rows.map((row) => [row.key.id, row.completed, row.onTime, row.overdueOpen])).toEqual([
      [des.department.id, 3, 2, 2],
      [eng.department.id, 2, 1, 0],
    ]);
    expect(byDepartment.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    // The tasks go to the IT Admin in charge of the department of the departure, and of the new department of a transfer.
    expect(byItAdmin.rows.map((row) => [row.key.id, row.completed, row.overdueOpen])).toEqual([
      [it1.employeeId, 3, 2],
      [it2.employeeId, 2, 0],
    ]);
    expect(byItAdmin.rows.every((row) => typeof row.key.name === 'string')).toBe(true);

    const second = await report(h.sa, { groupBy: 'department', pageSize: 1, page: 2 });
    expect(second.rows.map((row) => row.key.id)).toEqual([eng.department.id]);
    expect(second.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
  });

  it('counts a window by the day it opens on: a range that holds none reports nothing, not a zero rate', async () => {
    const none = await report(h.sa, { from: addDays(today(), -200), to: addDays(today(), -190) });

    expect([none.completed, none.onTime, none.overdueOpen, none.rows.length]).toEqual([0, 0, 0, 0]);
    expect([none.medianWorkingDays, none.onTimeRate]).toEqual([null, null]);
    expect(none.transferReRequests).toEqual({ total: 0, provisionedWithinGrace: 0 });
  });

  it('refuses a range that ends before it starts or lasts over a year, a source or a grouping that does not exist, with 422', async () => {
    const refusals: Record<string, string | number>[] = [
      { from: addDays(today(), 3), to: addDays(today(), 1) },
      { from: addDays(today(), -400), to: today() },
      { source: 'RETURN' },
      { groupBy: 'person' },
      { pageSize: 101 },
      { from: 'soon' },
    ];
    for (const query of refusals) await report(h.sa, query, 422);
  });

  it('answers the Super Admin and the IT Admin only', async () => {
    const answers: number[] = [];
    for (const account of [h.sa, it1, des.head.account, h.finance, h.employee])
      answers.push((await request(h.server()).get('/api/v1/reports/revocation-sla').set(h.as(account))).status);

    expect(answers).toEqual([200, 200, 403, 403, 403]);
    expect((await request(h.server()).get('/api/v1/reports/revocation-sla')).status).toBe(401);
  });

  describe('the new requests of the people in the grace of their transfer', () => {
    it('counts them, and the ones granted by the last day of the grace, in the scope of the reader', async () => {
      const { mover } = transferOverdue;
      const { rows } = await h.ctx.sql.query<{ effective_on: string; grace_ends_on: string }>(
        `SELECT to_char(effective_on, 'YYYY-MM-DD') AS effective_on, to_char(grace_ends_on, 'YYYY-MM-DD') AS grace_ends_on
           FROM department_transfers WHERE id = $1`,
        [transferOverdue.id],
      );
      const { effective_on: effective, grace_ends_on: ends } = rows[0];
      // Two requests of the person, sent in the grace for software they hold (`limitExemption`); one granted by the last day, one a day after.
      const planA = await h.plan('K5');
      const planB = await h.plan('K5');
      const inGrace = await h.sent(mover, planA);
      const late = await h.sent(mover, planB);
      await h.ctx.sql.query('ALTER TABLE access_requests DISABLE TRIGGER USER');
      try {
        for (const [id, sentOn, grantedOn] of [
          [inGrace.id, addDays(effective, 1), ends],
          [late.id, addDays(effective, 2), addDays(ends, 1)],
        ])
          await h.ctx.sql.query(
            `UPDATE access_requests SET limit_exemption = 'TRANSFER_GRACE', submitted_at = $2::date + time '10:00',
                    granted_on = $3 WHERE id = $1`,
            [id, sentOn, grantedOn],
          );
      } finally {
        await h.ctx.sql.query('ALTER TABLE access_requests ENABLE TRIGGER USER');
      }

      const all = await report(h.sa, { from: addDays(today(), -30), to: addDays(today(), 5) });
      const asDepartureOnly = await report(h.sa, { source: 'OFFBOARDING' });

      expect(all.transferReRequests).toEqual({ total: 2, provisionedWithinGrace: 1 });
      // A departure has no grace: its report carries none.
      expect(asDepartureOnly.transferReRequests).toEqual({ total: 0, provisionedWithinGrace: 0 });
      // The requests are sent from the department the person moved to (DES): the IT Admin of ENG does not count them.
      expect((await report(it1)).transferReRequests).toEqual({ total: 2, provisionedWithinGrace: 1 });
      expect((await report(it2.account)).transferReRequests).toEqual({ total: 0, provisionedWithinGrace: 0 });
    });
  });

  it('D-124: the sweeper of the overdue notices tells of the late departure and says nothing of the transfer past its deadline', async () => {
    // The sweeper tells on a working day only: judge the pass at the next working day, when both the departure and the transfer are overdue.
    const nextWorkingDay = nthWorkingDayFrom(addDays(today(), 1), 1, NO_DAYS_OFF);
    const told = await h.ctx.app
      .get(RevocationOverdueService, { strict: false })
      .noticeOverdue(new Date(`${nextWorkingDay}T12:00:00Z`));
    const notices = async (subjectId: string) =>
      (
        await h.ctx.sql.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM in_app_notifications WHERE code = 'REVOCATION_OVERDUE' AND subject_id = $1`,
          [subjectId],
        )
      ).rows[0].n;

    expect(told).toBe(1);
    expect(await notices(openDeparture)).toBeGreaterThan(0);
    // The transfer has open tasks past the deadline the report counts, and no notice is made for it: it has no case, and no deadline of its own (D-99).
    expect(transferOverdue.tasks.length).toBeGreaterThan(0);
    expect(await notices(transferOverdue.id)).toBe(0);
    expect((await report(h.sa, { source: 'TRANSFER' })).overdueOpen).toBe(1);
  });

  it('RD-R1: a departure of a person with no department is in the report of the Super Admin, grouped under the key with no id, and in the report of no IT Admin', async () => {
    const before = { all: await report(h.sa), asIt1: await report(it1), asIt2: await report(it2.account) };
    const unplaced = await departure(des.department, desPool);
    for (const task of unplaced.tasks) await finish(task, it1);
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE offboarding_cases DISABLE TRIGGER USER');
      await h.ctx.sql.query('UPDATE offboarding_cases SET department_id = NULL WHERE id = $1', [unplaced.id]);
      await h.ctx.sql.query('ALTER TABLE offboarding_cases ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }

    const all = await report(h.sa);

    expect([all.completed, all.onTime, all.overdueOpen]).toEqual([
      before.all.completed + 1,
      before.all.onTime + 1,
      before.all.overdueOpen,
    ]);
    expect(all.rows.filter((row) => row.key.id === null)).toEqual([
      expect.objectContaining({ key: { id: null, name: null }, completed: 1, onTime: 1, overdueOpen: 0 }),
    ]);
    // An IT Admin reads the departments in charge: the person with no department is in no one's scope.
    expect(await report(it1)).toEqual(before.asIt1);
    expect(await report(it2.account)).toEqual(before.asIt2);
  });

  it('RD-R2: a departure with one task done and a right that never got a task is not finished before its deadline either; the day the deadline passes it is overdue, never finished and then overdue', async () => {
    const secondPool = await h.subscription(40, 'K2', des.department.id);
    const leaver = await person(des.department);
    const first = await h.rightOf(leaver, leaver.code, { subscriptionId: desPool });
    await h.rightOf(leaver, leaver.code, { subscriptionId: secondPool });
    const before = await report(h.sa);
    const wire = await h.recordedCase(leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: today() });
    await h.lockAccount(wire.id, LOCK).expect(200);
    // The IT Admin opens a task for one of the two rights only, and completes it.
    await h.revokeRights(wire.id, { assignmentIds: [first] }).expect(200);
    const firstTasks = await taskIdsOf(wire.id);
    for (const task of firstTasks) await finish(task, it1);

    const inTime = await report(h.sa);

    // Not finished, not on time, not overdue yet: the figures are the ones before the departure was recorded.
    expect([inTime.completed, inTime.onTime, inTime.overdueOpen]).toEqual([
      before.completed,
      before.onTime,
      before.overdueOpen,
    ]);

    await age(wire.id, 8);
    const late = await report(h.sa);

    expect([late.completed, late.onTime, late.overdueOpen]).toEqual([
      before.completed,
      before.onTime,
      before.overdueOpen + 1,
    ]);

    // The IT Admin takes the other right away too: the departure is finished, late.
    await h.revokeRights(wire.id, {}).expect(200);
    for (const task of (await taskIdsOf(wire.id)).filter((id) => !firstTasks.includes(id))) await finish(task, it1);
    const done = await report(h.sa);

    expect([done.completed, done.onTime, done.overdueOpen]).toEqual([
      before.completed + 1,
      before.onTime,
      before.overdueOpen,
    ]);
  });
});
