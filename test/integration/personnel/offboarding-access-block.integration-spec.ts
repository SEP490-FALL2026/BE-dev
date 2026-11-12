import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { ACCOUNT_PASSWORD } from '../../support/api-accounts';
import { recordAsSuperAdmin } from '../../support/super-admin-event-runner';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();

interface BlockRow {
  blocked_from: string;
  cause: string;
  releasable: boolean;
  source_case_id: string | null;
}

/**
 * `qd96-100-departure-day-access-block`, Phần A (Task 1–3, `QĐ-100q`, S-11): the block a departure puts on the access of a person
 * from the day after the last working day, whatever the state of the case, and the IT Admin who does not wait for `LEFT`. Over HTTP,
 * on real PostgreSQL. The clock is the real one, so "after the last working day" is made by moving the days of the case and of its
 * block into the past, as the other specs of the departure do.
 */
describe('the block of the access from the day after the last working day (integration, real PostgreSQL)', () => {
  let des: Department;
  let counter = 0;
  const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token thiết bị' };

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-AB');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const leaver = async (): Promise<Person> => h.worker(des, `E-AB-${(counter += 1)}`);
  const me = (token: string) =>
    request(h.server())
      .get('/api/v1/me')
      .set({ Authorization: `Bearer ${token}` });
  const login = (person: Person) =>
    request(h.server()).post('/api/v1/auth/login').send({ email: person.account.email, password: ACCOUNT_PASSWORD });
  const refresh = (refreshToken: string) => request(h.server()).post('/api/v1/auth/refresh').send({ refreshToken });
  const blockOf = async (employeeId: string): Promise<BlockRow | undefined> =>
    (
      await h.ctx.sql.query<BlockRow>(
        `SELECT to_char(blocked_from, 'YYYY-MM-DD') AS blocked_from, cause, releasable, source_case_id::text
           FROM employee_access_blocks WHERE employee_id = $1`,
        [employeeId],
      )
    ).rows[0];
  /** The last working day was `daysAgo` days ago: the case and the block it wrote say so. */
  const lastDayWasAgo = async (wire: CaseWire, person: Person, daysAgo: number): Promise<void> => {
    await h.ctx.sql.query(
      `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
      [wire.id, h.day(-daysAgo), h.day(-daysAgo + 1)],
    );
    await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
      person.employeeId,
      h.day(-daysAgo + 1),
    ]);
  };

  describe('writing the block (Task 2)', () => {
    it('is written with the record of a handover, for the day after the last working day, and the person works until then', async () => {
      const person = await leaver();
      const token = person.account.accessToken;

      const wire = await h.recordedCase(person);

      expect(await blockOf(person.employeeId)).toEqual({
        blocked_from: h.day(11),
        cause: 'DEPARTURE_LAST_DAY',
        releasable: false,
        source_case_id: wire.id,
      });
      await me(token).expect(200);
      await login(person).expect(200);
    });

    it('moves with the last working day (AC-10)', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);

      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Dời ngày' }).expect(200);

      expect((await blockOf(person.employeeId))?.blocked_from).toBe(h.day(21));
    });

    it('does not move a block that was set to act now: only the block that follows the last working day follows it (R-11)', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);
      await h.ctx.sql.query(
        `UPDATE employee_access_blocks SET cause = 'DEPARTURE_BLOCK_NOW', blocked_from = $2::date WHERE employee_id = $1`,
        [person.employeeId, h.day(0)],
      );

      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Dời ngày' }).expect(200);

      expect(await blockOf(person.employeeId)).toMatchObject({ cause: 'DEPARTURE_BLOCK_NOW', blocked_from: h.day(0) });
    });

    it('goes with the handover when it is cancelled before the last working day (AC-33)', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);

      await h.cancelCase(wire.id, { reason: 'Ở lại' }).expect(200);

      expect(await blockOf(person.employeeId)).toBeUndefined();
      await me(person.account.accessToken).expect(200);
    });

    it('stays when the handover is cancelled after the block took effect, and only an unlock can lift it (AC-33)', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);
      await lastDayWasAgo(wire, person, 2);

      const cancelled = await h.cancelCase(wire.id, { reason: 'Hủy sau ngày cuối' });

      // The change of the case after the last working day is refused for a handover that is past it (`LAST_DAY_ALREADY_PASSED`): the
      // cancellation is allowed, and it keeps the block.
      expect(cancelled.status).toBe(200);
      expect(await blockOf(person.employeeId)).toMatchObject({ releasable: true, blocked_from: h.day(-1) });
      await me(person.account.accessToken).expect(401);
    });
  });

  describe('refusing the person from the first day of the block (Task 1)', () => {
    it('refuses the token, the login and the refresh from the day after the last working day, with the same answer as a person who left', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);
      const signedIn = await login(person).expect(200);
      const { accessToken, refreshToken } = h.dataOf<{ accessToken: string; refreshToken: string }>(signedIn);
      await me(accessToken).expect(200);
      await refresh(refreshToken).expect(200);
      const second = h.dataOf<{ refreshToken: string }>(await login(person).expect(200)).refreshToken;

      await lastDayWasAgo(wire, person, 1);

      const refused = [await me(accessToken), await login(person), await refresh(second)];
      expect(refused.map((response) => response.status)).toEqual([401, 401, 401]);
      const wrongPassword = await request(h.server())
        .post('/api/v1/auth/login')
        .send({ email: person.account.email, password: 'not the password at all' });
      expect(h.codeOf(refused[1])).toBe(h.codeOf(wrongPassword));
      // The case is still a handover under way: nobody marked the person left, and the employee keeps the status.
      expect((await h.caseRow(wire.id)).state).toBe('HANDING_OVER');
      expect(await h.workState(person.employeeId)).toMatch(/^ACTIVE/);
    });

    it('does not refuse on the last working day itself, only from the day after', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);

      await h.ctx.sql.query(`UPDATE offboarding_cases SET last_working_day = $2::date WHERE id = $1`, [
        wire.id,
        h.day(0),
      ]);
      await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
        person.employeeId,
        h.day(1),
      ]);

      await me(person.account.accessToken).expect(200);
      await login(person).expect(200);
    });
  });

  describe('the IT Admin does not wait for the state LEFT (Task 3, S-11)', () => {
    it('refuses the lock of the account and the revocations before the block, with CASE_NOT_BLOCKED, and lets them through after it', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);
      const early = [await h.lockAccount(wire.id, LOCK), await h.revokeRights(wire.id, { accountLock: LOCK })];
      expect(early.map((response) => [response.status, h.codeOf(response)])).toEqual([
        [409, 'OFFBOARDING_CASE.CASE_NOT_BLOCKED'],
        [409, 'OFFBOARDING_CASE.CASE_NOT_BLOCKED'],
      ]);
      expect((await h.caseRow(wire.id)).account_lock_at).toBeNull();
      expect(await h.changeKinds(wire.id)).toEqual(['RECORDED']);

      await lastDayWasAgo(wire, person, 2);

      const locked = h.dataOf<CaseWire>(await h.lockAccount(wire.id, LOCK).expect(200));
      expect(locked).toMatchObject({ state: 'HANDING_OVER', accountLock: { note: LOCK.note } });
      // Nothing is held, so there is nothing to take away: the answer comes from the selection, not from the state of the case.
      const empty = await h.revokeRights(wire.id, {});
      expect([empty.status, h.codeOf(empty)]).toEqual([409, 'OFFBOARDING_CASE.NOTHING_TO_REVOKE']);
      // Closing still needs the departure: the person has not been marked left.
      const closed = await h.closeCase(wire.id);
      expect([closed.status, h.codeOf(closed)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_LEFT']);
    });

    it('says in the list and in the case whether the person is blocked and from which day', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);
      const ahead = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
      expect([ahead.accessBlocked, ahead.accessBlockedFrom]).toEqual([false, h.day(11)]);

      await lastDayWasAgo(wire, person, 2);

      const read = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
      const listed = h
        .dataOf<{ items: CaseWire[] }>(await h.listCases('?state=HANDING_OVER&pageSize=100').expect(200))
        .items.find((row) => row.id === wire.id);
      expect([read.accessBlocked, read.accessBlockedFrom]).toEqual([true, h.day(-1)]);
      expect([listed?.accessBlocked, listed?.accessBlockedFrom]).toEqual([true, h.day(-1)]);
    });
  });

  describe('a departure blocked now (departure-block-now-mode, AC-32, Q-04 B)', () => {
    const blockNow = async (person: Person, extra: object = {}) =>
      h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: h.day(30), ...extra });

    it('keeps the case a handover under way with the last day ahead, and refuses the person from the next request', async () => {
      const person = await leaver();
      await me(person.account.accessToken).expect(200);

      const wire = await blockNow(person);

      expect(wire).toMatchObject({
        state: 'HANDING_OVER',
        accessBlockMode: 'BLOCK_NOW',
        lastWorkingDay: h.day(30),
        handoverDueOn: null,
        accessBlocked: true,
        accessBlockedFrom: h.today(),
      });
      expect(await blockOf(person.employeeId)).toMatchObject({ cause: 'DEPARTURE_BLOCK_NOW', blocked_from: h.today() });
      await me(person.account.accessToken).expect(401);
      await login(person).expect(401);
      // The IT Admin locks the company account and opens the revocations at once, the person not being marked left.
      await h.lockAccount(wire.id, LOCK).expect(200);
      const empty = await h.revokeRights(wire.id, {});
      expect([empty.status, h.codeOf(empty)]).toEqual([409, 'OFFBOARDING_CASE.NOTHING_TO_REVOKE']);
      expect((await h.caseRow(wire.id)).state).toBe('HANDING_OVER');
    });

    it('does not open the access again when the last working day moves: only the block that follows the last day moves (R-11)', async () => {
      const person = await leaver();
      const wire = await blockNow(person);

      const moved = await h.changeLastDay(wire.id, { lastWorkingDay: h.day(45), reason: 'Dời ngày cuối' });
      expect([moved.status, moved.status === 200 ? null : h.codeOf(moved)]).toEqual([200, null]);

      expect(await blockOf(person.employeeId)).toMatchObject({ cause: 'DEPARTURE_BLOCK_NOW', blocked_from: h.today() });
      const read = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
      expect([read.lastWorkingDay, read.accessBlockedFrom]).toEqual([h.day(45), h.today()]);
      await login(person).expect(401);
    });

    it('lets the person leave only from the last working day, and the day they left is that day', async () => {
      const person = await leaver();
      const wire = await blockNow(person);

      const early = await h.markLeft(wire.id);
      expect([early.status, h.codeOf(early)]).toEqual([409, 'OFFBOARDING_CASE.LAST_WORKING_DAY_AHEAD']);
      expect(h.detailsOf(early)).toEqual({ lastWorkingDay: h.day(30) });
      expect((await h.caseRow(wire.id)).state).toBe('HANDING_OVER');

      await h.ctx.sql.query(`UPDATE offboarding_cases SET last_working_day = $2::date WHERE id = $1`, [
        wire.id,
        h.day(-2),
      ]);
      const left = h.dataOf<CaseWire>(await h.markLeft(wire.id).expect(200));

      expect(left).toMatchObject({ state: 'LEFT', left: { leftOn: h.day(-2) } });
      expect(await h.employeeLeftOn(person.employeeId)).toBe(h.day(-2));
    });

    it('leaves the person at once when the last working day is yesterday, with the day of leaving as that day (AC-18)', async () => {
      const person = await leaver();

      const wire = await blockNow(person, { lastWorkingDay: h.day(-1) });

      expect(wire).toMatchObject({ state: 'LEFT', accessBlockMode: 'BLOCK_NOW', accessBlocked: true });
      expect((await h.caseRow(wire.id)).left_on).toBe(h.day(-1));
      expect(await h.employeeLeftOn(person.employeeId)).toBe(h.day(-1));
      await me(person.account.accessToken).expect(401);
    });

    it('refuses a last working day before the person came, and a planned handover in the past', async () => {
      const person = await leaver();
      const before = await h.caseCount(person.employeeId);

      const early = await h.recordCase(h.body(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: '2019-01-01' }));
      const planned = await h.recordCase(h.body(person, { lastWorkingDay: h.day(-1) }));

      expect([early, planned].map((response) => [response.status, h.codeOf(response)])).toEqual([
        [422, 'OFFBOARDING_CASE.LAST_WORKING_DAY_INVALID'],
        [422, 'OFFBOARDING_CASE.LAST_WORKING_DAY_INVALID'],
      ]);
      expect(await h.caseCount(person.employeeId)).toBe(before);
    });
  });

  describe('the migration of the mode (M09, R-04)', () => {
    const sqlState = async (sql: string, params: unknown[]): Promise<string | null> => {
      try {
        await h.ctx.sql.query(sql, params);
      } catch (error) {
        return (error as { code?: string }).code ?? null;
      }

      return null;
    };

    it('has dropped the old flag, keeps the mode fixed and a case blocked now without a handover deadline', async () => {
      const person = await leaver();
      const planned = await h.recordedCase(person);
      const columns = (
        await h.ctx.sql.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'offboarding_cases'`,
        )
      ).rows.map((row) => row.column_name);

      expect(columns).toContain('access_block_mode');
      expect(columns).not.toContain('abrupt');
      // The guard reads the new column: any other update goes through, the mode itself never changes.
      await h.ctx.sql.query(`UPDATE offboarding_cases SET role_flags = role_flags WHERE id = $1`, [planned.id]);
      expect(
        await sqlState(`UPDATE offboarding_cases SET access_block_mode = 'BLOCK_NOW' WHERE id = $1`, [planned.id]),
      ).toBe('55000');
      // A handover to be confirmed belongs to the mode that blocks from the last day (the check replaced before the column was dropped).
      expect(await sqlState(`UPDATE offboarding_cases SET handover_due_on = NULL WHERE id = $1`, [planned.id])).toBe(
        '23514',
      );
    });
  });

  describe('the migration (M07)', () => {
    it('writes a block for each handover under way, from the day after its last working day', async () => {
      const handing = await leaver();
      const wire = await h.recordedCase(handing);
      const left = await leaver();
      const leftWire = await h.recordedCase(left);
      await h.ctx.sql.query(`UPDATE offboarding_cases SET last_working_day = $2::date WHERE id = $1`, [
        leftWire.id,
        h.today(),
      ]);
      await h.markLeft(leftWire.id).expect(200);
      await h.ctx.sql.query(`DELETE FROM employee_access_blocks WHERE employee_id = ANY($1::uuid[])`, [
        [handing.employeeId, left.employeeId],
      ]);
      const migration = readFileSync(
        join(__dirname, '../../../prisma/migrations/20261108100000_identity_employee_access_blocks/migration.sql'),
        'utf8',
      );
      const backfill = migration.slice(migration.indexOf('INSERT INTO "employee_access_blocks"'));

      await h.ctx.sql.query(backfill);

      expect(await blockOf(handing.employeeId)).toEqual({
        blocked_from: h.day(11),
        cause: 'DEPARTURE_LAST_DAY',
        releasable: false,
        source_case_id: wire.id,
      });
      // A case that already left needs no block: the status of the employee refuses the person.
      expect(await blockOf(left.employeeId)).toBeUndefined();
      // Running it again changes nothing.
      await h.ctx.sql.query(backfill);
      expect(await blockOf(handing.employeeId)).toMatchObject({ source_case_id: wire.id });
    });
  });

  // Last in the file: the procedure blocks the Super Admin, whose token the rest of the file would need.
  describe('the controlled procedure (departure-block-now-mode, Task 4)', () => {
    it('maps abrupt-departure-record to a departure blocked now: a last working day ahead keeps the Super Admin handing over, but refused', async () => {
      const subject = h.seed.superAdmin;
      await h.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [subject.employeeId]);
      const subjectCode = (
        await h.ctx.sql.query<{ employee_code: string }>(`SELECT employee_code FROM employees WHERE id = $1`, [
          subject.employeeId,
        ])
      ).rows[0].employee_code;

      const recorded = await recordAsSuperAdmin(h.ctx.app, subjectCode, 'R-AB-001', {
        mode: 'abrupt-departure-record',
        lastWorkingDay: h.day(5),
      });

      expect(recorded.outcome).toBe('RECORDED');
      const row = await h.caseRow(recorded.recordId);
      expect([row.state, row.access_block_mode, row.handover_due_on]).toEqual(['HANDING_OVER', 'BLOCK_NOW', null]);
      expect(await blockOf(subject.employeeId)).toMatchObject({
        cause: 'DEPARTURE_BLOCK_NOW',
        blocked_from: h.today(),
      });
      await me(h.sa.accessToken).expect(401);
    });
  });
});
