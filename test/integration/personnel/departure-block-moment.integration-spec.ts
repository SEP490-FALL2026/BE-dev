import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { nthWorkingDayFrom } from '../../../src/core/working-days';
import { AccountLockOverdueService } from '../../../src/modules/personnel/departure-deadline/account-lock-overdue.service';
import { BlockAnnouncementService } from '../../../src/modules/personnel/departure-deadline/block-announcement.service';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;
const NONE: ReadonlySet<string> = new Set();
const LOCK = { note: 'Đã đặt lại mật khẩu hộp thư và đăng xuất mọi phiên' };

interface RequestRow {
  state: string;
  cancel_cause: string | null;
}

/**
 * `MF2-E` (`QĐ-110b`, `QĐ-110d`, M-12, R-1, SPEC T-MF2): the system announces the block moment of a departure once. It ends the machines the
 * person registered, closes every request of theirs that is still open (a free `K5` one and a proposal of new software as well as the paid
 * ones), writes the audit event and the line of the log, and tells the Super Admin and the IT Admin; and it reminds that the lock of the
 * company account of a departure blocked now is late. The pass is run by hand at the instant a test names, in the calendar of the
 * organization, on real PostgreSQL.
 */
describe('the block moment of a departure (integration, real PostgreSQL)', () => {
  /** Three plans, because a person who holds a seat in a plan cannot ask for it again. */
  const plans: { plan: string; subscriptionId: string }[] = [];
  let free: string;
  let n = 0;
  let assets = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    for (let i = 0; i < 3; i += 1) {
      const subscriptionId = await h.subscription(60);
      plans.push({ plan: await h.planOf(subscriptionId), subscriptionId });
    }
    free = await h.plan('K5');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** The pass looks at every open case: the ones the tests before left are marked as announced, so each test sees only its own. */
  beforeEach(async () => {
    await h.ctx.sql.query(
      `UPDATE offboarding_cases SET block_announced_at = now() WHERE state <> 'CANCELLED' AND block_announced_at IS NULL`,
    );
  });

  const announcement = () => h.ctx.app.get(BlockAnnouncementService, { strict: false });
  const lockOverdue = () => h.ctx.app.get(AccountLockOverdueService, { strict: false });
  /** The hourly pass run by hand at noon (UTC) of `day`. */
  const passAt = (day: string) => announcement().announce(new Date(`${day}T12:00:00Z`));
  const lockPassAt = (day: string) => lockOverdue().notice(new Date(`${day}T12:00:00Z`));
  const dueAfter = (lastWorkingDay: string, days = 1): string =>
    nthWorkingDayFrom(addDays(lastWorkingDay, 1), days, NONE);

  /** A department with a head, an IT Admin in charge, a budget, and a person of it who will leave. */
  const example = async (): Promise<Unit & { leaver: Person }> => {
    n += 1;
    const u = await h.departmentWithHead(`P-BM${n}`);
    await h.budgetFor(u, { total: 200 * M, held: 20 * M, spent: 40 * M });
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const leaver = await h.worker(u.department, `BM-E${n}`);

    return { ...u, leaver };
  };
  const approvedFor = async (u: Unit, person: Person, which: number): Promise<string> => {
    const sent = await h.sent(person, plans[which].plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.setPayments(sent.id, { amount: 5 * M });
    await h.sendOn([sent.id], u.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  };
  const granted = async (requestId: string, which: number): Promise<void> => {
    await h.grant({ requestId, subscriptionId: plans[which].subscriptionId }).expect(201);
  };
  /** Every kind of request a person can have open: one not decided, one approved and waiting, a free K5 one, a proposal of new software, and one whose grant is being carried out. */
  const openRequestsOf = async (u: Unit, person: Person) => {
    const pending = (await h.sent(person, plans[0].plan, { termMonths: 1 })).id;
    const waiting = await approvedFor(u, person, 1);
    const internal = (await h.sent(person, free)).id;
    await h.decide(internal, { decision: 'APPROVE' }, u.head.account).expect(200);
    const proposal = (await h.proposed(person)).id;
    const working = await approvedFor(u, person, 2);
    await granted(working, 2);

    return { pending, waiting, internal, proposal, working };
  };
  const requestRow = async (id: string): Promise<RequestRow> =>
    (
      await h.ctx.sql.query<RequestRow>(`SELECT state::text, cancel_cause::text FROM access_requests WHERE id = $1`, [
        id,
      ])
    ).rows[0];
  const machineOf = async (holderEmployeeId: string): Promise<string> => {
    assets += 1;
    const response = await request(h.server())
      .post('/api/v1/devices')
      .set(h.as(h.it1))
      .send({ assetCode: `BM-${assets}`, hostname: `BM-HOST-${assets}`, os: 'Windows 11', holderEmployeeId });
    if (response.status !== 201) throw new Error(`device: ${response.status} ${JSON.stringify(response.body)}`);

    return h.dataOf<{ registrationId: string }>(response).registrationId;
  };
  const registrationOf = async (registrationId: string) =>
    (
      await h.ctx.sql.query<{ end_cause: string | null; ended: boolean }>(
        `SELECT end_cause::text AS end_cause, ended_at IS NOT NULL AS ended FROM device_registrations WHERE id = $1`,
        [registrationId],
      )
    ).rows[0];
  const caseRow = async (id: string) =>
    (
      await h.ctx.sql.query<{
        state: string;
        announced: boolean;
        due: string | null;
      }>(
        `SELECT state::text, block_announced_at IS NOT NULL AS announced, to_char(revocation_due_on, 'YYYY-MM-DD') AS due
           FROM offboarding_cases WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const noticesOf = async (caseId: string, code: string) =>
    (
      await h.ctx.sql.query<{ recipient: string; event_key: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id AS recipient, event_key, params FROM in_app_notifications
          WHERE code = $2 AND subject_id = $1 ORDER BY event_key`,
        [caseId, code],
      )
    ).rows;
  const auditOf = async (caseId: string, action: string) =>
    (
      await h.ctx.sql.query<{
        actor_kind: string;
        actor_app_user_id: string | null;
        correlation_id: string;
        after: Record<string, unknown>;
      }>(
        `SELECT actor_kind::text, actor_app_user_id, correlation_id, after FROM audit_events WHERE resource_id = $1 AND action = $2`,
        [caseId, action],
      )
    ).rows;
  const blockedLines = async (caseId: string) =>
    (
      await h.ctx.sql.query<{
        changed_by_app_user_id: string | null;
        changed_by_ticket_id: string | null;
        detail: Record<string, unknown>;
      }>(
        `SELECT changed_by_app_user_id, changed_by_ticket_id, detail FROM offboarding_case_changes
          WHERE case_id = $1 AND kind = 'ACCESS_BLOCKED'`,
        [caseId],
      )
    ).rows;
  const taskCount = async (): Promise<number> =>
    Number((await h.ctx.sql.query<{ n: string }>('SELECT count(*)::text AS n FROM provisioning_tasks')).rows[0].n);

  describe('a handover with a last working day', () => {
    it('announces the block once, on the first day the person is refused: machines end, every open request is cancelled, the Super Admin and the IT Admin are told', async () => {
      const u = await example();
      const person = u.leaver;
      const open = await openRequestsOf(u, person);
      const registration = await machineOf(person.employeeId);
      const wire = await h.recordedCase(person);
      const due = (await caseRow(wire.id)).due;
      expect(due).toBe(dueAfter(h.day(10)));
      const tasks = await taskCount();

      // The last working day: the person still works, nothing is announced.
      expect(await passAt(h.day(10))).toEqual({ announced: 0, failed: 0 });
      expect((await caseRow(wire.id)).announced).toBe(false);
      expect((await requestRow(open.pending)).state).not.toBe('CANCELLED');

      expect(await passAt(h.day(11))).toEqual({ announced: 1, failed: 0 });

      expect(await caseRow(wire.id)).toEqual({ state: 'HANDING_OVER', announced: true, due });
      // Every open request that has no grant begun ends as cancelled by the system; the grant being carried out is left to the IT Admin.
      for (const id of [open.pending, open.waiting, open.internal, open.proposal]) {
        expect(await requestRow(id)).toEqual({ state: 'CANCELLED', cancel_cause: 'SYSTEM_BENEFICIARY_LEFT' });
      }
      expect(await requestRow(open.working)).toMatchObject({ state: 'EXECUTING', cancel_cause: null });
      expect(await registrationOf(registration)).toEqual({ end_cause: 'DEPARTURE_BLOCKED', ended: true });
      // The audit event and the line of the log: the system wrote them, no account and no ticket.
      const audits = await auditOf(wire.id, 'OFFBOARDING_CASE.ACCESS_BLOCKED');
      expect(audits).toHaveLength(1);
      expect([audits[0].actor_kind, audits[0].actor_app_user_id, audits[0].correlation_id]).toEqual([
        'SYSTEM',
        null,
        `offboarding-block:${wire.id}`,
      ]);
      expect(audits[0].after).toMatchObject({
        employeeId: person.employeeId,
        blockedOn: h.day(11),
        revocationDueOn: due,
        machinesEnded: 1,
        requestsCancelled: 4,
        requestsToCheck: 1,
      });
      const lines = await blockedLines(wire.id);
      expect(lines.map((line) => [line.changed_by_app_user_id, line.changed_by_ticket_id])).toEqual([[null, null]]);
      expect(lines[0].detail).toMatchObject({ blockedOn: h.day(11), requestsCancelled: 4 });
      // The Super Admin is asked to mark the person as left, the IT Admin to block the account and open the revocation.
      const told = await noticesOf(wire.id, 'DEPARTURE_ACCESS_BLOCKED');
      expect(told.map((notice) => [notice.recipient, notice.params.audience, notice.event_key])).toEqual([
        [h.it1.employeeId, 'IT_ADMIN', `DEPARTURE_ACCESS_BLOCKED:${wire.id}:IT_ADMIN`],
        [h.sa.employeeId, 'SUPER_ADMIN', `DEPARTURE_ACCESS_BLOCKED:${wire.id}:SUPER_ADMIN`],
      ]);
      expect(told[0].params).toEqual({
        caseId: wire.id,
        employeeId: person.employeeId,
        departmentId: u.department.id,
        blockedOn: h.day(11),
        revocationDueOn: due,
        audience: 'IT_ADMIN',
      });
      // The grant being carried out is not touched, and the IT Admin is told to check the vendor and close it by hand.
      expect(
        (await noticesOf(open.working, 'REQUEST_BENEFICIARY_GONE_IT_CHECK')).map((notice) => notice.recipient),
      ).toEqual([h.it1.employeeId]);
      // It opens no task and takes no seat: revoking is the IT Admin's.
      expect(await taskCount()).toBe(tasks);

      // Run again, on that day or later: nothing is written twice.
      expect(await passAt(h.day(11))).toEqual({ announced: 0, failed: 0 });
      expect(await passAt(h.day(15))).toEqual({ announced: 0, failed: 0 });
      expect(await auditOf(wire.id, 'OFFBOARDING_CASE.ACCESS_BLOCKED')).toHaveLength(1);
      expect(await blockedLines(wire.id)).toHaveLength(1);
      expect(await noticesOf(wire.id, 'DEPARTURE_ACCESS_BLOCKED')).toHaveLength(2);
    }, 360_000);

    it('judges the day in the calendar of the organization: 23:59 of the last day in Ho Chi Minh City is not the moment, midnight is', async () => {
      const wire = await h.recordedCase((await example()).leaver);
      // 16:59 UTC is 23:59 in Ho Chi Minh City, still the last working day; 17:00 UTC is 00:00 of the day after.
      const lastDay = h.day(10);

      expect(await announcement().announce(new Date(`${lastDay}T16:59:00Z`))).toEqual({ announced: 0, failed: 0 });
      expect((await caseRow(wire.id)).announced).toBe(false);
      expect(await announcement().announce(new Date(`${lastDay}T17:00:00Z`))).toEqual({ announced: 1, failed: 0 });
      expect((await caseRow(wire.id)).announced).toBe(true);
    }, 180_000);

    it('writes once when two passes run together', async () => {
      const wire = await h.recordedCase((await example()).leaver);

      const passes = await Promise.all([passAt(h.day(11)), passAt(h.day(11))]);

      expect(passes.reduce((sum, pass) => sum + pass.announced, 0)).toBe(1);
      expect(await auditOf(wire.id, 'OFFBOARDING_CASE.ACCESS_BLOCKED')).toHaveLength(1);
      expect(await noticesOf(wire.id, 'DEPARTURE_ACCESS_BLOCKED')).toHaveLength(2);
    }, 180_000);

    it('announces nothing for a handover cancelled before the moment, and touches no request of the person', async () => {
      const u = await example();
      const pending = (await h.sent(u.leaver, plans[0].plan, { termMonths: 1 })).id;
      const registration = await machineOf(u.leaver.employeeId);
      const wire = await h.recordedCase(u.leaver);
      await h.cancelCase(wire.id, { reason: 'Người ở lại làm việc' }).expect(200);

      expect(await passAt(h.day(11))).toEqual({ announced: 0, failed: 0 });

      expect((await caseRow(wire.id)).announced).toBe(false);
      expect((await requestRow(pending)).state).not.toBe('CANCELLED');
      expect(await registrationOf(registration)).toEqual({ end_cause: null, ended: false });
      expect(await auditOf(wire.id, 'OFFBOARDING_CASE.ACCESS_BLOCKED')).toEqual([]);
      expect(await noticesOf(wire.id, 'DEPARTURE_ACCESS_BLOCKED')).toEqual([]);
    }, 180_000);

    it('never changes the deadline of revocation written with the case, even when the parameter changed meanwhile, and gives one to a case that has none', async () => {
      const organization = (await h.ctx.sql.query<{ id: string }>('SELECT id FROM organizations LIMIT 1')).rows[0].id;
      const recorded = await h.recordedCase((await example()).leaver);
      const kept = (await caseRow(recorded.id)).due;
      await h.ctx.sql.query(
        `INSERT INTO parameter_values (id, organization_id, key, value)
         VALUES ($2, $1, 'DEPARTURE_REVOCATION_WORKING_DAYS', '3'::jsonb)`,
        [organization, randomUUID()],
      );
      try {
        const old = await h.recordedCase((await example()).leaver, { lastWorkingDay: h.day(20) });
        await h.ctx.sql.query('BEGIN');
        await h.ctx.sql.query('ALTER TABLE offboarding_cases DISABLE TRIGGER USER');
        await h.ctx.sql.query('UPDATE offboarding_cases SET revocation_due_on = NULL WHERE id = $1', [old.id]);
        await h.ctx.sql.query('ALTER TABLE offboarding_cases ENABLE TRIGGER USER');
        await h.ctx.sql.query('COMMIT');

        await passAt(h.day(21));

        expect((await caseRow(recorded.id)).due).toBe(kept);
        expect((await caseRow(old.id)).due).toBe(dueAfter(h.day(20), 3));
        expect((await noticesOf(old.id, 'DEPARTURE_ACCESS_BLOCKED'))[0].params.revocationDueOn).toBe(
          dueAfter(h.day(20), 3),
        );
      } finally {
        await h.ctx.sql.query(
          `UPDATE parameter_values SET valid_to = now() WHERE key = 'DEPARTURE_REVOCATION_WORKING_DAYS' AND valid_to IS NULL`,
        );
      }
    }, 240_000);
  });

  describe('a person marked as left, and a departure blocked now', () => {
    it('announces a person already marked as left once: the IT Admin is told and the Super Admin is not asked to mark them', async () => {
      const u = await example();
      const wire = await h.recordedCase(u.leaver);
      await h.leaveOnLastDay(wire.id).expect(200);
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET block_announced_at = NULL WHERE id = $1`, // the marking came before the pass
        [wire.id],
      );

      expect(await announcement().announce()).toEqual({ announced: 1, failed: 0 });
      expect(await announcement().announce()).toEqual({ announced: 0, failed: 0 });

      expect((await caseRow(wire.id)).state).toBe('LEFT');
      const told = await noticesOf(wire.id, 'DEPARTURE_ACCESS_BLOCKED');
      expect(told.map((notice) => [notice.recipient, notice.params.audience])).toEqual([
        [h.it1.employeeId, 'IT_ADMIN'],
      ]);
    }, 240_000);

    it('does not ask the IT Admin to block an account they already blocked: a case locked before the pass is announced with no such notice', async () => {
      const u = await example();
      const wire = await h.recordedCase(u.leaver);
      await h.leaveOnLastDay(wire.id).expect(200);
      await h.lockAccount(wire.id, { note: 'Đã khóa tài khoản công ty' }).expect(200);
      await h.ctx.sql.query(`UPDATE offboarding_cases SET block_announced_at = NULL WHERE id = $1`, [wire.id]);

      expect(await announcement().announce()).toEqual({ announced: 1, failed: 0 });

      expect(await noticesOf(wire.id, 'DEPARTURE_ACCESS_BLOCKED')).toEqual([]);
      expect(await h.auditEventsOf('OFFBOARDING_CASE.ACCESS_BLOCKED', wire.id)).toHaveLength(1);
    }, 240_000);

    it('closes every open request at once for a departure blocked now (K5 and a proposal of new software too) and gives the case its deadline', async () => {
      const u = await example();
      const open = await openRequestsOf(u, u.leaver);
      const wire = await h.recordedCase(u.leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });
      expect((await caseRow(wire.id)).state).toBe('LEFT');

      expect(await announcement().announce()).toEqual({ announced: 1, failed: 0 });

      for (const id of [open.pending, open.waiting, open.internal, open.proposal]) {
        expect(await requestRow(id)).toEqual({ state: 'CANCELLED', cancel_cause: 'SYSTEM_BENEFICIARY_LEFT' });
      }
      expect(await requestRow(open.working)).toMatchObject({ state: 'EXECUTING' });
      expect((await caseRow(wire.id)).due).toBe(dueAfter(h.today()));
      const told = await noticesOf(wire.id, 'DEPARTURE_ACCESS_BLOCKED');
      expect(told.map((notice) => notice.params.audience)).toEqual(['IT_ADMIN']);
      expect(told[0].params.blockedOn).toBe(h.today());
    }, 360_000);
  });

  describe('the lock of the company account of a departure blocked now (R-1, QĐ-94m)', () => {
    const blockedNow = async (): Promise<CaseWire> => {
      const wire = await h.recordedCase((await example()).leaver, {
        accessBlockMode: 'BLOCK_NOW',
        lastWorkingDay: undefined,
      });
      await h.ctx.sql.query('UPDATE offboarding_cases SET block_announced_at = now() WHERE id = $1', [wire.id]);

      return wire;
    };

    it('tells the IT Admin and the Super Admin from the day after the block when the lock is not written, once for the case', async () => {
      const wire = await blockedNow();

      await lockPassAt(h.today());
      expect(await noticesOf(wire.id, 'ACCOUNT_LOCK_OVERDUE')).toEqual([]);

      await lockPassAt(h.day(1));
      await lockPassAt(h.day(2));
      await lockPassAt(h.day(1));

      const told = await noticesOf(wire.id, 'ACCOUNT_LOCK_OVERDUE');
      expect(told.map((notice) => [notice.recipient, notice.event_key]).sort()).toEqual(
        [
          [h.it1.employeeId, `ACCOUNT_LOCK_OVERDUE:${wire.id}`],
          [h.sa.employeeId, `ACCOUNT_LOCK_OVERDUE:${wire.id}`],
        ].sort(),
      );
      expect(told[0].params).toEqual({ caseId: wire.id, employeeId: wire.employee.id, blockedOn: h.today() });
      expect(
        (await auditOf(wire.id, 'OFFBOARDING_CASE.ACCOUNT_LOCK_OVERDUE')).map((event) => event.actor_kind),
      ).toEqual(['SYSTEM']);
    }, 240_000);

    it('tells a case once however the IT Admin in charge changes between two passes: no second notice for the new one, no second audit event', async () => {
      const u = await example();
      const wire = await h.recordedCase(u.leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });
      await h.ctx.sql.query('UPDATE offboarding_cases SET block_announced_at = now() WHERE id = $1', [wire.id]);
      await lockPassAt(h.day(1));
      const other = await handOthersToSecondItAdmin(h);
      await h.setItAdminInCharge(u.department, { employeeId: other.employeeId, account: other });

      const second = await lockPassAt(h.day(2));

      expect(second).toEqual({ told: 0, failed: 0 });
      const told = await noticesOf(wire.id, 'ACCOUNT_LOCK_OVERDUE');
      expect(told.map((notice) => notice.recipient).sort()).toEqual([h.it1.employeeId, h.sa.employeeId].sort());
      expect(await auditOf(wire.id, 'OFFBOARDING_CASE.ACCOUNT_LOCK_OVERDUE')).toHaveLength(1);
    }, 240_000);

    it('tells nothing when the lock is written on the day, and nothing for a handover with a last working day', async () => {
      const locked = await blockedNow();
      await h.lockAccount(locked.id, LOCK).expect(200);
      const planned = await h.recordedCase((await example()).leaver);

      await lockPassAt(h.day(1));
      await lockPassAt(h.day(30));

      expect(await noticesOf(locked.id, 'ACCOUNT_LOCK_OVERDUE')).toEqual([]);
      expect(await noticesOf(planned.id, 'ACCOUNT_LOCK_OVERDUE')).toEqual([]);
    }, 240_000);
  });

  describe('the IT Admin in charge is told when a departure is recorded, moved or cancelled (SPEC MF2-E)', () => {
    it('writes one event notice for them for each of the three, with the kind and the day only, beside the one the person who left gets', async () => {
      const u = await example();
      const wire = await h.recordedCase(u.leaver);
      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(12), reason: 'Kéo dài thời gian bàn giao' }).expect(200);
      await h.cancelCase(wire.id, { reason: 'Người ở lại làm việc' }).expect(200);

      const told = await noticesOf(wire.id, 'PERSONNEL_EVENT_RECORDED');

      const kinds = (recipient: string) =>
        told
          .filter((notice) => notice.recipient === recipient)
          .map((notice) => notice.params.eventKind)
          .sort();
      expect(kinds(h.it1.employeeId)).toEqual([
        'DEPARTURE_CANCELLED',
        'DEPARTURE_LAST_DAY_CHANGED',
        'DEPARTURE_RECORDED',
      ]);
      expect(kinds(u.leaver.employeeId)).toEqual(kinds(h.it1.employeeId));
      expect(Object.keys(told[0].params).sort()).toEqual(['departmentId', 'effectiveOn', 'employeeId', 'eventKind']);
    }, 240_000);
  });
});
