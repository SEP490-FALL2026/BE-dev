import request from 'supertest';
import { RequestStatusRecipientsService } from '../../../src/modules/requests/status/request-status-recipients.service';
import type { RequestFacts } from '../../../src/modules/requests/status/request-status.types';
import { StatusHarness } from '../../support/status-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new StatusHarness();

/**
 * W2-27 (d) H10, H18, and criterion (k)/(u): only an acting IT Admin (usable in-charge or usable appointed
 * substitute) of the requester's department may assess a proposal; when none is usable, the assessment step waits
 * with NO_IT_ADMIN_IN_CHARGE; when a substitute acts, audit events carry bySubstitute: true; status recipients
 * resolve the acting substitute and fall back to Super Admin for GRANT_IT_ADMINS when no acting IT Admin exists.
 */
describe('requests: assessment acting IT Admin guard, H10/H18 routing, and status recipients (integration, real PostgreSQL)', () => {
  let seq = 0;
  let recipients: RequestStatusRecipientsService;
  let superAdminEmployeeId: string;

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

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    recipients = h.ctx.app.get(RequestStatusRecipientsService, { strict: false });
    superAdminEmployeeId = (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0].employee_id;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const setupDept = async (
    withInCharge: boolean,
  ): Promise<{
    dept: Department;
    head: Person;
    requester: Person;
    itA: Person | null;
  }> => {
    seq += 1;
    const dept = await h.departmentWithUnit(`P-AIC${seq}`);
    const head = await h.staff(dept, `AIC-H${seq}`);
    const requester = await h.staff(dept, `AIC-R${seq}`);
    await h.makeHead(dept, head);
    let itA: Person | null = null;
    if (withInCharge) {
      itA = await h.staff(dept, `AIC-ITA${seq}`, 'IT_ADMIN');
      await h.setItAdminInCharge(dept, itA);
    }

    return { dept, head, requester, itA };
  };

  const awaitingAssessment = async (requester: Person, head: Person) => {
    seq += 1;
    const proposed = await h.proposed(requester, { softwareName: `Tool-${seq}` });
    await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);

    return proposed;
  };

  it('refuses a non-acting IT Admin with 403 ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE on save, complete, and reject', async () => {
    const { requester, head } = await setupDept(true);
    const other = await setupDept(true);
    const itB = other.itA as Person;
    const proposed = await awaitingAssessment(requester, head);

    expect(h.codeOf(await h.saveAssessment(proposed.id, h.assessmentBody(), itB.account).expect(403))).toBe(
      'ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE',
    );
    expect(h.codeOf(await h.completeAssessment(proposed.id, itB.account).expect(403))).toBe(
      'ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE',
    );
    expect(
      h.codeOf(
        await h
          .rejectAssessment(proposed.id, { kind: 'NOT_ELIGIBLE', reason: 'Not eligible' }, itB.account)
          .expect(403),
      ),
    ).toBe('ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE');
  });

  it('keeps non-acting IT Admin refused when in-charge is locked without substitute, and leaves new assessment step WAITING (NO_IT_ADMIN_IN_CHARGE)', async () => {
    const { dept, requester, head, itA } = await setupDept(true);
    const lockedInCharge = itA as Person;
    const other = await setupDept(true);
    const itB = other.itA as Person;
    const existing = await awaitingAssessment(requester, head);

    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [lockedInCharge.account.appUserId]);
    try {
      expect(h.codeOf(await h.saveAssessment(existing.id, h.assessmentBody(), itB.account).expect(403))).toBe(
        'ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE',
      );
      expect(h.codeOf(await h.completeAssessment(existing.id, itB.account).expect(403))).toBe(
        'ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE',
      );
      expect(
        h.codeOf(
          await h
            .rejectAssessment(existing.id, { kind: 'NOT_ELIGIBLE', reason: 'Not eligible' }, itB.account)
            .expect(403),
        ),
      ).toBe('ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE');

      const createdWhileLocked = await awaitingAssessment(requester, head);
      const step = await h.stepOf(createdWhileLocked.id, 'IT_ASSESSMENT');
      expect(step).toMatchObject({
        state: 'WAITING',
        assignee_employee_id: null,
        waiting_reason: 'NO_IT_ADMIN_IN_CHARGE',
      });

      // Appointing substitute B allows B to save & complete/reject with bySubstitute: true, and routes new steps to B.
      const subRes = await appointSubstitute(dept.id, itB.employeeId, 'In-charge locked').expect(201);
      const substituteId = h.dataOf<{ substitute: { id: string } }>(subRes).substitute.id;
      try {
        const routedToSub = await awaitingAssessment(requester, head);
        expect(await h.stepOf(routedToSub.id, 'IT_ASSESSMENT')).toMatchObject({
          state: 'PENDING',
          assignee_employee_id: itB.employeeId,
          waiting_reason: null,
        });

        await h.saveAssessment(existing.id, h.assessmentBody(), itB.account).expect(200);
        await h.completeAssessment(existing.id, itB.account).expect(200);
        const savedEvents = (await h.auditEvents('ACCESS_REQUEST', existing.id)).filter(
          (ev) => ev.action === 'ACCESS_REQUEST.ASSESSMENT_SAVED',
        );
        const completedEvents = (await h.auditEvents('ACCESS_REQUEST', existing.id)).filter(
          (ev) => ev.action === 'ACCESS_REQUEST.ASSESSMENT_COMPLETED',
        );
        expect(savedEvents[0].after).toMatchObject({ bySubstitute: true });
        expect(completedEvents[0].after).toMatchObject({ bySubstitute: true });

        await h
          .rejectAssessment(routedToSub.id, { kind: 'NOT_ELIGIBLE', reason: 'Duplicate tool' }, itB.account)
          .expect(200);
        const rejectedEvents = (await h.auditEvents('ACCESS_REQUEST', routedToSub.id)).filter(
          (ev) => ev.action === 'ACCESS_REQUEST.ASSESSMENT_REJECTED',
        );
        expect(rejectedEvents[0].after).toMatchObject({ bySubstitute: true });
      } finally {
        await endSubstitute(substituteId).expect(201);
      }
    } finally {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [lockedInCharge.account.appUserId]);
    }
  });

  it('resolves appointed substitute in RequestStatusRecipientsService and falls back to Super Admin for GRANT_IT_ADMINS when no acting IT Admin exists (criterion u)', async () => {
    const { dept, requester, itA } = await setupDept(true);
    const inCharge = itA as Person;
    const other = await setupDept(true);
    const itB = other.itA as Person;
    const unstaffed = await setupDept(false);

    const reqFacts = (departmentId: string, requesterEmployeeId: string): RequestFacts => ({
      id: '00000000-0000-4000-8000-000000000001',
      organizationId: h.seed.organizationId,
      type: 'GRANT',
      branch: 'NEW_SOFTWARE',
      requesterEmployeeId,
      beneficiaryEmployeeIds: [requesterEmployeeId],
      departmentId,
      withdrawnByEmployeeId: null,
      withdrawalReason: null,
    });

    const subRes = await appointSubstitute(dept.id, itB.employeeId, 'Cover notifications').expect(201);
    const substituteId = h.dataOf<{ substitute: { id: string } }>(subRes).substitute.id;
    try {
      const withSub = await recipients.holdersOf(
        ['IT_ADMIN', 'GRANT_IT_ADMINS'],
        reqFacts(dept.id, requester.employeeId),
        h.today(),
      );
      expect(withSub.itAdminEmployeeId).toBe(itB.employeeId);
      expect(withSub.grantItAdminEmployeeIds).toEqual(expect.arrayContaining([inCharge.employeeId, itB.employeeId]));
      expect(withSub.grantItAdminEmployeeIds).toHaveLength(2);
    } finally {
      await endSubstitute(substituteId).expect(201);
    }

    const withoutActing = await recipients.holdersOf(
      ['IT_ADMIN', 'GRANT_IT_ADMINS'],
      reqFacts(unstaffed.dept.id, unstaffed.requester.employeeId),
      h.today(),
    );
    expect(withoutActing.itAdminEmployeeId).toBeNull();
    expect(withoutActing.grantItAdminEmployeeIds).toEqual([superAdminEmployeeId]);
  });
});
