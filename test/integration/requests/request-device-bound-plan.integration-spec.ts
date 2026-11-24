import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * MF-1 & S-4 protection against device-bound K4 plans (`W2-18`, `QĐ-115q`):
 * - `DEVICE_KEY` and `DEVICE_BUNDLED` plans are refused across request submission, preview, drafts, group checks, and case B catalog linking (422 `ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE`).
 * - An old Request submitted while a K4 plan was `ACCOUNT` and later changed to `DEVICE_KEY` cannot be granted via provisioning (409 `PROVISIONING.PLAN_BOUND_TO_DEVICE`), leaving stock and `device_activation_occupied` unchanged.
 */
describe('MF-1 blocking device-bound K4 plans and S-4 provisioning guard (integration, real PostgreSQL)', () => {
  let design: Department;
  let head: Person;
  let designer: Person;
  let designer2: Person;
  let autocadAppId: string;
  let deviceKeyPlanId: string;
  let deviceBundledPlanId: string;
  let accountPlanId: string;
  let convertibleAccountPlanId: string;
  let seq = 0;

  const unique = (prefix: string): string => `${prefix} ${(seq += 1)}`;
  const server = () => h.server();

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('W218-DES');
    head = await h.staff(design, 'W218-H1');
    designer = await h.staff(design, 'W218-E1');
    designer2 = await h.staff(design, 'W218-E2');
    await h.makeHead(design, head);
    await h.setItAdminInCharge(design, { employeeId: h.it1.employeeId, account: h.it1 });

    autocadAppId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: 'AutoCAD W2-18',
      kind: 'LICENSED',
      vendorName: unique('Autodesk'),
      dataSensitivity: 'LOW',
    });

    deviceKeyPlanId = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: autocadAppId,
      name: 'AutoCAD Device Key',
      provisioningType: 'K4',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
      keyBinding: 'DEVICE_KEY',
    });

    const osAppId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: 'Windows OEM W2-18',
      kind: 'LICENSED',
      vendorName: unique('Microsoft'),
      dataSensitivity: 'LOW',
    });

    deviceBundledPlanId = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: osAppId,
      name: 'Windows 11 Pro OEM',
      provisioningType: 'K4',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
      keyBinding: 'DEVICE_BUNDLED',
    });

    const officeAppId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: 'Office W2-18',
      kind: 'LICENSED',
      vendorName: unique('OfficeVendor'),
      dataSensitivity: 'LOW',
    });

    accountPlanId = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: officeAppId,
      name: 'Office LTSC Account',
      provisioningType: 'K4',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });

    const legacyAppId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: 'Legacy K4 App W2-18',
      kind: 'LICENSED',
      vendorName: unique('LegacyVendor'),
      dataSensitivity: 'LOW',
    });

    convertibleAccountPlanId = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: legacyAppId,
      name: 'Convertible K4 Plan',
      provisioningType: 'K4',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('(a) refuses submitting, previewing, drafting, and group-checking DEVICE_KEY / DEVICE_BUNDLED plans with 422 ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE and writes no Request', async () => {
    const beforeCount = await h.requestRows();

    for (const planId of [deviceKeyPlanId, deviceBundledPlanId]) {
      const submitRes = await h.submit(h.form(planId), designer.account).expect(422);
      expect(bodyOf(submitRes).error.code).toBe('ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE');

      const previewRes = await h.previewRequest({ planId }, designer.account).expect(422);
      expect(bodyOf(previewRes).error.code).toBe('ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE');

      const draftRes = await request(server())
        .post('/api/v1/access-requests/drafts')
        .set(h.as(designer.account))
        .send({ kind: 'INDIVIDUAL', ...h.form(planId) })
        .expect(422);
      expect(bodyOf(draftRes).error.code).toBe('ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE');

      const groupCheckRes = await request(server())
        .post('/api/v1/group-requests/check')
        .set(h.as(designer.account))
        .send({
          planId,
          businessReason: 'Need for team',
          lines: [{ employeeId: designer.employeeId }, { employeeId: designer2.employeeId }],
        })
        .expect(422);
      expect(bodyOf(groupCheckRes).error.code).toBe('ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE');
    }

    expect(await h.requestRows()).toBe(beforeCount);
  });

  it('(c) refuses linking a case B proposal to a DEVICE_BUNDLED plan with 422 ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE', async () => {
    const proposal = await h.proposed(designer, {
      softwareName: 'Custom OS Proposal',
      homepageUrl: 'https://custom-os.example.com',
    });
    await h.decide(proposal.id, { decision: 'APPROVE' }, head.account).expect(200);
    await h.saveAssessment(proposal.id, h.assessmentBody({ provisioningType: 'K4' }), h.it1).expect(200);
    await h.completeAssessment(proposal.id, h.it1).expect(200);
    await h.ctx.sql.query(`UPDATE access_requests SET state = 'AWAITING_EXECUTION' WHERE id = $1`, [proposal.id]);

    const linked = await h.linkPlan(proposal.id, deviceBundledPlanId, h.it1).expect(422);
    expect(bodyOf(linked).error.code).toBe('ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE');
  });

  it('(d) allows requesting a K4 ACCOUNT plan as before', async () => {
    const sent = await h.sent(designer, accountPlanId);

    expect(sent.plan?.planId).toBe(accountPlanId);
  });

  it('(e, S-4) refuses granting an older Request after its K4 plan moved from ACCOUNT to DEVICE_KEY (409 PROVISIONING.PLAN_BOUND_TO_DEVICE)', async () => {
    const req = await h.sent(designer2, convertibleAccountPlanId);
    await h.decide(req.id, { decision: 'APPROVE' }, head.account).expect(200);
    await h.ctx.sql.query(`UPDATE access_requests SET state = 'AWAITING_EXECUTION' WHERE id = $1`, [req.id]);

    await request(server())
      .patch(`/api/v1/plans/${convertibleAccountPlanId}`)
      .set(h.as(h.it1))
      .send({ keyBinding: 'DEVICE_KEY' })
      .expect(200);

    const subscriptionId = h.dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/subscriptions')
        .set(h.as(h.it1))
        .send({
          planId: convertibleAccountPlanId,
          kind: 'PERPETUAL',
          purchasedQuantity: 5,
          unitPrice: { amount: '1500000', currency: 'VND' },
          startDate: h.today(),
          responsibleItAdminEmployeeId: h.it1.employeeId,
        })
        .expect(201),
    ).id;

    await request(server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({
        subscriptionId,
        keys: [`S4KEY-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`],
        maxActivations: 5,
      })
      .expect(201);

    const grantRes = await h
      .grant({ requestId: req.id, beneficiaryEmployeeId: designer2.employeeId, subscriptionId }, h.it1)
      .expect(409);
    expect(bodyOf(grantRes).error.code).toBe('PROVISIONING.PLAN_BOUND_TO_DEVICE');

    const { rows: keyRows } = await h.ctx.sql.query<{ assigned_count: string }>(
      `SELECT COUNT(*) AS assigned_count FROM license_keys WHERE subscription_id = $1 AND assignment_id IS NOT NULL`,
      [subscriptionId],
    );
    expect(Number(keyRows[0].assigned_count)).toBe(0);

    const { rows: actRows } = await h.ctx.sql.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM device_activations WHERE plan_id = $1 AND deactivated_at IS NULL`,
      [convertibleAccountPlanId],
    );
    expect(Number(actRows[0].cnt)).toBe(0);
  });
});
