import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TransientDatabaseError } from '../../../src/infrastructure/database/transaction-runner';
import { EmployeeDashboardService } from '../../../src/modules/dashboards/employee/employee-dashboard.service';
import { ItAdminDashboardService } from '../../../src/modules/dashboards/it-admin/it-admin-dashboard.service';
import { ManagerDashboardService } from '../../../src/modules/dashboards/manager/manager-dashboard.service';
import { DashboardRefusedError } from '../../../src/modules/dashboards/section/dashboard-section.errors';
import { SuperAdminDashboardService } from '../../../src/modules/dashboards/super-admin/super-admin-dashboard.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const COUNTED = { state: 'COUNTED', count: 3, sourceOperationId: 'saasIssueList', reason: null };
const AT_SOURCE = { state: 'AT_SOURCE', count: null, sourceOperationId: 'spendQueueList', reason: null };
const MISSING = {
  state: 'NOT_AVAILABLE',
  count: null,
  sourceOperationId: null,
  reason: 'FINANCE_FIGURES_NOT_DELIVERED',
};

const NO_LIST = { state: 'COUNTED', count: 2, sourceOperationId: null, reason: null };
/** The calendar and the sections of the progress of the departures and the transfers (SPEC P21), the same in the overviews of an IT Admin and of the Super Admin. */
const CALENDAR = { from: '2026-10-23', to: '2026-11-06' };
const PROGRESS = {
  departures: {
    upcoming: { ...COUNTED, sourceOperationId: 'offboardingCaseList' },
    awaitingRevocation: NO_LIST,
    revocationOverdue: { ...COUNTED, sourceOperationId: 'offboardingCaseList' },
    closedThisMonth: NO_LIST,
    itHandoverPending: NO_LIST,
    mailboxLockPending: NO_LIST,
  },
  transfers: { inGrace: NO_LIST, graceEndingSoon: NO_LIST, revoking: NO_LIST },
  seatsReturned: { thisMonth: NO_LIST, reusedThisMonth: NO_LIST },
  plansBelowVendorAdminMinimum: NO_LIST,
};

interface Route {
  name: string;
  path: string;
  service: unknown;
  role: string;
  message: string;
  answer: Record<string, unknown>;
}

const ROUTES: Route[] = [
  {
    name: 'employee',
    path: '/api/v1/dashboards/employee',
    service: EmployeeDashboardService,
    role: 'EMPLOYEE',
    message: 'DASHBOARD.EMPLOYEE_RETRIEVED',
    answer: {
      asOf: '2026-10-23',
      sections: { softwareRights: COUNTED, expiringRights: COUNTED, requests: COUNTED, saasIssues: COUNTED },
    },
  },
  {
    name: 'manager',
    path: '/api/v1/dashboards/manager',
    service: ManagerDashboardService,
    role: 'MANAGER',
    message: 'DASHBOARD.MANAGER_RETRIEVED',
    answer: {
      asOf: '2026-10-23',
      department: { id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', code: 'P-DES', name: 'Design' },
      sections: {
        needApprovals: COUNTED,
        departmentSoftware: COUNTED,
        ghostSeats: MISSING,
        spending: MISSING,
        spendQueue: AT_SOURCE,
        budgetProposals: AT_SOURCE,
        approvedBudgetLines: AT_SOURCE,
      },
    },
  },
  {
    name: 'IT Admin',
    path: '/api/v1/dashboards/it-admin',
    service: ItAdminDashboardService,
    role: 'IT_ADMIN',
    message: 'DASHBOARD.IT_ADMIN_RETRIEVED',
    answer: {
      asOf: '2026-10-23',
      scope: { departments: 2 },
      calendar: CALENDAR,
      sections: {
        ...PROGRESS,
        grantTasks: COUNTED,
        revocationTasks: COUNTED,
        discrepancies: COUNTED,
        cancellationDeadlines: AT_SOURCE,
        licenseKeys: COUNTED,
        termsToReview: AT_SOURCE,
        offboardingHandovers: COUNTED,
        unconfirmedDevices: MISSING,
        saasIssues: COUNTED,
        ghostSeats: COUNTED,
      },
    },
  },
  {
    name: 'Super Admin',
    path: '/api/v1/dashboards/super-admin',
    service: SuperAdminDashboardService,
    role: 'SUPER_ADMIN',
    message: 'DASHBOARD.SUPER_ADMIN_RETRIEVED',
    answer: {
      asOf: '2026-10-23',
      calendar: CALENDAR,
      sections: {
        ...PROGRESS,
        congestion: AT_SOURCE,
        backgroundJobs: MISSING,
        approverConfiguration: AT_SOURCE,
        superAdminRole: AT_SOURCE,
        departmentsWithoutHead: COUNTED,
        departmentsWithoutItAdmin: COUNTED,
        accountCandidates: AT_SOURCE,
        personnelNotices: COUNTED,
      },
    },
  },
];
const ALL_ROLES = ['EMPLOYEE', 'MANAGER', 'IT_ADMIN', 'SUPER_ADMIN', 'FINANCE', 'SPENDING_APPROVER'];
const holder = (role: string) => principal([role]);

/**
 * `US-12-15` AC-2, AC-3, AC-4, AC-7: the contract of the four role overviews, with their services replaced, so what is proved here is
 * the route — who may call it, the shape and message of its answer and the errors; the data and the scopes are proved on PostgreSQL.
 */
describe('role overview routes (e2e, no database)', () => {
  let app: INestApplication<App>;
  const overview = new Map(ROUTES.map((route) => [route.name, jest.fn()]));

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: ROUTES.map((route) => ({ token: route.service, useValue: { overview: overview.get(route.name) } })),
    });
  });

  beforeEach(() => {
    for (const route of ROUTES) overview.get(route.name)?.mockReset().mockResolvedValue(route.answer);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each(ROUTES)('the $name overview', (route) => {
    const called = () => overview.get(route.name);

    it('without a token is 401', async () => {
      const response = await request(app.getHttpServer()).get(route.path).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(called()).not.toHaveBeenCalled();
    });

    // The role matrix: each overview belongs to one role; Finance and the spending approver have their own overview elsewhere.
    it.each([...ALL_ROLES.filter((role) => role !== route.role), 'none'])(
      'applies the overview access rule to role %s',
      async (role) => {
        const caller = role === 'none' ? principal([]) : holder(role);
        const response = await request(app.getHttpServer())
          .get(route.path)
          .set('Authorization', bearer(caller))
          .expect(route.name === 'employee' ? 200 : 403);

        if (route.name === 'employee') {
          expect(bodyOf(response).data).toEqual(route.answer);
          expect(called()).toHaveBeenCalledWith(caller);
        } else {
          expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
          expect(called()).not.toHaveBeenCalled();
        }
      },
    );

    it('answers the sections for the role under its own message, read for the caller', async () => {
      const caller = principal([route.role], { employeeId: 'e-77' });
      const response = await request(app.getHttpServer())
        .get(route.path)
        .set('Authorization', bearer(caller))
        .expect(200);

      expect(response.body).toEqual({ success: true, message: route.message, data: route.answer });
      expect(called()).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-77' }));
    });

    it('answers a refusal of the service the way the guard does', async () => {
      called()?.mockRejectedValueOnce(new DashboardRefusedError());

      const response = await request(app.getHttpServer())
        .get(route.path)
        .set('Authorization', bearer(holder(route.role)))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it('answers 503 when the database cannot answer, without detail', async () => {
      called()?.mockRejectedValueOnce(new TransientDatabaseError('57P01', new Error('terminating connection')));

      const response = await request(app.getHttpServer())
        .get(route.path)
        .set('Authorization', bearer(holder(route.role)))
        .expect(503);

      expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.toContain('terminating');
    });

    it('has no way to write an overview', async () => {
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        await request(app.getHttpServer())
          [method](route.path)
          .set('Authorization', bearer(holder(route.role)))
          .expect(404);
      }
    });
  });

  // A person with several roles reads each overview of a role they hold, and only those.
  it('lets a person who is an IT Admin, an Employee and a head read those three overviews and not the Super Admin one', async () => {
    const caller = bearer(principal(['IT_ADMIN', 'EMPLOYEE', 'MANAGER']));

    for (const path of ['/employee', '/manager', '/it-admin']) {
      await request(app.getHttpServer()).get(`/api/v1/dashboards${path}`).set('Authorization', caller).expect(200);
    }
    await request(app.getHttpServer()).get('/api/v1/dashboards/super-admin').set('Authorization', caller).expect(403);
  });
});
