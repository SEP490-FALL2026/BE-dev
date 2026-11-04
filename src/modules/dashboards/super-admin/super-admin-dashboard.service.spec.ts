import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { OnboardingFacts } from '../../organization/public/organization.types';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
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
  const service = new SuperAdminDashboardService(
    {
      businessToday: () => Promise.resolve('2026-10-23'),
      getOnboardingFacts: () => Promise.resolve(FACTS),
    } as unknown as OrganizationReadApi,
    { findUsableItAdminEmployeeIds } as unknown as IdentityAccessApi,
    { noticesAwaitingHandling } as unknown as PersonnelDashboardApi,
  );

  return { service, findUsableItAdminEmployeeIds };
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

  it('refuses a caller without the Super Admin role', async () => {
    const { service } = serviceWith();

    await expect(service.overview(actor(['IT_ADMIN']))).rejects.toBeInstanceOf(DashboardRefusedError);
  });
});
