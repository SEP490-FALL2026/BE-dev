import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays } from '../../../src/core/business-date';
import { nthWorkingDayFrom } from '../../../src/core/working-days';
import { PROJECT_ROOT } from '../../support/cli-process';
import { migrationEndingWith } from '../../support/migration-history';
import { RevocationOverdueService } from '../../../src/modules/personnel/departure-deadline/revocation-overdue.service';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();
const NONE: ReadonlySet<string> = new Set();

/**
 * `MF2-D` (`QĐ-110c`, `M-09`, SPEC T-MF2): the deadline of the revocations of a departure is kept on the case, from the day it is written, and
 * moves with the last working day. Over HTTP and SQL on real PostgreSQL; the migration that fills it for the cases still open is run again
 * on rows written the way an older release wrote them.
 */
describe('the deadline of the revocations of a departure (integration, real PostgreSQL)', () => {
  let des: Department;
  let subscriptions: string[];
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-RD');
    await h.setItAdminInCharge(des, { employeeId: h.it1.employeeId, account: h.it1 });
    subscriptions = [await h.subscription(40, 'K2'), await h.subscription(40, 'K2')];
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const leaver = async (): Promise<Person> => h.worker(des, `E-RD-${(counter += 1)}`);
  /** The deadline of the rule over a calendar with no day off: the working day number `days` from the day after `lastWorkingDay`. */
  const dueAfter = (lastWorkingDay: string, days = 1, off: ReadonlySet<string> = NONE): string =>
    nthWorkingDayFrom(addDays(lastWorkingDay, 1), days, off);
  const dueOf = async (id: string): Promise<string | null> =>
    (
      await h.ctx.sql.query<{ due: string | null }>(
        `SELECT to_char(revocation_due_on, 'YYYY-MM-DD') AS due FROM offboarding_cases WHERE id = $1`,
        [id],
      )
    ).rows[0].due;

  it('keeps the working day after the last working day on a planned departure, and the same day in the first change of the case', async () => {
    const person = await leaver();

    const wire = await h.recordedCase(person);

    expect(await dueOf(wire.id)).toBe(dueAfter(h.day(10)));
    const changes = await h.ctx.sql.query<{ detail: { impact: { revocationDueOn: string } } }>(
      `SELECT detail FROM offboarding_case_changes WHERE case_id = $1 AND kind = 'RECORDED'`,
      [wire.id],
    );
    expect(changes.rows[0].detail.impact.revocationDueOn).toBe(dueAfter(h.day(10)));
  }, 120_000);

  it('keeps the working day after today on a departure blocked now (the last working day is the day it is recorded)', async () => {
    const person = await leaver();

    const wire = await h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });

    expect(wire.lastWorkingDay).toBe(h.today());
    expect(await dueOf(wire.id)).toBe(dueAfter(h.today()));
  }, 120_000);

  it('moves the deadline with the last working day of a handover under way', async () => {
    const person = await leaver();
    const wire = await h.recordedCase(person);

    await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Kéo dài thời gian bàn giao' }).expect(200);

    expect(await dueOf(wire.id)).toBe(dueAfter(h.day(20)));
  }, 120_000);

  describe('the parameter and the calendar of the organization', () => {
    const organization = async (): Promise<string> =>
      (await h.ctx.sql.query<{ id: string }>('SELECT id FROM organizations LIMIT 1')).rows[0].id;

    it('counts the working days the parameter says from the day after the last one and skips the days off', async () => {
      const org = await organization();
      const lastDay = h.day(30);
      const dayOff = dueAfter(lastDay);
      await h.ctx.sql.query(
        `INSERT INTO parameter_values (id, organization_id, key, value)
         VALUES (gen_random_uuid(), $1, 'DEPARTURE_REVOCATION_WORKING_DAYS', '2'::jsonb)`,
        [org],
      );
      await h.ctx.sql.query(
        `INSERT INTO non_working_dates (id, organization_id, date, reason) VALUES (gen_random_uuid(), $1, $2, 'Nghỉ lễ thử nghiệm')`,
        [org, dayOff],
      );
      try {
        const person = await leaver();

        const wire = await h.recordedCase(person, { lastWorkingDay: lastDay });

        expect(await dueOf(wire.id)).toBe(dueAfter(lastDay, 2, new Set([dayOff])));
        expect(await dueOf(wire.id)).not.toBe(dueAfter(lastDay, 2));
      } finally {
        await h.ctx.sql.query(
          `UPDATE parameter_values SET valid_to = now() WHERE key = 'DEPARTURE_REVOCATION_WORKING_DAYS' AND valid_to IS NULL`,
        );
        await h.ctx.sql.query('DELETE FROM non_working_dates WHERE date = $1', [dayOff]);
      }
    }, 120_000);
  });

  describe('the migration that gives the deadline to the departures still open', () => {
    const migration = () =>
      readFileSync(
        join(
          PROJECT_ROOT,
          'prisma',
          'migrations',
          migrationEndingWith('_personnel_revocation_due_on'),
          'migration.sql',
        ),
        'utf8',
      );
    /** Cases as an older release wrote them: no deadline. The guard of the table is off for this fixture only, inside one transaction. */
    const withoutDeadline = async (ids: readonly string[]): Promise<void> => {
      await h.ctx.sql.query('BEGIN');
      try {
        await h.ctx.sql.query('ALTER TABLE offboarding_cases DISABLE TRIGGER USER');
        await h.ctx.sql.query('UPDATE offboarding_cases SET revocation_due_on = NULL WHERE id = ANY($1::uuid[])', [
          ids,
        ]);
        await h.ctx.sql.query('ALTER TABLE offboarding_cases ENABLE TRIGGER USER');
        await h.ctx.sql.query('COMMIT');
      } catch (error) {
        await h.ctx.sql.query('ROLLBACK');
        throw error;
      }
    };

    it('fills a handover under way and a person who has left with the deadline of the rule, leaves a cancelled case alone, and is safe to run twice', async () => {
      const planned = await h.recordedCase(await leaver());
      const blockedNow = await h.recordedCase(await leaver(), {
        accessBlockMode: 'BLOCK_NOW',
        lastWorkingDay: undefined,
      });
      const cancelled = await h.recordedCase(await leaver());
      await h.cancelCase(cancelled.id, { reason: 'Người ở lại làm việc' }).expect(200);
      const cancelledDue = await dueOf(cancelled.id);
      await withoutDeadline([planned.id, blockedNow.id]);
      expect([await dueOf(planned.id), await dueOf(blockedNow.id)]).toEqual([null, null]);

      await h.ctx.sql.query(migration());

      expect(await dueOf(planned.id)).toBe(dueAfter(h.day(10)));
      expect(await dueOf(blockedNow.id)).toBe(dueAfter(h.today()));
      expect(await dueOf(cancelled.id)).toBe(cancelledDue);
      await h.ctx.sql.query(migration());
      expect(await dueOf(planned.id)).toBe(dueAfter(h.day(10)));
    }, 180_000);

    it('refuses a deadline that is not after the last working day', async () => {
      const wire = await h.recordedCase(await leaver());

      await expect(
        h.ctx.sql.query('UPDATE offboarding_cases SET revocation_due_on = last_working_day WHERE id = $1', [wire.id]),
      ).rejects.toThrow(/offboarding_cases_revocation_due_check/);
    }, 120_000);
  });

  describe('the telling that the rights are past the deadline (T-MF2 case 1)', () => {
    const LOCK = { note: 'Đã khóa tài khoản công ty' };
    /** The pass looks at every open case, so the deadlines the tests before left are cleared: a case with none is never late. */
    beforeEach(async () => {
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET revocation_due_on = NULL WHERE state <> 'CANCELLED' AND closed_at IS NULL`,
      );
    });
    const overdue = () => h.ctx.app.get(RevocationOverdueService, { strict: false });
    /** The hourly pass, run by hand at noon of `day` in the calendar of the organization. */
    const passAt = (day: string): Promise<number> => overdue().noticeOverdue(new Date(`${day}T12:00:00Z`));
    /** The working day number `n` after `day` over a calendar with no day off. */
    const workingDayAfter = (day: string, n = 1): string => nthWorkingDayFrom(addDays(day, 1), n, NONE);
    const noticesOf = async (caseId: string) =>
      (
        await h.ctx.sql.query<{ recipient: string; event_key: string; params: Record<string, unknown> }>(
          `SELECT recipient_employee_id AS recipient, event_key, params FROM in_app_notifications
            WHERE code = 'REVOCATION_OVERDUE' AND subject_id = $1 ORDER BY event_key, recipient_employee_id`,
          [caseId],
        )
      ).rows;
    const eventsOf = async (caseId: string): Promise<{ actor_kind: string }[]> =>
      (
        await h.ctx.sql.query<{ actor_kind: string }>(
          `SELECT actor_kind::text AS actor_kind FROM audit_events
            WHERE action = 'OFFBOARDING_CASE.REVOCATION_OVERDUE' AND resource_id = $1`,
          [caseId],
        )
      ).rows;
    /** A person with a seat in each of the two subscriptions. */
    const holder = async (): Promise<{ person: Person; seats: string[] }> => {
      const code = `E-RD-S${(counter += 1)}`;
      const person = await h.worker(des, code);
      const seats: string[] = [];
      for (const subscriptionId of subscriptions) seats.push(await h.seatOf(person, { subscriptionId }, code));

      return { person, seats };
    };
    const recipientsOf = (notices: { recipient: string }[]) => notices.map((notice) => notice.recipient).sort();
    /** Written as the rule would have: the last working day Wednesday 30/09/2026, the deadline Thursday 01/10 (a handover under way may move its days). */
    const withDaysOf2026Autumn = (id: string) =>
      h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = '2026-09-30', departure_effective_on = '2026-10-01',
                revocation_due_on = '2026-10-01', handover_due_on = '2026-09-29' WHERE id = $1`,
        [id],
      );

    it('tells the IT Admin in charge and the Super Admin on Friday 02/10 and Monday 05/10 for a last day of Wednesday 30/09, though no task was ever opened; not on the deadline, nor on the weekend; once a day', async () => {
      const { person } = await holder();
      const wire = await h.recordedCase(person);
      await withDaysOf2026Autumn(wire.id);
      const tasks = await h.taskCount();

      expect(await passAt('2026-10-01')).toBe(0);
      expect(await passAt('2026-10-02')).toBe(1);
      expect(await passAt('2026-10-02')).toBe(0);
      expect(await passAt('2026-10-03')).toBe(0);
      expect(await passAt('2026-10-04')).toBe(0);
      expect(await passAt('2026-10-05')).toBe(1);

      const notices = await noticesOf(wire.id);
      expect(notices.map((notice) => notice.event_key)).toEqual([
        `offboarding:${wire.id}:2026-10-02`,
        `offboarding:${wire.id}:2026-10-02`,
        `offboarding:${wire.id}:2026-10-05`,
        `offboarding:${wire.id}:2026-10-05`,
      ]);
      expect(recipientsOf(notices.slice(0, 2))).toEqual([h.it1.employeeId, h.sa.employeeId].sort());
      expect(notices[0].params).toEqual({
        caseId: wire.id,
        employeeId: person.employeeId,
        dueOn: '2026-10-01',
        rightCount: 2,
      });
      expect(await eventsOf(wire.id)).toEqual([{ actor_kind: 'SYSTEM' }, { actor_kind: 'SYSTEM' }]);
      // It only tells: no task opened, no seat taken away, the case unchanged.
      expect(await h.taskCount()).toBe(tasks);
      expect((await h.caseRow(wire.id)).state).toBe('HANDING_OVER');
    }, 180_000);

    it('writes one notice for a case and a day when two passes run together', async () => {
      const { person } = await holder();
      const wire = await h.recordedCase(person);
      await withDaysOf2026Autumn(wire.id);

      const told = await Promise.all([passAt('2026-10-02'), passAt('2026-10-02')]);

      expect(told.reduce((sum, count) => sum + count, 0)).toBe(1);
      expect(await noticesOf(wire.id)).toHaveLength(2);
      expect(await eventsOf(wire.id)).toHaveLength(1);
    }, 180_000);

    it('counts the rights left without a completed task: a task that waits still counts, a completed one does not, and the telling stops when none is left', async () => {
      const { person, seats } = await holder();
      const wire = await h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });
      const due = workingDayAfter(h.today());
      const [late1, late2, late3, late4] = [1, 2, 3, 4].map((n) => workingDayAfter(due, n));
      const taskOf = async (seat: string): Promise<string> => (await h.liveTaskOf(seat)) as string;
      const rightCountOn = async (day: string): Promise<unknown> =>
        (await noticesOf(wire.id)).find((notice) => notice.event_key.endsWith(day))?.params.rightCount;
      const completeSeat = async (seat: string): Promise<void> => {
        await h.claim(await taskOf(seat)).expect(200);
        await h
          .revoked(await taskOf(seat), { completion: 'ACCOUNT_REMOVED', evidence: 'Đã gỡ khỏi workspace' })
          .expect(200);
      };

      expect(await passAt(due)).toBe(0);
      expect(await passAt(late1)).toBe(1);
      expect(await rightCountOn(late1)).toBe(2);

      await h.revokeRights(wire.id, { assignmentIds: [seats[0]], accountLock: LOCK }).expect(200);
      await completeSeat(seats[0]);
      expect(await passAt(late2)).toBe(1);
      expect(await rightCountOn(late2)).toBe(1);

      await h.revokeRights(wire.id, { assignmentIds: [seats[1]] }).expect(200);
      expect(await passAt(late3)).toBe(1);
      expect(await rightCountOn(late3)).toBe(1);

      await completeSeat(seats[1]);
      expect(await passAt(late4)).toBe(0);
      expect(await rightCountOn(late4)).toBeUndefined();
    }, 240_000);

    it('tells nothing for a cancelled case, however long after its deadline', async () => {
      const { person } = await holder();
      const wire = await h.recordedCase(person);
      await h.cancelCase(wire.id, { reason: 'Người ở lại làm việc' }).expect(200);

      expect(await passAt(addDays(h.today(), 60))).toBe(0);
      expect(await noticesOf(wire.id)).toEqual([]);
    }, 180_000);
  });

  describe('the deadline of the case on the tasks, on the case and in the lists (P3, QĐ-110c)', () => {
    const LOCK = { note: 'Đã khóa tài khoản công ty' };
    interface Page<T> {
      items: T[];
      pagination: { totalItems: number };
    }
    const casePage = async (query: string, account = h.sa) =>
      h.dataOf<Page<CaseWire>>(await h.listCases(query, account).expect(200));
    const taskPage = async (query: Record<string, string>) =>
      h.dataOf<Page<{ id: string; dueOn: string | null; status: string }>>(await h.list(query).expect(200));
    const dueOnOfTask = async (taskId: string): Promise<string | null> =>
      (
        await h.ctx.sql.query<{ due: string | null }>(
          `SELECT to_char(due_on, 'YYYY-MM-DD') AS due FROM provisioning_tasks WHERE id = $1`,
          [taskId],
        )
      ).rows[0].due;
    const holder = async (): Promise<{ person: Person; seats: string[] }> => {
      const code = `E-RD-T${(counter += 1)}`;
      const person = await h.worker(des, code);
      const seats: string[] = [];
      for (const subscriptionId of subscriptions) seats.push(await h.seatOf(person, { subscriptionId }, code));

      return { person, seats };
    };

    it('opens the tasks of a departure with the due day of the case, and the card of the task says it', async () => {
      const { person, seats } = await holder();
      const wire = await h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });
      const due = dueAfter(h.today());

      await h.revokeRights(wire.id, { assignmentIds: seats, accountLock: LOCK }).expect(200);

      for (const seat of seats) {
        const taskId = (await h.liveTaskOf(seat)) as string;
        expect(await dueOnOfTask(taskId)).toBe(due);
        expect(h.dataOf<{ task: { dueOn: string } }>(await h.getTask(taskId).expect(200)).task.dueOn).toBe(due);
      }
    }, 180_000);

    it('lists only the tasks past their due day that are not over with overdue=true, and all the others with overdue=false', async () => {
      const { person, seats } = await holder();
      const wire = await h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });
      await h.revokeRights(wire.id, { assignmentIds: seats, accountLock: LOCK }).expect(200);
      const [late, onTime] = [(await h.liveTaskOf(seats[0])) as string, (await h.liveTaskOf(seats[1])) as string];
      await h.ctx.sql.query('UPDATE provisioning_tasks SET due_on = $2::date WHERE id = $1', [late, h.day(-1)]);
      const ids = (page: { items: { id: string }[] }) => page.items.map((item) => item.id);

      expect(ids(await taskPage({ overdue: 'true', pageSize: '100' }))).toEqual(expect.arrayContaining([late]));
      expect(ids(await taskPage({ overdue: 'true', pageSize: '100' }))).not.toContain(onTime);
      expect(ids(await taskPage({ overdue: 'false', pageSize: '100' }))).toEqual(expect.arrayContaining([onTime]));
      expect(ids(await taskPage({ overdue: 'false', pageSize: '100' }))).not.toContain(late);

      await h.claim(late).expect(200);
      await h.revoked(late, { completion: 'ACCOUNT_REMOVED', evidence: 'Đã gỡ khỏi workspace' }).expect(200);
      expect(ids(await taskPage({ overdue: 'true', pageSize: '100' }))).not.toContain(late);
      expect(ids(await taskPage({ overdue: 'false', pageSize: '100' }))).toContain(late);
    }, 180_000);

    it('tells the deadline on the case and in the list, filters the list by it, and keeps the pages and the total exact', async () => {
      const lateOne = await h.recordedCase((await holder()).person);
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = '2026-09-30', departure_effective_on = '2026-10-01',
                revocation_due_on = '2026-10-01', handover_due_on = '2026-09-29' WHERE id = $1`,
        [lateOne.id],
      );
      const onTime = await h.recordedCase((await holder()).person);

      const detail = h.dataOf<CaseWire>(await h.readCase(lateOne.id).expect(200));
      expect(detail.revocation).toEqual({ dueOn: '2026-10-01', overdue: true, rightsWithoutCompletedTask: 2 });
      expect(h.dataOf<CaseWire>(await h.readCase(onTime.id).expect(200)).revocation).toEqual({
        dueOn: dueAfter(h.day(10)),
        overdue: false,
        rightsWithoutCompletedTask: 2,
      });

      const overdue = await casePage('?revocationOverdue=true&pageSize=100');
      const others = await casePage('?revocationOverdue=false&pageSize=100');
      const all = await casePage('?pageSize=100');
      expect(overdue.items.map((item) => item.id)).toContain(lateOne.id);
      expect(overdue.items.every((item) => item.revocation.overdue)).toBe(true);
      expect(others.items.map((item) => item.id)).toEqual(expect.arrayContaining([onTime.id]));
      expect(others.items.map((item) => item.id)).not.toContain(lateOne.id);
      expect(others.items.some((item) => item.revocation.overdue)).toBe(false);
      expect(overdue.pagination.totalItems + others.pagination.totalItems).toBe(all.pagination.totalItems);
      const firstPage = await casePage('?revocationOverdue=false&pageSize=1&page=1');
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.pagination.totalItems).toBe(others.pagination.totalItems);
    }, 180_000);

    it('lets the IT Admin in charge of the department read the departures past the deadline', async () => {
      const lateOne = await h.recordedCase((await holder()).person);
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = '2026-09-30', departure_effective_on = '2026-10-01',
                revocation_due_on = '2026-10-01', handover_due_on = '2026-09-29' WHERE id = $1`,
        [lateOne.id],
      );

      const asIt = await casePage('?revocationOverdue=true&pageSize=100', h.it1);

      expect(asIt.items.map((item) => item.id)).toContain(lateOne.id);
    }, 180_000);

    it('does not tell a cancelled case as late, and shows no right for it', async () => {
      const wire = await h.recordedCase((await holder()).person);
      await h.cancelCase(wire.id, { reason: 'Người ở lại làm việc' }).expect(200);

      const detail = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));

      expect(detail.revocation).toMatchObject({ overdue: false, rightsWithoutCompletedTask: 0 });
      expect((await casePage('?revocationOverdue=true&pageSize=100')).items.map((item) => item.id)).not.toContain(
        wire.id,
      );
    }, 180_000);
  });
});
