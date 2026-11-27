import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import type { ApiAccount } from '../../support/api-accounts';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

describe('workspaceGet and workspaceList live subscriptionCount (integration, real PostgreSQL)', () => {
  let khoa: ApiAccount;
  let nam: ApiAccount;
  let appId: string;
  let vendorId: string;

  beforeAll(async () => {
    await h.start();
    khoa = h.it1;
    nam = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-WSC-NAM', email: 'wsc-nam@acme.vn', role: 'IT_ADMIN' });
    appId = await declareApplication(h.ctx, khoa.accessToken, {
      name: h.unique('WSC-App'),
      kind: 'SAAS',
      vendorName: h.unique('WSC-Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    vendorId = (
      await h.ctx.sql.query<{ vendor_id: string }>('SELECT vendor_id FROM applications WHERE id = $1', [appId])
    ).rows[0].vendor_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('counts only live subscriptions (2) and excludes renewed, expired, and closed ones on workspaceGet and workspaceList', async () => {
    const wsRes = await request(h.server())
      .post('/api/v1/workspaces')
      .set(h.as(khoa))
      .send({ vendorId, name: h.unique('WSC-Workspace') })
      .expect(201);
    const ws = h.dataOf<{ id: string; updatedAt: string }>(wsRes);
    await request(h.server())
      .put(`/api/v1/workspaces/${ws.id}/admins`)
      .set(h.as(khoa))
      .send({
        admins: [
          { employeeId: khoa.employeeId, role: 'OWNER' },
          { employeeId: nam.employeeId, role: 'ADMIN' },
        ],
        primaryOwnerEmployeeId: khoa.employeeId,
        expectedUpdatedAt: ws.updatedAt,
      })
      .expect(200);

    const makeK2 = (suffix: string) =>
      declarePlan(h.ctx, khoa.accessToken, {
        applicationId: appId,
        name: h.unique(`WSC-${suffix}`),
        provisioningType: 'K2',
        pricingModel: 'PER_SEAT',
        controlLevel: 'FULL',
      });

    const today = await h.ctx.app.get(OrganizationReadApi, { strict: false }).businessToday();
    const planLive1 = await makeK2('Live1');
    const planLive2 = await makeK2('Live2');
    const planExpired = await makeK2('Expired');
    const planClosed = await makeK2('Closed');

    // 1. Live active term (which continues an older renewed period -> only the successor is counted)
    const oldPeriod = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/subscriptions')
        .set(h.as(khoa))
        .send({
          planId: planLive1,
          workspaceId: ws.id,
          kind: 'TERM',
          purchasedQuantity: 1,
          unitPrice: { amount: '500000', currency: 'VND' },
          billingCycle: 'MONTHLY',
          commitmentTermMonths: 1,
          startDate: addDays(today, -28),
          renewalDate: addDays(today, 2),
        })
        .expect(201),
    );
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (
         id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis,
         granted_on, created_by_app_user_id
       ) VALUES (
         gen_random_uuid(), $1, 'PERSONAL'::"AssignmentKind", 'REQUEST'::"AssignmentSource",
         $2, $3, $4, 'wsc-khoa@acme.vn', 'wsc-khoa@acme.vn', $5::date, 'ACTUAL'::"AssignmentDateBasis",
         $5::date, $6
       )`,
      [h.seed.organizationId, planLive1, oldPeriod.id, khoa.employeeId, addDays(today, -28), khoa.appUserId],
    );
    await request(h.server())
      .post('/api/v1/subscription-renewals')
      .set(h.as(khoa))
      .send({
        subscriptionId: oldPeriod.id,
        choice: 'RENEW',
        proposedQuantity: 1,
        outcome: 'AS_DECIDED',
        nextPeriod: {
          purchasedQuantity: 1,
          unitPrice: { amount: '500000', currency: 'VND' },
          billingCycle: 'MONTHLY',
          startDate: addDays(today, 2),
          renewalDate: addDays(today, 32),
          autoRenew: true,
          allowsMidTermReduction: false,
        },
      })
      .expect(201);

    // 2. Live draft subscription (omits unitPrice and billingCycle so it remains DRAFT)
    await request(h.server())
      .post('/api/v1/subscriptions')
      .set(h.as(khoa))
      .send({
        planId: planLive2,
        workspaceId: ws.id,
        kind: 'TERM',
        startDate: today,
      })
      .expect(201);

    // 3. Expired active term (end_date < today) -> excluded
    await h.ctx.sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, workspace_id, kind, status, purchased_quantity,
         unit_price_minor, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source,
         price_reporting_minor, price_reporting_currency, monthly_unit_price_minor,
         billing_cycle, commitment_term_months, start_date, end_date, responsible_it_admin_employee_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'TERM', 'ACTIVE', 5,
         500000, 'VND', $4::date, 1.0, $4::date, 'SAME_CURRENCY'::"PriceRateSource",
         500000, 'VND', 500000,
         'MONTHLY', 1, $4::date, $5::date, $6, now())`,
      [h.seed.organizationId, planExpired, ws.id, addDays(today, -40), addDays(today, -10), khoa.employeeId],
    );

    // 4. Closed subscription (closed_at IS NOT NULL) -> excluded
    await h.ctx.sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, workspace_id, kind, status, purchased_quantity,
         unit_price_minor, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source,
         price_reporting_minor, price_reporting_currency, monthly_unit_price_minor,
         billing_cycle, commitment_term_months, start_date, responsible_it_admin_employee_id, closed_at, closed_reason, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'TERM', 'ACTIVE', 5,
         500000, 'VND', $4::date, 1.0, $4::date, 'SAME_CURRENCY'::"PriceRateSource",
         500000, 'VND', 500000,
         'MONTHLY', 1, $4::date, $5, now(), 'K1_WITHOUT_SUBSCRIPTION', now())`,
      [h.seed.organizationId, planClosed, ws.id, today, khoa.employeeId],
    );

    const detail = h.dataOf<{ id: string; subscriptionCount: number }>(
      await request(h.server()).get(`/api/v1/workspaces/${ws.id}`).set(h.as(khoa)).expect(200),
    );
    expect(detail.subscriptionCount).toBe(2);

    const page = h.dataOf<{ items: Array<{ id: string; subscriptionCount: number }> }>(
      await request(h.server()).get(`/api/v1/workspaces?vendorId=${vendorId}`).set(h.as(khoa)).expect(200),
    );
    expect(page.items.find((item) => item.id === ws.id)?.subscriptionCount).toBe(2);
  });
});
