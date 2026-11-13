import request from 'supertest';
import { BlockAnnouncementService } from '../../../src/modules/personnel/departure-deadline/block-announcement.service';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;

interface ItHandoverWire {
  state: 'PENDING' | 'DONE';
  subscriptions: number;
  applications: number;
  handedOver: { at: string; toItAdminEmployeeId: string; subscriptions: number; applications: number } | null;
}

/**
 * X-IT.3 (`QĐ-110j`, `QĐ-111g`, `R-8`, `R-26`, SPEC P5, T-IT): the IT Admin who leaves hands every subscription and application they answer
 * for to another IT Admin in one operation, for a departure and a transfer alike. The `itHandover` section is kept when the file is recorded;
 * before the block (or the day the transfer takes effect) only the person who leaves may hand over, from then on any IT Admin; at the milestone
 * every IT Admin is told once; nothing is ever held back by it. On real PostgreSQL, through the routes.
 */
describe('the hand-over of an IT Admin who leaves, over HTTP (integration, real PostgreSQL)', () => {
  let counter = 0;
  let target: Person;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const u = await h.departmentWithHead('P-IH-T');
    target = await h.worker(u.department, 'IH-TARGET', ['IT_ADMIN']);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-IH${counter}`);
    await h.budgetFor(u, { total: 200 * M, held: 20 * M, spent: 40 * M });

    return u;
  };

  /** An IT Admin of the department who answers for `things` subscriptions and as many applications. */
  const itAdminWith = async (u: Unit, things: number): Promise<Person> => {
    counter += 1;
    const person = await h.worker(u.department, `IH-LEAVER${counter}`, ['IT_ADMIN']);
    for (let index = 0; index < things; index += 1) {
      const subscriptionId = await h.subscription(10);
      await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
        subscriptionId,
        person.employeeId,
      ]);
      await h.ctx.sql.query(
        `UPDATE applications SET responsible_it_admin_employee_id = $2
          WHERE id = (SELECT p.application_id FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.id = $1)`,
        [subscriptionId, person.employeeId],
      );
    }

    return person;
  };

  const handOver = (
    kind: 'offboarding-cases' | 'department-transfers',
    id: string,
    to: string,
    by: Person['account'],
  ) =>
    request(h.server()).post(`/api/v1/${kind}/${id}/it-admin-handover`).set(h.as(by)).send({ toItAdminEmployeeId: to });
  const itHandoverOf = async (id: string): Promise<ItHandoverWire | null> =>
    h.dataOf<{ itHandover: ItHandoverWire | null }>(await h.readCase(id).expect(200)).itHandover;
  const holders = async (leaverId: string): Promise<{ subscriptions: number; applications: number }> => {
    const subscriptions = await h.ctx.sql.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM subscriptions WHERE responsible_it_admin_employee_id = $1',
      [leaverId],
    );
    const applications = await h.ctx.sql.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM applications WHERE responsible_it_admin_employee_id = $1',
      [leaverId],
    );

    return { subscriptions: subscriptions.rows[0].n, applications: applications.rows[0].n };
  };
  const notices = async (code: string, subjectId: string) =>
    (
      await h.ctx.sql.query<{ recipient: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id AS recipient, params FROM in_app_notifications
          WHERE code = $1 AND subject_id = $2 ORDER BY recipient_employee_id`,
        [code, subjectId],
      )
    ).rows;
  const auditActions = async (resourceId: string): Promise<string[]> =>
    (
      await h.ctx.sql.query<{ action: string }>(
        'SELECT action FROM audit_events WHERE resource_id = $1 ORDER BY action',
        [resourceId],
      )
    ).rows.map((row) => row.action);

  describe('the item of the file (R-8)', () => {
    it('is kept when the departure of an IT Admin who answers for something is recorded, and shown pending with what is left', async () => {
      const u = await unit();
      const leaver = await itAdminWith(u, 2);

      const recorded = await h.recordedCase(leaver);

      expect(await itHandoverOf(recorded.id)).toEqual({
        state: 'PENDING',
        subscriptions: 2,
        applications: 2,
        handedOver: null,
      });
      const { rows } = await h.ctx.sql.query<{ subscriptions_at_record: number; applications_at_record: number }>(
        'SELECT subscriptions_at_record, applications_at_record FROM it_admin_handovers WHERE offboarding_case_id = $1',
        [recorded.id],
      );
      expect(rows).toEqual([{ subscriptions_at_record: 2, applications_at_record: 2 }]);
    });

    it('is not made for a person who answers for nothing, and the section is null', async () => {
      const u = await unit();
      const plain = await h.worker(u.department, `IH-PLAIN${counter}`);

      const recorded = await h.recordedCase(plain);

      expect(await itHandoverOf(recorded.id)).toBeNull();
      const { rowCount } = await h.ctx.sql.query('SELECT 1 FROM it_admin_handovers WHERE offboarding_case_id = $1', [
        recorded.id,
      ]);
      expect(rowCount).toBe(0);
    });
  });

  describe('before the block: only the IT Admin who leaves (R-26)', () => {
    it('refuses another IT Admin with 403 and moves nothing; the person who leaves hands everything over', async () => {
      const u = await unit();
      const leaver = await itAdminWith(u, 2);
      const recorded = await h.recordedCase(leaver);

      const refused = await handOver('offboarding-cases', recorded.id, target.employeeId, h.it1);
      expect(refused.status).toBe(403);
      expect((refused.body as { error: { code: string } }).error.code).toBe('IT_HANDOVER.NOT_YET_YOURS');
      expect(await holders(leaver.employeeId)).toEqual({ subscriptions: 2, applications: 2 });

      const done = await handOver('offboarding-cases', recorded.id, target.employeeId, leaver.account).expect(200);

      expect(h.dataOf(done)).toMatchObject({
        sourceKind: 'OFFBOARDING_CASE',
        sourceId: recorded.id,
        fromEmployeeId: leaver.employeeId,
        toItAdminEmployeeId: target.employeeId,
        subscriptions: 2,
        applications: 2,
      });
      expect(await holders(leaver.employeeId)).toEqual({ subscriptions: 0, applications: 0 });
      expect(await itHandoverOf(recorded.id)).toMatchObject({
        state: 'DONE',
        subscriptions: 0,
        applications: 0,
        handedOver: { toItAdminEmployeeId: target.employeeId, subscriptions: 2, applications: 2 },
      });
    });

    it('writes the Audit Trail (the file and each thing moved, naming the file), the log of the case and the notice of the one who took it', async () => {
      const u = await unit();
      const leaver = await itAdminWith(u, 1);
      const recorded = await h.recordedCase(leaver);

      await handOver('offboarding-cases', recorded.id, target.employeeId, leaver.account).expect(200);

      expect(await auditActions(recorded.id)).toContain('OFFBOARDING_CASE.IT_ADMIN_HANDED_OVER');
      expect(await h.changeKinds(recorded.id)).toContain('IT_ADMIN_HANDED_OVER');
      const moved = await h.ctx.sql.query<{ action: string; after: Record<string, unknown> }>(
        `SELECT action, after FROM audit_events WHERE action LIKE '%.RESPONSIBILITY_TRANSFERRED'
            AND after ->> 'sourceId' = $1 ORDER BY action`,
        [recorded.id],
      );
      expect(moved.rows.map((row) => row.action)).toEqual([
        'APPLICATION.RESPONSIBILITY_TRANSFERRED',
        'SUBSCRIPTION.RESPONSIBILITY_TRANSFERRED',
      ]);
      expect(moved.rows[0].after).toMatchObject({
        responsibleItAdminEmployeeId: target.employeeId,
        sourceKind: 'OFFBOARDING_CASE',
      });
      const received = await notices('IT_ADMIN_HANDOVER_RECEIVED', recorded.id);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        recipient: target.employeeId,
        params: { fromEmployeeId: leaver.employeeId, subscriptions: 1, applications: 1 },
      });
    });
  });

  describe('from the block: any IT Admin', () => {
    it('lets another IT Admin hand over once the access is blocked (a departure blocked now)', async () => {
      const u = await unit();
      const leaver = await itAdminWith(u, 1);
      const recorded = await h.recordedCase(leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });

      await handOver('offboarding-cases', recorded.id, target.employeeId, h.it1).expect(200);

      expect(await holders(leaver.employeeId)).toEqual({ subscriptions: 0, applications: 0 });
    });

    it('refuses the one who is not an IT Admin who works, the same person, and a second hand-over with nothing left', async () => {
      const u = await unit();
      const leaver = await itAdminWith(u, 1);
      const recorded = await h.recordedCase(leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });
      const code = (response: request.Response) => (response.body as { error: { code: string } }).error.code;

      const finance = await handOver('offboarding-cases', recorded.id, h.finance.employeeId, h.it1);
      const same = await handOver('offboarding-cases', recorded.id, leaver.employeeId, h.it1);
      expect([finance.status, code(finance)]).toEqual([422, 'IT_HANDOVER.TARGET_NOT_IT_ADMIN']);
      expect([same.status, code(same)]).toEqual([422, 'IT_HANDOVER.SAME_PERSON']);
      expect(await holders(leaver.employeeId)).toEqual({ subscriptions: 1, applications: 1 });

      await handOver('offboarding-cases', recorded.id, target.employeeId, h.it1).expect(200);
      const again = await handOver('offboarding-cases', recorded.id, target.employeeId, h.it1);
      expect([again.status, code(again)]).toEqual([409, 'IT_HANDOVER.NOTHING_TO_HAND_OVER']);
    });

    it('is the IT Admin’s alone, and a case that does not exist is 404', async () => {
      const u = await unit();
      const leaver = await itAdminWith(u, 1);
      const recorded = await h.recordedCase(leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });

      expect((await handOver('offboarding-cases', recorded.id, target.employeeId, h.sa)).status).toBe(403);
      expect(
        (await handOver('offboarding-cases', '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', target.employeeId, h.it1)).status,
      ).toBe(404);
    });

    it('is refused for a departure that was cancelled', async () => {
      const u = await unit();
      const leaver = await itAdminWith(u, 1);
      const recorded = await h.recordedCase(leaver);
      await h.cancelCase(recorded.id, { reason: 'changed their mind' }).expect(200);

      const refused = await handOver('offboarding-cases', recorded.id, target.employeeId, leaver.account);

      expect([refused.status, (refused.body as { error: { code: string } }).error.code]).toEqual([
        409,
        'IT_HANDOVER.SOURCE_CANCELLED',
      ]);
    });
  });

  describe('the milestone: every IT Admin is told once, nothing is held back (R-26, QĐ-110j)', () => {
    it('tells every IT Admin who works at the block moment when the person still answers for something, once, and not when it was handed over', async () => {
      const u = await unit();
      const leaver = await itAdminWith(u, 2);
      const recorded = await h.recordedCase(leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });
      const done = await itAdminWith(u, 1);
      const handedOver = await h.recordedCase(done, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });
      await handOver('offboarding-cases', handedOver.id, target.employeeId, h.it1).expect(200);
      const pass = () =>
        h.ctx.app.get(BlockAnnouncementService, { strict: false }).announce(new Date(Date.now() + 60_000));

      await pass();
      await pass();

      const told = await notices('IT_ADMIN_HANDOVER_PENDING', recorded.id);
      expect(told.map((notice) => notice.recipient)).toEqual(
        expect.arrayContaining([h.it1.employeeId, target.employeeId]),
      );
      expect(told.map((notice) => notice.recipient)).not.toContain(leaver.employeeId);
      expect(new Set(told.map((notice) => notice.recipient)).size).toBe(told.length);
      expect(told[0].params).toMatchObject({
        sourceKind: 'OFFBOARDING_CASE',
        sourceId: recorded.id,
        employeeId: leaver.employeeId,
      });
      expect(await notices('IT_ADMIN_HANDOVER_PENDING', handedOver.id)).toEqual([]);
    });

    it('does not hold the case back: it is read, changed and cancelled with the hand-over undone', async () => {
      const u = await unit();
      const leaver = await itAdminWith(u, 1);
      const recorded = await h.recordedCase(leaver);

      await h
        .changeLastDay(recorded.id, { lastWorkingDay: h.day(12), reason: 'Kéo dài thời gian bàn giao' })
        .expect(200);
      const cancelled = await h.cancelCase(recorded.id, { reason: 'changed their mind' });

      expect(cancelled.status).toBe(200);
      expect(await holders(leaver.employeeId)).toEqual({ subscriptions: 1, applications: 1 });
    });
  });
  describe('a transfer: the same hand-over, the milestone is the day it takes effect (SPEC P5)', () => {
    const readTransfer = async (id: string) =>
      h.dataOf<{ itHandover: ItHandoverWire | null }>(await h.readTransfer(id).expect(200));

    it('keeps the item when the transfer is recorded; before the day only the one who moves hands over, and the record shows it done', async () => {
      const u = await unit();
      const mover = await itAdminWith(u, 1);
      const dest = await unit();
      const wire = await h.recorded({
        employeeId: mover.employeeId,
        toDepartmentId: dest.department.id,
        effectiveOn: h.day(10),
        groundsNote: h.groundsNote,
      });
      expect((await readTransfer(wire.id)).itHandover).toEqual({
        state: 'PENDING',
        subscriptions: 1,
        applications: 1,
        handedOver: null,
      });

      const early = await handOver('department-transfers', wire.id, target.employeeId, h.it1);
      expect([early.status, (early.body as { error: { code: string } }).error.code]).toEqual([
        403,
        'IT_HANDOVER.NOT_YET_YOURS',
      ]);
      const done = await handOver('department-transfers', wire.id, target.employeeId, mover.account).expect(200);

      expect(h.dataOf(done)).toMatchObject({ sourceKind: 'DEPARTMENT_TRANSFER', subscriptions: 1, applications: 1 });
      expect((await readTransfer(wire.id)).itHandover).toMatchObject({
        state: 'DONE',
        subscriptions: 0,
        handedOver: { toItAdminEmployeeId: target.employeeId, subscriptions: 1, applications: 1 },
      });
      expect(await auditActions(wire.id)).toContain('DEPARTMENT_TRANSFER.IT_ADMIN_HANDED_OVER');
    });

    it('lets any IT Admin hand over from the day it takes effect, and tells every IT Admin once when the grace opens', async () => {
      const u = await unit();
      const mover = await itAdminWith(u, 2);
      const dest = await unit();

      const wire = await h.moveToday(mover, dest.department);

      const told = await notices('IT_ADMIN_HANDOVER_PENDING', wire.id);
      expect(told.map((notice) => notice.recipient)).toEqual(
        expect.arrayContaining([h.it1.employeeId, target.employeeId]),
      );
      expect(told[0].params).toMatchObject({ sourceKind: 'DEPARTMENT_TRANSFER', employeeId: mover.employeeId });
      await handOver('department-transfers', wire.id, target.employeeId, h.it1).expect(200);
      expect(await holders(mover.employeeId)).toEqual({ subscriptions: 0, applications: 0 });
    });

    it('is refused for a transfer that was cancelled', async () => {
      const u = await unit();
      const mover = await itAdminWith(u, 1);
      const dest = await unit();
      const wire = await h.recorded({
        employeeId: mover.employeeId,
        toDepartmentId: dest.department.id,
        effectiveOn: h.day(10),
        groundsNote: h.groundsNote,
      });
      await h.cancelTransfer(wire.id, { groundsNote: h.groundsNote, reason: 'changed their mind' }).expect(200);

      const refused = await handOver('department-transfers', wire.id, target.employeeId, mover.account);

      expect([refused.status, (refused.body as { error: { code: string } }).error.code]).toEqual([
        409,
        'IT_HANDOVER.SOURCE_CANCELLED',
      ]);
    });
  });
});
