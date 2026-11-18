import { randomUUID } from 'node:crypto';
import type { DbTx } from '../../../src/infrastructure/database/transaction-runner';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { LeaveHarness, type LeaveWire } from '../../support/leave-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new LeaveHarness();

/**
 * US-03-03: what the database refuses, the list in a fixed number of statements, what the leaving of a person asks of a leave, and the
 * days a rule of the recommendations reads. On real PostgreSQL.
 */
describe('long leave data, list and contracts for the leaving flow (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let des: Department;
  let sequence = 0;
  const code = (prefix: string) => `${prefix}-${(sequence += 1)}`;
  const sqlState = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await h.ctx.sql.query(sql, params);

      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    }
  };
  const onLeave = async (
    startedOn: string,
    approvedReturnOn: string,
  ): Promise<{ person: Person; leave: LeaveWire }> => {
    const person = await h.worker(des, code('E'));
    const leave = await h.started({
      employeeId: person.employeeId,
      startedOn,
      approvedReturnOn,
      groundsNote: h.approval,
    });

    return { person, leave };
  };

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
    des = await h.departmentWithUnit('L-INT');
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('what the database refuses', () => {
    it('keeps one running leave for each person, a day of return after the start, and a leave that is whole', async () => {
      const { person, leave } = await onLeave(h.day(-10), h.day(10));
      const insert = (over: Record<string, string | null>) => {
        const row = {
          started_on: h.day(-5),
          approved_return_on: h.day(5),
          status: 'ACTIVE',
          ended_on: null,
          end_kind: null,
          grounds_reference: 'X-1',
          ...over,
        };

        return sqlState(
          `INSERT INTO employee_leaves (id, organization_id, employee_id, started_on, approved_return_on, status, ended_on,
                                        end_kind, grounds_type, grounds_reference, grounds_issuer, grounds_issued_on,
                                        started_by_app_user_id)
           SELECT gen_random_uuid(), organization_id, employee_id, $1::date, $2::date, $3::"EmployeeLeaveStatus", $4::date,
                  $5::"EmployeeLeaveEndKind", 'T', $6, 'I', current_date, $7::uuid
             FROM employee_leaves WHERE id = $8`,
          [
            row.started_on,
            row.approved_return_on,
            row.status,
            row.ended_on,
            row.end_kind,
            row.grounds_reference,
            randomUUID(),
            leave.id,
          ],
        );
      };

      expect(await insert({})).toBe('23505');
      expect(
        await insert({ status: 'ENDED', ended_on: h.day(-4), end_kind: 'RETURNED', approved_return_on: h.day(-5) }),
      ).toBe('23514');
      expect(await insert({ status: 'ENDED', ended_on: null, end_kind: null })).toBe('23514');
      expect(await insert({ status: 'ENDED', ended_on: h.day(-9), end_kind: 'RETURNED' })).toBe('23514');
      expect(await insert({ status: 'ACTIVE', ended_on: h.day(-4), end_kind: 'RETURNED' })).toBe('23514');
      expect(await insert({ status: 'ENDED', ended_on: h.day(-4), end_kind: 'RETURNED', grounds_reference: ' ' })).toBe(
        '23514',
      );
      expect(await insert({ status: 'ENDED', ended_on: h.day(-4), end_kind: 'RETURNED' })).toBeNull();
      expect(await h.leavesOf(person.employeeId)).toHaveLength(2);
    });

    it('never changes who is on leave or since when, never deletes, and never changes a leave that has ended', async () => {
      const { person, leave } = await onLeave(h.day(-10), h.day(10));
      const ended = await onLeave(h.day(-10), h.day(10));
      await h.confirmReturn(ended.leave.id, { returnedOn: h.today(), groundsNote: h.extension }).expect(200);

      expect(
        await sqlState(`UPDATE employee_leaves SET employee_id = $2 WHERE id = $1`, [
          leave.id,
          ended.person.employeeId,
        ]),
      ).toBe('55000');
      expect(await sqlState(`UPDATE employee_leaves SET started_on = started_on - 1 WHERE id = $1`, [leave.id])).toBe(
        '55000',
      );
      expect(
        await sqlState(`UPDATE employee_leaves SET started_by_app_user_id = $2 WHERE id = $1`, [
          leave.id,
          randomUUID(),
        ]),
      ).toBe('55000');
      expect(await sqlState(`DELETE FROM employee_leaves WHERE id = $1`, [leave.id])).toBe('55000');
      expect(await sqlState(`TRUNCATE employee_leaves CASCADE`)).toBe('55000');
      expect(
        await sqlState(`UPDATE employee_leaves SET approved_return_on = approved_return_on + 1 WHERE id = $1`, [
          ended.leave.id,
        ]),
      ).toBe('55000');
      expect(
        await sqlState(`UPDATE employee_leaves SET approved_return_on = approved_return_on + 1 WHERE id = $1`, [
          leave.id,
        ]),
      ).toBeNull();
      expect((await h.leavesOf(person.employeeId))[0].approved_return_on).toBe(h.day(11));
    });

    it('keeps the log append-only, with a basis that is whole or absent and a row that fits its kind', async () => {
      const { leave } = await onLeave(h.day(-10), h.day(10));
      const change = (kind: string, columns: string, values: string) =>
        sqlState(
          `INSERT INTO employee_leave_changes (id, leave_id, kind, ${columns}, recorded_by_app_user_id)
           VALUES (gen_random_uuid(), $1, $2::"EmployeeLeaveChangeKind", ${values}, $3)`,
          [leave.id, kind, randomUUID()],
        );

      expect(
        await sqlState(`UPDATE employee_leave_changes SET self_executed = true WHERE leave_id = $1`, [leave.id]),
      ).toBe('55000');
      expect(await sqlState(`DELETE FROM employee_leave_changes WHERE leave_id = $1`, [leave.id])).toBe('55000');
      expect(await sqlState(`TRUNCATE employee_leave_changes`)).toBe('55000');
      expect(await change('RETURNED', `returned_on, on_schedule`, `current_date, false`)).toBe('23514');
      expect(await change('RETURNED', `returned_on, on_schedule`, `current_date, true`)).toBeNull();
      expect(
        await change('RETURN_DATE_CHANGED', `old_return_on, new_return_on`, `current_date, current_date + 1`),
      ).toBe('23514');
      expect(
        await change(
          'RETURN_DATE_CHANGED',
          `old_return_on, new_return_on, grounds_type`,
          `current_date, current_date, 'T'`,
        ),
      ).toBe('23514');
      expect(
        await change(
          'RETURN_DATE_CHANGED',
          `old_return_on, new_return_on, grounds_type, grounds_reference`,
          `current_date, current_date + 1, 'T', 'R'`,
        ),
      ).toBe('23514');
    });

    it('has no column that could keep the reason for a leave', async () => {
      const { rows } = await h.ctx.sql.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name IN ('employee_leaves', 'employee_leave_changes')
            AND column_name ~* '(reason|medical|health|diagnos|note|comment)'`,
      );

      expect(rows).toEqual([]);
    });
  });

  describe('the list (API-LIST-DETAIL)', () => {
    it('reads a page in a fixed number of statements, the nearest day of return first then id, and filters', async () => {
      for (let index = 0; index < 3; index += 1) await onLeave(h.day(-50), h.day(index));
      const small = await counter.run(() => h.listLeaves('?pageSize=100'));
      for (let index = 0; index < 9; index += 1) await onLeave(h.day(-50), h.day(index % 4));

      const large = await counter.run(() => h.listLeaves('?pageSize=100'));

      expect(small.result.status).toBe(200);
      expect(large.result.status).toBe(200);
      expect(dataStatements(large.statements).length).toBe(dataStatements(small.statements).length);
      expect(dataStatements(large.statements).join('\n')).not.toMatch(/grounds_|started_by_app_user_id/);
      const items = h.dataOf<{ items: LeaveWire[] }>(large.result).items;
      const ordered = [...items].sort((a, b) =>
        a.approvedReturnOn === b.approvedReturnOn
          ? a.id < b.id
            ? -1
            : 1
          : a.approvedReturnOn < b.approvedReturnOn
            ? -1
            : 1,
      );
      expect(items.map((item) => item.id)).toEqual(ordered.map((item) => item.id));
      expect(items.length).toBeGreaterThanOrEqual(12);
      expect(items[0]).not.toHaveProperty('groundsNote');
    });

    it('filters by state and person, and the list of late returns holds exactly the active leaves past their day', async () => {
      const late = await onLeave(h.day(-50), h.day(-1));
      const back = await onLeave(h.day(-50), h.day(-1));
      await h.confirmReturn(back.leave.id, { returnedOn: h.today(), groundsNote: h.extension }).expect(200);

      const byPerson = h.dataOf<{ items: LeaveWire[] }>(
        await h.listLeaves(`?employeeId=${back.person.employeeId}&status=ENDED`),
      );
      const overdue = h.dataOf<{ items: LeaveWire[]; pagination: { totalItems: number } }>(
        await h.listLeaves('?overdueReturn=true&pageSize=100'),
      );

      expect(byPerson.items.map((item) => item.id)).toEqual([back.leave.id]);
      expect(overdue.items.map((item) => item.id)).toContain(late.leave.id);
      expect(overdue.items.map((item) => item.id)).not.toContain(back.leave.id);
      expect(overdue.items.every((item) => item.overdueReturn && item.status === 'ACTIVE')).toBe(true);
      const page = h.dataOf<{ items: LeaveWire[]; pagination: { totalItems: number; totalPages: number } }>(
        await h.listLeaves('?pageSize=2&page=2'),
      );
      expect(page.items).toHaveLength(2);
      expect(page.pagination.totalPages).toBeGreaterThanOrEqual(2);
    });
  });

  describe('what the leaving of a person asks of a leave (AC-6, US-03-04 AC-26)', () => {
    const departure = (person: Person, work: (tx: DbTx) => Promise<unknown>) =>
      h.inTransaction(async (tx) => {
        await h.organizationService().lockEmployeeForUpdate(tx, person.employeeId);

        return work(tx);
      });

    it('ends a running leave for the handover, so the days of handover are not days of leave, and does nothing for a person who works', async () => {
      const { person, leave } = await onLeave(h.day(-30), h.day(30));
      const working = await h.worker(des, code('W'));

      const ended = await departure(person, (tx) =>
        h.departure().endForDeparture(tx, h.saActor(), person.employeeId, h.today()),
      );
      const none = await departure(working, (tx) =>
        h.departure().endForDeparture(tx, h.saActor(), working.employeeId, h.today()),
      );

      expect(ended).toMatchObject({ id: leave.id, status: 'ENDED', endKind: 'DEPARTURE_STARTED', endedOn: h.today() });
      expect(none).toBeNull();
      expect((await h.leavesOf(person.employeeId))[0]).toMatchObject({
        status: 'ENDED',
        end_kind: 'DEPARTURE_STARTED',
      });
      expect(await h.changeRows(leave.id)).toEqual([{ kind: 'STARTED' }, { kind: 'ENDED_FOR_DEPARTURE' }]);
      // The work state stays as the leaving file left it: this function never moves it.
      expect(await h.workState(person.employeeId)).toBe('ON_LONG_LEAVE');
    });

    it('opens a new leave with the approved day kept when the handover is cancelled before that day', async () => {
      const { person, leave } = await onLeave(h.day(-30), h.day(30));
      await departure(person, (tx) => h.departure().endForDeparture(tx, h.saActor(), person.employeeId, h.day(-5)));

      const state = await departure(person, (tx) =>
        h.departure().resumeAfterCancelledDeparture(tx, h.saActor(), person.employeeId, h.today()),
      );

      expect(state).toBe('ON_LONG_LEAVE');
      const [old, resumed] = await h.leavesOf(person.employeeId);
      expect(old).toMatchObject({ id: leave.id, status: 'ENDED', ended_on: h.day(-5) });
      expect(resumed).toMatchObject({
        status: 'ACTIVE',
        started_on: h.today(),
        approved_return_on: h.day(30),
        resumes_leave_id: leave.id,
      });
      expect(await h.changeRows(resumed.id)).toEqual([{ kind: 'RESUMED' }]);
      // The handover days are in no leave; asking again does not resume the same leave twice.
      const again = await departure(person, (tx) =>
        h.departure().resumeAfterCancelledDeparture(tx, h.saActor(), person.employeeId, h.today()),
      );
      expect(again).toBe('ON_LONG_LEAVE');
      expect((await h.leavesOf(person.employeeId)).filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
    });

    it.each([
      ['after the day the person was due back', () => [h.day(-20), h.day(-2)]],
      ['on the day the person was due back', () => [h.day(-20), h.today()]],
    ])('says the person works when the handover is cancelled %s, and opens no leave', async (_name, days) => {
      const [startedOn, approvedReturnOn] = days();
      const { person } = await onLeave(h.day(-30), approvedReturnOn);
      await departure(person, (tx) => h.departure().endForDeparture(tx, h.saActor(), person.employeeId, startedOn));

      const state = await departure(person, (tx) =>
        h.departure().resumeAfterCancelledDeparture(tx, h.saActor(), person.employeeId, h.today()),
      );

      expect(state).toBe('WORKING');
      expect(await h.leavesOf(person.employeeId)).toHaveLength(1);
    });
  });

  describe('the days of leave a rule of the recommendations reads', () => {
    it('gives the leaves of many people that touch the span in one statement', async () => {
      const a = await onLeave(h.day(-100), h.day(-60));
      await h.confirmReturn(a.leave.id, { returnedOn: h.day(-60), groundsNote: h.extension }).expect(200);
      const b = await onLeave(h.day(-40), h.day(40));
      const none = await h.worker(des, code('W'));
      const ids = [a.person.employeeId, b.person.employeeId, none.employeeId];

      const counted = await counter.run(() => h.personnel().getLeaveIntervals(ids, h.day(-70), h.day(-30)));
      const wide = await h.personnel().getLeaveIntervals(ids, h.day(-200), h.day(200));
      const outside = await h.personnel().getLeaveIntervals(ids, h.day(-59), h.day(-41));

      expect(dataStatements(counted.statements)).toHaveLength(1);
      expect(counted.result).toEqual([
        ...[
          { employeeId: a.person.employeeId, startedOn: h.day(-100), endedOn: h.day(-60) },
          { employeeId: b.person.employeeId, startedOn: h.day(-40), endedOn: null },
        ].sort((x, y) => (x.employeeId < y.employeeId ? -1 : 1)),
      ]);
      expect(wide).toHaveLength(2);
      expect(outside).toEqual([]);
      expect(await h.personnel().getLeaveIntervals([], h.day(-1), h.day(1))).toEqual([]);
    });
  });
});
