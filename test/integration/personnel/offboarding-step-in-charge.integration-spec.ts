import request from 'supertest';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Person } from '../../support/request-harness';

const h = new OffboardingHarness();

describe('offboarding technical steps acting IT Admin (H12) and Super Admin IT handover (H16b) (integration, real PostgreSQL)', () => {
  let seq = 0;
  let subscriptionId: string;

  const appointSubstitute = (departmentId: string, substituteEmployeeId: string, reason = 'Cover') =>
    request(h.server())
      .post(`/api/v1/departments/${departmentId}/it-substitutes`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ substituteEmployeeId, reason });

  const endSubstitute = (substituteId: string) =>
    request(h.server())
      .post(`/api/v1/department-it-substitutes/${substituteId}/end`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send();

  const handOver = (
    kind: 'offboarding-cases' | 'department-transfers',
    id: string,
    to: string,
    by: Person['account'],
  ) =>
    request(h.server()).post(`/api/v1/${kind}/${id}/it-admin-handover`).set(h.as(by)).send({ toItAdminEmployeeId: to });

  const nextCode = (prefix: string) => `${prefix}-${(seq += 1)}`;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(20, 'K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('H12: acting IT Admin enforcement on offboarding technical steps', () => {
    it('returns 404 outside read scope, 403 NOT_IN_CHARGE in common-queue read scope and on self-act, and allows usable in-charge without bySubstitute', async () => {
      const deptA = await h.departmentWithUnit(nextCode('H12A'));
      const deptB = await h.departmentWithUnit(nextCode('H12B'));
      const itA = await h.worker(deptA, nextCode('ITA'), ['IT_ADMIN']);
      const itB = await h.worker(deptB, nextCode('ITB'), ['IT_ADMIN']);
      await h.setItAdminInCharge(deptA, itA);
      await h.setItAdminInCharge(deptB, itB);

      const empCode = nextCode('EMP');
      const leaver = await h.worker(deptA, empCode);
      const seatId = await h.seatOf(leaver, { subscriptionId }, empCode);
      const caze = await h.recordedCase(leaver);
      await h.leaveOnLastDay(caze.id).expect(200);

      // Outside read scope (deptA has usable itA, so itB cannot see or act on it) -> 404 NOT_FOUND
      expect(h.codeOf(await h.lockAccount(caze.id, { note: 'lock' }, itB.account).expect(404))).toBe(
        'OFFBOARDING_CASE.NOT_FOUND',
      );
      expect(h.codeOf(await h.revokeRights(caze.id, { assignmentIds: [seatId] }, itB.account).expect(404))).toBe(
        'OFFBOARDING_CASE.NOT_FOUND',
      );

      // Leaver self-act while case is still HANDING_OVER (token still valid) -> 403 NOT_IN_CHARGE
      const deptC = await h.departmentWithUnit(nextCode('H12C'));
      const itLeaver = await h.worker(deptC, nextCode('ITL'), ['IT_ADMIN']);
      await h.setItAdminInCharge(deptC, itLeaver);
      const selfCase = await h.recordedCase(itLeaver);
      expect(h.codeOf(await h.lockAccount(selfCase.id, { note: 'self' }, itLeaver.account).expect(403))).toBe(
        'OFFBOARDING_CASE.NOT_IN_CHARGE',
      );
      expect(h.codeOf(await h.revokeRights(selfCase.id, {}, itLeaver.account).expect(403))).toBe(
        'OFFBOARDING_CASE.NOT_IN_CHARGE',
      );

      // Common queue: lock itA so deptA enters itB's read scope without an acting IT Admin -> read 200, write 403 NOT_IN_CHARGE
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [itA.account.appUserId]);
      try {
        await h.readCase(caze.id, itB.account).expect(200);
        expect(h.codeOf(await h.lockAccount(caze.id, { note: 'lock' }, itB.account).expect(403))).toBe(
          'OFFBOARDING_CASE.NOT_IN_CHARGE',
        );
        expect(h.codeOf(await h.revokeRights(caze.id, { assignmentIds: [seatId] }, itB.account).expect(403))).toBe(
          'OFFBOARDING_CASE.NOT_IN_CHARGE',
        );
      } finally {
        await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [itA.account.appUserId]);
      }

      // Usable in-charge itA succeeds and audit has no bySubstitute
      await h.lockAccount(caze.id, { note: 'locked by itA' }, itA.account).expect(200);
      await h.revokeRights(caze.id, { assignmentIds: [seatId], note: 'revoked by itA' }, itA.account).expect(200);

      const events = await h.auditEvents('OffboardingCase', caze.id);
      const lockAudit = events.find((e) => e.action === 'OFFBOARDING_CASE.ACCOUNT_LOCK_RECORDED');
      const revAudit = events.find((e) => e.action === 'OFFBOARDING_CASE.REVOCATIONS_OPENED');
      expect(lockAudit?.after).not.toHaveProperty('bySubstitute');
      expect(revAudit?.after).not.toHaveProperty('bySubstitute');
    });

    it('allows appointed substitute IT Admin and records bySubstitute: true in ACCOUNT_LOCK_RECORDED and REVOCATIONS_OPENED audits', async () => {
      const dept = await h.departmentWithUnit(nextCode('H12S'));
      const itInCharge = await h.worker(dept, nextCode('ITIC'), ['IT_ADMIN']);
      const itSub = await h.worker(dept, nextCode('ITSUB'), ['IT_ADMIN']);
      await h.setItAdminInCharge(dept, itInCharge);

      const empCode = nextCode('EMPS');
      const leaver = await h.worker(dept, empCode);
      const seatId = await h.seatOf(leaver, { subscriptionId }, empCode);
      const caze = await h.recordedCase(leaver);
      await h.leaveOnLastDay(caze.id).expect(200);

      const subRes = await appointSubstitute(dept.id, itSub.employeeId, 'Out of office').expect(201);
      const subId = h.dataOf<{ substitute: { id: string } }>(subRes).substitute.id;
      try {
        await h.lockAccount(caze.id, { note: 'locked by sub' }, itSub.account).expect(200);
        await h.revokeRights(caze.id, { assignmentIds: [seatId], note: 'revoked by sub' }, itSub.account).expect(200);

        const events = await h.auditEvents('OffboardingCase', caze.id);
        const lockAudit = events.find((e) => e.action === 'OFFBOARDING_CASE.ACCOUNT_LOCK_RECORDED');
        const revAudit = events.find((e) => e.action === 'OFFBOARDING_CASE.REVOCATIONS_OPENED');
        expect(lockAudit?.after).toMatchObject({ employeeId: leaver.employeeId, bySubstitute: true });
        expect(revAudit?.after).toMatchObject({ count: 1, bySubstitute: true });
      } finally {
        await endSubstitute(subId).expect(201);
      }
    });
  });

  describe('H16b: Super Admin IT handover before and after milestone, IT Admin forbidden', () => {
    const giveResponsibility = async (employeeId: string): Promise<string> => {
      const subId = await h.subscription(5, 'K2');
      await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
        subId,
        employeeId,
      ]);
      return subId;
    };

    it('rejects IT_ADMIN (even the leaver) with 403 AUTHORIZATION.FORBIDDEN and lets SUPER_ADMIN hand over before milestone for offboarding and transfer', async () => {
      const dept = await h.departmentWithUnit(nextCode('H16'));
      const destDept = await h.departmentWithUnit(nextCode('H16D'));
      const target = await h.worker(dept, nextCode('TGT'), ['IT_ADMIN']);
      const leaver = await h.worker(dept, nextCode('LVR'), ['IT_ADMIN']);
      const mover = await h.worker(dept, nextCode('MVR'), ['IT_ADMIN']);

      const offSubId = await giveResponsibility(leaver.employeeId);
      const trfSubId = await giveResponsibility(mover.employeeId);

      // Offboarding case before milestone
      const caze = await h.recordedCase(leaver);
      expect(
        h.codeOf(await handOver('offboarding-cases', caze.id, target.employeeId, leaver.account).expect(403)),
      ).toBe('AUTHORIZATION.FORBIDDEN');
      expect(
        h.codeOf(await handOver('offboarding-cases', caze.id, target.employeeId, target.account).expect(403)),
      ).toBe('AUTHORIZATION.FORBIDDEN');

      const offDone = await handOver('offboarding-cases', caze.id, target.employeeId, h.sa).expect(200);
      expect(h.dataOf(offDone)).toMatchObject({
        sourceKind: 'OFFBOARDING_CASE',
        sourceId: caze.id,
        fromEmployeeId: leaver.employeeId,
        toItAdminEmployeeId: target.employeeId,
        subscriptions: 1,
      });

      // Department transfer before milestone
      const transfer = await h.recorded({
        employeeId: mover.employeeId,
        toDepartmentId: destDept.id,
        effectiveOn: h.day(10),
        groundsNote: h.groundsNote,
      });
      expect(
        h.codeOf(await handOver('department-transfers', transfer.id, target.employeeId, mover.account).expect(403)),
      ).toBe('AUTHORIZATION.FORBIDDEN');

      const trfDone = await handOver('department-transfers', transfer.id, target.employeeId, h.sa).expect(200);
      expect(h.dataOf(trfDone)).toMatchObject({
        sourceKind: 'DEPARTMENT_TRANSFER',
        sourceId: transfer.id,
        fromEmployeeId: mover.employeeId,
        toItAdminEmployeeId: target.employeeId,
        subscriptions: 1,
      });

      const { rows } = await h.ctx.sql.query<{ id: string; responsible_it_admin_employee_id: string }>(
        `SELECT id, responsible_it_admin_employee_id FROM subscriptions WHERE id = ANY($1::uuid[])`,
        [[offSubId, trfSubId]],
      );
      expect(rows.every((r) => r.responsible_it_admin_employee_id === target.employeeId)).toBe(true);
    });
  });
});
