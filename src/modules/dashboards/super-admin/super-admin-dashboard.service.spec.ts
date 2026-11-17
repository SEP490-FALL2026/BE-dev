import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { OnboardingFacts } from '../../organization/public/organization.types';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import { progressOf } from '../progress/dashboard-progress.policy';
import type { DashboardProgressService } from '../progress/dashboard-progress.service';
import { DashboardRefusedError } from '../section/dashboard-section.errors';
import { SuperAdminDashboardService } from './super-admin-dashboard.service';

const actor = (roles: readonly string[]): AuthenticatedPrincipal => ({
  subject: 'u1',
  appUserId: 'u1',
  sessionId: 's1',
  employeeId: 'sa-1',
  directRoles: roles,
  roles,
});

const PROGRESS = progressOf({
  personnel: {
    calendar: { from: '2026-10-23', to: '2026-11-06' },
    departures: {
      upcoming: 3,
      awaitingRevocation: 2,
      revocationOverdue: 1,
      closedThisMonth: 4,
      itHandoverPending: 1,
      mailboxLockPending: 2,
    },
    transfers: { inGrace: 5, graceEndingSoon: 2, revoking: 1 },
  },
  seats: { returned: 6, reused: 3 },
  plansBelowMinimum: 2,
});

const FACTS: OnboardingFacts = {
  activeDepartments: 4,
  activeEmployees: 30,
  departmentsWithoutCostCenter: [{ code: 'P-NEW', name: 'New' }],
  departmentsWithoutHead: [{ code: 'P-HR', name: 'HR' }],
  departmentsByItAdmin: [
    { code: 'P-DES', name: 'Design', itAdminEmployeeId: 'it-1', itAdminStatus: 'ACTIVE' },
    { code: 'P-ENG', name: 'Engineering', itAdminEmployeeId: 'it-2', itAdminStatus: 'ACTIVE' },
    { code: 'P-HR', name: 'HR', itAdminEmployeeId: null, itAdminStatus: null },
    { code: 'P-OPS', name: 'Operations', itAdminEmployeeId: 'it-3', itAdminStatus: 'TERMINATED' },
  ],
};

function serviceWith() {
  const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-1', 'it-3']));
  const noticesAwaitingHandling = jest.fn().mockResolvedValue(6);
  const read = jest.fn().mockResolvedValue(PROGRESS);
  const service = new SuperAdminDashboardService(
    {
      businessToday: () => Promise.resolve('2026-10-23'),
      getOnboardingFacts: () => Promise.resolve(FACTS),
    } as unknown as OrganizationReadApi,
    { findUsableItAdminEmployeeIds } as unknown as IdentityAccessApi,
    { noticesAwaitingHandling } as unknown as PersonnelDashboardApi,
    { read } as unknown as DashboardProgressService,
  );

  return { service, findUsableItAdminEmployeeIds, read };
}

describe('SuperAdminDashboardService', () => {
  // US-12-15 AC-7: the operation of the system and the organization, no seat, approval or spending total.
  it('counts the departments that miss a head or a usable IT Admin and the notices waiting', async () => {
    const { service, findUsableItAdminEmployeeIds } = serviceWith();

    const overview = await service.overview(actor(['SUPER_ADMIN']));

    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1', 'it-2', 'it-3']);
    // P-ENG's IT Admin is not usable, P-HR has none and P-OPS's has left: three.
    expect(overview.sections).toMatchObject({
      departmentsWithoutHead: { state: 'COUNTED', count: 1, sourceOperationId: 'departmentWarningList' },
      departmentsWithoutItAdmin: { state: 'COUNTED', count: 3, sourceOperationId: 'departmentWarningList' },
      personnelNotices: { state: 'COUNTED', count: 6, sourceOperationId: 'personnelNoticeList' },
      congestion: { state: 'AT_SOURCE', sourceOperationId: 'stepCongestionList' },
      approverConfiguration: { state: 'AT_SOURCE', sourceOperationId: 'appUserList' },
      superAdminRole: { state: 'AT_SOURCE', sourceOperationId: 'superAdminWatchGet' },
      accountCandidates: { state: 'AT_SOURCE', sourceOperationId: 'accountCandidatesList' },
      backgroundJobs: { state: 'NOT_AVAILABLE', count: null, reason: 'NO_DATA_SOURCE' },
    });
    for (const key of ['spending', 'spendQueue', 'grantTasks', 'needApprovals'])
      expect(overview.sections).not.toHaveProperty(key);
  });

  // SPEC P21: the whole company, never narrowed to an IT Admin or to departments.
  it('gives the progress of the departures and the transfers of the whole company on the business day', async () => {
    const { service, read } = serviceWith();

    const overview = await service.overview(actor(['SUPER_ADMIN']));

    expect(read).toHaveBeenCalledWith('2026-10-23', {});
    expect(overview.calendar).toEqual({ from: '2026-10-23', to: '2026-11-06' });
    expect(overview.sections.departures.upcoming).toMatchObject({ state: 'COUNTED', count: 3 });
    expect(overview.sections.departures.revocationOverdue).toMatchObject({ state: 'COUNTED', count: 1 });
    expect(overview.sections.transfers.revoking).toMatchObject({ state: 'COUNTED', count: 1 });
    expect(overview.sections.seatsReturned.thisMonth.count).toBe(6);
    expect(overview.sections.plansBelowVendorAdminMinimum.count).toBe(2);
  });

  it('refuses a caller without the Super Admin role', async () => {
    const { service } = serviceWith();

    await expect(service.overview(actor(['IT_ADMIN']))).rejects.toBeInstanceOf(DashboardRefusedError);
  });
});
