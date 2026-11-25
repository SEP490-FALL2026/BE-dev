import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { AccountStatusService } from '../../../src/modules/identity-access/accounts/app-users/account-status.service';
import { RoleGrantService } from '../../../src/modules/identity-access/accounts/role-grant.service';
import { SubscriptionRenewalSweepService } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal-sweep.service';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { ItHandoverMilestoneService } from '../../../src/modules/personnel/it-handover/it-handover-milestone.service';
import type { ApiAccount } from '../../support/api-accounts';
import { buildActivatedAccount, principalOf } from '../../support/builders/account.builder';
import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

interface WorkspaceWire {
  id: string;
  flags: string[];
  admins: Array<{ employeeId: string; role: string; flags: string[] }>;
}

/**
 * W3-12 (`QĐ-114ae`, `QĐ-110k`, `QĐ-110u`, `QĐ-117e`, Owner Q-D): >= 2 working admin gate on workspace, flags on workspace/subscription,
 * dashboard count, and exactly one `WORKSPACE_ADMIN_NOT_WORKING` notification per `(workspace, admin)` across offboarding and sweep.
 */
describe('workspace >= 2 working admin gate and WORKSPACE_ADMIN_NOT_WORKING alerts (integration, real PostgreSQL)', () => {
  let khoa: ApiAccount;
  let nam: ApiAccount;
  let appId: string;
  let vendorId: string;

  const postWorkspace = (name: string) =>
    request(h.server()).post('/api/v1/workspaces').set(h.as(khoa)).send({ vendorId, name });

  const setAdmins = (wsId: string, expectedUpdatedAt: string, admins: Array<{ employeeId: string; role: string }>) =>
    request(h.server()).put(`/api/v1/workspaces/${wsId}/admins`).set(h.as(khoa)).send({
      admins,
      primaryOwnerEmployeeId: admins[0].employeeId,
      expectedUpdatedAt,
    });

  const makeK2Plan = async (): Promise<string> => {
    const planId = await declarePlan(h.ctx, khoa.accessToken, {
      applicationId: appId,
      name: h.unique('K2 Plan'),
      provisioningType: 'K2',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });

    return planId;
  };

  const declareTerm = (planId: string, workspaceId: string, extra: Record<string, unknown> = {}) =>
    request(h.server())
      .post('/api/v1/subscriptions')
      .set(h.as(khoa))
      .send({
        planId,
        workspaceId,
        kind: 'TERM',
        purchasedQuantity: 10,
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        commitmentTermMonths: 1,
        startDate: '2026-01-05',
        responsibleItAdminEmployeeId: khoa.employeeId,
        ...extra,
      });

  const setAccountStatus = async (account: ApiAccount, status: 'ACTIVE' | 'LOCKED') => {
    if (status === 'LOCKED') {
      const adminPrincipal = await principalOf(h.ctx, h.admin);
      await h.ctx.app.get(AccountStatusService, { strict: false }).lock(adminPrincipal, account.appUserId, 'Test lock');
    } else {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE', updated_at = now() WHERE id = $1`, [
        account.appUserId,
      ]);
    }
  };

  const noticesFor = async (workspaceId: string, employeeId: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; event_key: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id, event_key, params
           FROM in_app_notifications
          WHERE code = 'WORKSPACE_ADMIN_NOT_WORKING'
            AND event_key = $1
          ORDER BY created_at, id`,
        [`WORKSPACE_ADMIN_NOT_WORKING:${workspaceId}:${employeeId}`],
      )
    ).rows;

  beforeAll(async () => {
    await h.start();
    khoa = h.it1;
    nam = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-NAM', email: 'nam@acme.vn', role: 'IT_ADMIN' });
    appId = await declareApplication(h.ctx, khoa.accessToken, {
      name: h.unique('Anthropic'),
      kind: 'SAAS',
      vendorName: h.unique('Anthropic Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    vendorId = (
      await h.ctx.sql.query<{ vendor_id: string }>(`SELECT vendor_id FROM applications WHERE id = $1`, [appId])
    ).rows[0].vendor_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('8 acceptance scenarios of W3-12', () => {
    it.each([
      {
        label: '1. workspace has Khoa & Nam working (baseline closed) -> 201',
        baselineClosed: true,
        lockNam: false,
        expectedStatus: 201,
        expectedBelowFlag: false,
      },
      {
        label: '2. Nam locked, baseline closed -> 422 SUBSCRIPTION.VENDOR_ADMINS_REQUIRED',
        baselineClosed: true,
        lockNam: true,
        expectedStatus: 422,
        expectedCode: 'SUBSCRIPTION.VENDOR_ADMINS_REQUIRED',
      },
      {
        label: '3. Nam locked, baseline open -> 201 with vendorAdminsBelowMinimum flag',
        baselineClosed: false,
        lockNam: true,
        expectedStatus: 201,
        expectedBelowFlag: true,
      },
    ])('$label', async ({ baselineClosed, lockNam, expectedStatus, expectedCode, expectedBelowFlag }) => {
      await h.ctx.sql.query(
        `UPDATE seat_baselines SET closed_at = ${baselineClosed ? 'now()' : 'NULL'} WHERE organization_id = $1`,
        [h.seed.organizationId],
      );
      const wsRes = await postWorkspace(h.unique('WS-Gate')).expect(201);
      const ws = h.dataOf<{ id: string; updatedAt: string }>(wsRes);
      await setAdmins(ws.id, ws.updatedAt, [
        { employeeId: khoa.employeeId, role: 'OWNER' },
        { employeeId: nam.employeeId, role: 'ADMIN' },
      ]).expect(200);
      const planId = await makeK2Plan();
      if (lockNam) await setAccountStatus(nam, 'LOCKED');

      try {
        const res = await declareTerm(planId, ws.id).expect(expectedStatus);
        if (expectedCode) {
          expect(h.codeOf(res)).toBe(expectedCode);
        } else {
          expect(h.dataOf<{ vendorAdminsBelowMinimum: boolean }>(res).vendorAdminsBelowMinimum).toBe(expectedBelowFlag);
        }
      } finally {
        if (lockNam) await setAccountStatus(nam, 'ACTIVE');
      }
    });

    it('4. renewal outcome recorded while Nam is locked succeeds and flags vendorAdminsBelowMinimum on the new period', async () => {
      await h.closeBaseline().expect(200);
      const ws = h.dataOf<{ id: string; updatedAt: string }>(await postWorkspace(h.unique('WS-Renew')).expect(201));
      await setAdmins(ws.id, ws.updatedAt, [
        { employeeId: khoa.employeeId, role: 'OWNER' },
        { employeeId: nam.employeeId, role: 'ADMIN' },
      ]).expect(200);
      const planId = await makeK2Plan();
      const today = await h.ctx.app.get(OrganizationReadApi, { strict: false }).businessToday();
      const firstId = h.dataOf<{ id: string }>(
        await declareTerm(planId, ws.id, {
          startDate: addDays(today, -28),
          renewalDate: addDays(today, 2),
        }).expect(201),
      ).id;

      await setAccountStatus(nam, 'LOCKED');
      try {
        const renewalRes = await request(h.server())
          .post('/api/v1/subscription-renewals')
          .set(h.as(khoa))
          .send({
            subscriptionId: firstId,
            choice: 'RENEW',
            proposedQuantity: 10,
            outcome: 'AS_DECIDED',
            nextPeriod: {
              purchasedQuantity: 10,
              unitPrice: { amount: '1000000', currency: 'VND' },
              billingCycle: 'MONTHLY',
              startDate: addDays(today, 2),
              renewalDate: addDays(today, 32),
              autoRenew: true,
              allowsMidTermReduction: false,
            },
          })
          .expect(201);
        const nextId = h.dataOf<{ outcomeDetail: { nextSubscriptionId: string } }>(renewalRes).outcomeDetail
          .nextSubscriptionId;
        const nextView = h.dataOf<{ vendorAdminsBelowMinimum: boolean }>(
          await request(h.server()).get(`/api/v1/subscriptions/${nextId}`).set(h.as(khoa)).expect(200),
        );
        expect(nextView.vendorAdminsBelowMinimum).toBe(true);
      } finally {
        await setAccountStatus(nam, 'ACTIVE');
      }
    });

    it('5 & 6. workspaceGet flags ADMINS_BELOW_MINIMUM & ADMIN_NOT_WORKING; 3 sweep runs send exactly 1 notice to Khoa and update dashboard', async () => {
      const ws = h.dataOf<{ id: string; updatedAt: string }>(await postWorkspace(h.unique('WS-Sweep')).expect(201));
      await setAdmins(ws.id, ws.updatedAt, [
        { employeeId: khoa.employeeId, role: 'OWNER' },
        { employeeId: nam.employeeId, role: 'ADMIN' },
      ]).expect(200);
      const planId = await makeK2Plan();
      await declareTerm(planId, ws.id).expect(201);

      await setAccountStatus(nam, 'LOCKED');
      try {
        const wsView = h.dataOf<WorkspaceWire>(
          await request(h.server()).get(`/api/v1/workspaces/${ws.id}`).set(h.as(khoa)).expect(200),
        );
        expect(wsView.flags).toContain('ADMINS_BELOW_MINIMUM');
        expect(wsView.admins.find((a) => a.employeeId === nam.employeeId)?.flags).toEqual(['ADMIN_NOT_WORKING']);

        const dash = h.dataOf<{
          sections: {
            workspacesBelowVendorAdminMinimum: { state: string; count: number };
            plansBelowVendorAdminMinimum: { state: string; count: number };
          };
        }>(await request(h.server()).get('/api/v1/dashboards/it-admin').set(h.as(khoa)).expect(200));
        expect(dash.sections.workspacesBelowVendorAdminMinimum.state).toBe('COUNTED');
        expect(dash.sections.workspacesBelowVendorAdminMinimum.count).toBeGreaterThanOrEqual(1);
        expect(dash.sections.plansBelowVendorAdminMinimum).toBeDefined();

        const sweeper = h.ctx.app.get(SubscriptionRenewalSweepService, { strict: false });
        await sweeper.sweep();
        await sweeper.sweep();
        await sweeper.sweep();

        const rows = await noticesFor(ws.id, nam.employeeId);
        expect(rows).toHaveLength(1);
        expect(rows[0].recipient_employee_id).toBe(khoa.employeeId);
        expect(rows[0].params).toMatchObject({ workspaceId: ws.id, employeeId: nam.employeeId, workingAdminCount: 1 });
      } finally {
        await setAccountStatus(nam, 'ACTIVE');
      }
    });

    it('7. Khoa (responsible) changing role from IT_ADMIN to FINANCE notifies Super Admin once', async () => {
      const ws = h.dataOf<{ id: string; updatedAt: string }>(
        await postWorkspace(h.unique('WS-RoleChange')).expect(201),
      );
      await setAdmins(ws.id, ws.updatedAt, [
        { employeeId: khoa.employeeId, role: 'OWNER' },
        { employeeId: nam.employeeId, role: 'ADMIN' },
      ]).expect(200);
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const grants = h.ctx.app.get(RoleGrantService, { strict: false });

      await runner.run(async (tx) => {
        await grants.revokeRole(tx, {
          appUserId: khoa.appUserId,
          role: 'IT_ADMIN',
          revokedBy: h.seed.superAdmin.employeeId,
          now: new Date(),
        });
        await grants.grantRole(tx, {
          organizationId: h.seed.organizationId,
          appUserId: khoa.appUserId,
          role: 'FINANCE',
          grantedBy: h.seed.superAdmin.employeeId,
          grantedAt: new Date(),
        });
      });

      try {
        await h.ctx.app.get(SubscriptionRenewalSweepService, { strict: false }).sweep();
        const rows = await noticesFor(ws.id, khoa.employeeId);
        expect(rows).toHaveLength(1);
        expect(rows[0].recipient_employee_id).toBe(h.seed.superAdmin.employeeId);
      } finally {
        await runner.run(async (tx) => {
          await grants.grantRole(tx, {
            organizationId: h.seed.organizationId,
            appUserId: khoa.appUserId,
            role: 'IT_ADMIN',
            grantedBy: h.seed.superAdmin.employeeId,
            grantedAt: new Date(),
          });
        });
      }
    });

    it('8. Nam offboarding milestone then hourly sweep emits ONE notification (same eventKey), not two', async () => {
      const ws = h.dataOf<{ id: string; updatedAt: string }>(await postWorkspace(h.unique('WS-Offboard')).expect(201));
      await setAdmins(ws.id, ws.updatedAt, [
        { employeeId: khoa.employeeId, role: 'OWNER' },
        { employeeId: nam.employeeId, role: 'ADMIN' },
      ]).expect(200);
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const handover = h.ctx.app.get(ItHandoverMilestoneService, { strict: false });

      await setAccountStatus(nam, 'LOCKED');
      try {
        await runner.run((tx) =>
          handover.reached(tx, {
            organizationId: h.seed.organizationId,
            source: { kind: 'OFFBOARDING_CASE', id: '00000000-0000-4000-8000-000000000008' },
            employeeId: nam.employeeId,
            dueOn: '2026-11-25',
          }),
        );
        await h.ctx.app.get(SubscriptionRenewalSweepService, { strict: false }).sweep();

        const rows = await noticesFor(ws.id, nam.employeeId);
        expect(rows).toHaveLength(1);
        expect(rows[0].recipient_employee_id).toBe(khoa.employeeId);
      } finally {
        await setAccountStatus(nam, 'ACTIVE');
      }
    });
  });
});
