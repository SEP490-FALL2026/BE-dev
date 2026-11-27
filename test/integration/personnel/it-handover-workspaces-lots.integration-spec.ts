import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { ItHandoverService } from '../../../src/modules/personnel/it-handover/it-handover.service';
import { declareApplication } from '../../support/builders/catalog.builder';
import { OffboardingHarness } from '../../support/offboarding-harness';

const h = new OffboardingHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

/**
 * The hand-over of an IT Admin who answers for one workspace and one license lot and nothing else tells the workspaces and the lots it moved, in
 * its answer, in what the file keeps and in the notice of the IT Admin who took them. The service is called as a Super Admin calls the route
 * (the route itself is covered by `it-handover-http`), in the same transaction and on the same rows.
 */
describe('the hand-over of workspaces and license lots of an IT Admin who leaves (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const superAdmin = (): AuthenticatedPrincipal => ({
    subject: h.sa.appUserId,
    appUserId: h.sa.appUserId,
    sessionId: randomUUID(),
    employeeId: h.sa.employeeId,
    directRoles: ['SUPER_ADMIN'],
    roles: ['SUPER_ADMIN'],
  });

  it('answers 1 workspace and 1 license lot, keeps them in the file and tells the IT Admin who took them', async () => {
    const unit = await h.departmentWithHead('P-IHWL');
    const target = await h.worker(unit.department, 'IHWL-TARGET', ['IT_ADMIN']);
    const leaver = await h.worker(unit.department, 'IHWL-LEAVER', ['IT_ADMIN']);
    const appId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('IHWL-App'),
      kind: 'SAAS',
      vendorName: h.unique('IHWL-Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    const vendorId = (
      await h.ctx.sql.query<{ vendor_id: string }>('SELECT vendor_id FROM applications WHERE id = $1', [appId])
    ).rows[0].vendor_id;
    const workspace = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/workspaces')
        .set(h.as(leaver.account))
        .send({ vendorId, name: h.unique('IHWL-WS') })
        .expect(201),
    );
    const planId = await h.plan('K4');
    const lotId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose,
         responsible_it_admin_employee_id, updated_at)
       VALUES ($1, $2, $3, '2026-09-01', 1, 1000000, 'OPENING', $4, now())`,
      [lotId, h.seed.organizationId, planId, leaver.employeeId],
    );
    const recorded = await h.recordedCase(leaver);

    const result = await h.ctx.app
      .get(ItHandoverService, { strict: false })
      .handOver(superAdmin(), { kind: 'OFFBOARDING_CASE', id: recorded.id }, target.employeeId);

    expect(result).toMatchObject({
      fromEmployeeId: leaver.employeeId,
      toEmployeeId: target.employeeId,
      subscriptions: 0,
      applications: 0,
      workspaces: 1,
      licenseLots: 1,
    });
    const moved = await h.ctx.sql.query<{ workspaces: number; lots: number }>(
      `SELECT (SELECT count(*)::int FROM workspaces WHERE id = $1 AND responsible_it_admin_employee_id = $3) AS workspaces,
              (SELECT count(*)::int FROM license_lots WHERE id = $2 AND responsible_it_admin_employee_id = $3) AS lots`,
      [workspace.id, lotId, target.employeeId],
    );
    expect(moved.rows[0]).toEqual({ workspaces: 1, lots: 1 });
    const done = await h.ctx.sql.query<{ done_workspaces: number; done_license_lots: number }>(
      'SELECT done_workspaces, done_license_lots FROM it_admin_handovers WHERE offboarding_case_id = $1',
      [recorded.id],
    );
    expect(done.rows).toEqual([{ done_workspaces: 1, done_license_lots: 1 }]);
    const notices = await h.ctx.sql.query<{ recipient: string; params: Record<string, unknown> }>(
      `SELECT recipient_employee_id AS recipient, params FROM in_app_notifications
        WHERE code = 'IT_ADMIN_HANDOVER_RECEIVED' AND subject_id = $1`,
      [recorded.id],
    );
    expect(notices.rows).toHaveLength(1);
    expect(notices.rows[0]).toMatchObject({
      recipient: target.employeeId,
      params: { fromEmployeeId: leaver.employeeId, subscriptions: 0, applications: 0, workspaces: 1, licenseLots: 1 },
    });
  });
});
