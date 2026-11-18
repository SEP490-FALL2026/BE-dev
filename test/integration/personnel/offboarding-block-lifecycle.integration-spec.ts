import request from 'supertest';
import { businessDateAt, addDays } from '../../../src/core/business-date';
import { ACCOUNT_PASSWORD } from '../../support/api-accounts';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();
const LOCK = { note: 'Đã khóa tài khoản công ty' };

interface BlockRow {
  blocked_from: string;
  cause: string;
  releasable: boolean;
  source_case_id: string | null;
}

/**
 * The life of the block a departure puts on the access (`QĐ-100q`, `QĐ-81`): the lock of the company account survives a cancellation, a new
 * departure never lifts a block in force, the Super Admin lifts a block the cancelled departure left with an unlock and a reason, and the
 * day it begins is the day of the organization. Over HTTP, on real PostgreSQL.
 */
describe('the block of a departure over its life (integration, real PostgreSQL)', () => {
  let des: Department;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-BL');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const leaver = async (): Promise<Person> => h.worker(des, `E-BL-${(counter += 1)}`);
  const me = (token: string) =>
    request(h.server())
      .get('/api/v1/me')
      .set({ Authorization: `Bearer ${token}` });
  const login = (person: Person) =>
    request(h.server()).post('/api/v1/auth/login').send({ email: person.account.email, password: ACCOUNT_PASSWORD });
  const unlock = (person: Person, reason = 'Hủy bàn giao, mở lại truy cập') =>
    request(h.server()).post(`/api/v1/app-users/${person.account.appUserId}/unlock`).set(h.as(h.sa)).send({ reason });
  const blockOf = async (employeeId: string): Promise<BlockRow | undefined> =>
    (
      await h.ctx.sql.query<BlockRow>(
        `SELECT to_char(blocked_from, 'YYYY-MM-DD') AS blocked_from, cause, releasable, source_case_id::text
           FROM employee_access_blocks WHERE employee_id = $1`,
        [employeeId],
      )
    ).rows[0];
  const pastLastDay = async (wire: CaseWire, person: Person): Promise<void> => {
    await h.ctx.sql.query(
      `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
      [wire.id, h.day(-2), h.day(-1)],
    );
    await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
      person.employeeId,
      h.day(-1),
    ]);
  };
  /** A handover past its last working day, the account locked by the IT Admin, then cancelled by the Super Admin (the block stays). */
  const cancelledAfterLock = async () => {
    const person = await leaver();
    const wire = await h.recordedCase(person);
    await pastLastDay(wire, person);
    await h.lockAccount(wire.id, LOCK).expect(200);
    await h.cancelCase(wire.id, { reason: 'Ở lại' }).expect(200);

    return { person, wire };
  };

  describe('the lock of the company account and the cancellation (H1)', () => {
    it('is kept when the handover is cancelled afterwards, and the block stays for the Super Admin to lift', async () => {
      const { person, wire } = await cancelledAfterLock();

      const row = await h.caseRow(wire.id);
      expect(row.state).toBe('CANCELLED');
      expect(row.account_lock_at).not.toBeNull();
      expect(await blockOf(person.employeeId)).toMatchObject({ releasable: true, source_case_id: wire.id });
      await me(person.account.accessToken).expect(401);
    });

    it('writes the lock of the account once from the handover too (M3): the database refuses a second lock', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);
      await pastLastDay(wire, person);
      await h.lockAccount(wire.id, LOCK).expect(200);

      const attempt = async (sql: string): Promise<string | null> => {
        try {
          await h.ctx.sql.query(sql, [wire.id]);
        } catch (error) {
          return (error as { code?: string }).code ?? null;
        }

        return null;
      };

      expect(await attempt(`UPDATE offboarding_cases SET account_lock_note = 'Another' WHERE id = $1`)).toBe('55000');
      expect(
        await attempt(
          `UPDATE offboarding_cases SET account_lock_at = NULL, account_lock_by_app_user_id = NULL, account_lock_note = NULL WHERE id = $1`,
        ),
      ).toBe('55000');
    });

    it('has no default mode: the writer chooses it (L4)', async () => {
      const { rows } = await h.ctx.sql.query<{ column_default: string | null }>(
        `SELECT column_default FROM information_schema.columns WHERE table_name = 'offboarding_cases' AND column_name = 'access_block_mode'`,
      );

      expect(rows[0].column_default).toBeNull();
    });
  });

  describe('a new departure over a block in force (M1)', () => {
    it('keeps the day the person was refused from and makes the block the new departure’s own', async () => {
      const { person } = await cancelledAfterLock();
      const before = await blockOf(person.employeeId);

      const next = await h.recordedCase(person);

      const after = await blockOf(person.employeeId);
      expect(after).toMatchObject({ blocked_from: before?.blocked_from, releasable: false, source_case_id: next.id });
      expect(after?.blocked_from).toBe(h.day(-1));
      await me(person.account.accessToken).expect(401);
    });

    it('lets a block that has not begun move to the new departure’s day', async () => {
      const person = await leaver();
      const first = await h.recordedCase(person);
      await h.cancelCase(first.id, { reason: 'Ở lại' }).expect(200);
      expect(await blockOf(person.employeeId)).toBeUndefined();

      const second = await h.recordedCase(person, { lastWorkingDay: h.day(20) });

      expect(await blockOf(person.employeeId)).toMatchObject({ blocked_from: h.day(21), source_case_id: second.id });
    });
  });

  describe('lifting the block with an unlock (M2, QĐ-81)', () => {
    it('lifts the block a cancelled departure left, with the reason, and the person signs in again', async () => {
      const { person } = await cancelledAfterLock();
      await login(person).expect(401);

      await unlock(person).expect(200);

      expect(await blockOf(person.employeeId)).toBeUndefined();
      await login(person).expect(200);
      const [event] = await h.auditEventsOf('APP_USER.UNLOCKED', person.account.appUserId);
      expect(event.after).toMatchObject({
        reason: 'Hủy bàn giao, mở lại truy cập',
        departureBlockReleased: true,
      });
    });

    it('refuses to lift a block while the departure is alive, and changes nothing', async () => {
      const person = await leaver();
      const wire = await h.recordedCase(person);
      await pastLastDay(wire, person);

      const refused = await unlock(person);

      expect([refused.status, h.codeOf(refused)]).toEqual([409, 'APP_USER.ACCESS_BLOCK_NOT_RELEASABLE']);
      expect(await blockOf(person.employeeId)).toMatchObject({ releasable: false });
      await login(person).expect(401);
    });

    it('unlocks an account the departure has nothing to do with, as before, and ignores a block that has not begun', async () => {
      const person = await leaver();
      await h.recordedCase(person);

      await unlock(person).expect(200);

      expect(await blockOf(person.employeeId)).toMatchObject({ releasable: false });
    });
  });

  describe('what the case shows after a cancellation (L2, L3)', () => {
    it('shows no block for a cancelled case, and asks for the lock of a handover that is already blocked', async () => {
      const { wire } = await cancelledAfterLock();
      const cancelled = h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200));
      expect([cancelled.accessBlocked, cancelled.accessBlockedFrom]).toEqual([false, null]);

      const person = await leaver();
      const blocked = await h.recordedCase(person);
      await pastLastDay(blocked, person);
      const listed = h
        .dataOf<{ items: (CaseWire & { accountLockMissing: boolean })[] }>(
          await h.listCases('?state=HANDING_OVER&pageSize=100').expect(200),
        )
        .items.find((row) => row.id === blocked.id);

      expect([listed?.accessBlocked, listed?.accountLockMissing]).toEqual([true, true]);
    });
  });

  describe('the day of the organization, not of the server (M5)', () => {
    const ORG_ZONE = 'Asia/Ho_Chi_Minh';
    const ALL = [
      'Date',
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ] as const;

    afterEach(() => {
      jest.useRealTimers();
    });

    it('refuses from the first day of the block in the zone of the organization, when that day is already tomorrow in UTC', async () => {
      // 20:00 UTC is three o'clock of the next day in Ho Chi Minh City: the two calendars disagree about today.
      const now = new Date(`${new Date().toISOString().slice(0, 10)}T20:00:00.000Z`);
      const orgToday = businessDateAt(now, ORG_ZONE);
      expect(orgToday).toBe(addDays(now.toISOString().slice(0, 10), 1));
      // The setup is done on the real clock, whose tokens the faked one would find expired; the person signs in on the faked one.
      const person = await leaver();
      await h.recordedCase(person);
      jest.useFakeTimers({ now, doNotFake: ALL.filter((api) => api !== 'Date') });
      const token = h.dataOf<{ accessToken: string }>(await login(person).expect(200)).accessToken;

      await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
        person.employeeId,
        addDays(orgToday, 1),
      ]);
      await me(token).expect(200);
      await login(person).expect(200);

      await h.ctx.sql.query(`UPDATE employee_access_blocks SET blocked_from = $2::date WHERE employee_id = $1`, [
        person.employeeId,
        orgToday,
      ]);
      await me(token).expect(401);
      await login(person).expect(401);
    });
  });
});
