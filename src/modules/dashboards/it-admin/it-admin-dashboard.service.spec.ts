import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DevicesApi } from '../../devices/public/devices.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { OptimizationApi } from '../../optimization/public/optimization.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import type { UsageEvidenceApi } from '../../usage/public/usage-evidence.api';
import { DashboardRefusedError } from '../section/dashboard-section.errors';
import { ItAdminDashboardService } from './it-admin-dashboard.service';

const actor = (roles: readonly string[]): AuthenticatedPrincipal => ({
  subject: 'u1',
  appUserId: 'u1',
  sessionId: 's1',
  employeeId: 'it-1',
  directRoles: roles,
  roles,
});

function serviceWith(scope: string[]) {
  const getItAdminScope = jest.fn(async (_id: string, usable: (ids: readonly string[]) => Promise<unknown>) => {
    await usable(['it-1']);

    return scope;
  });
  const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-1']));
  const itAdminFacts = jest
    .fn()
    .mockResolvedValue({ openGrantTasks: 3, openRevocationTasks: 1, openSaasIssues: 2, keysInStore: 40 });
  const handingOverCases = jest.fn().mockResolvedValue(5);
  const getSummary = jest.fn().mockResolvedValue({ counted: 3, groups: [], limitation: '' });
  const openFindingCount = jest.fn().mockResolvedValue(2);
  const countByCollectionState = jest.fn().mockResolvedValue(4);
  const service = new ItAdminDashboardService(
    {
      businessToday: () => Promise.resolve('2026-10-23'),
      getOrganization: () => Promise.resolve({ id: 'org-1' }),
      getItAdminScope,
    } as unknown as OrganizationReadApi,
    { findUsableItAdminEmployeeIds } as unknown as IdentityAccessApi,
    { itAdminFacts } as unknown as LicensingDashboardApi,
    { handingOverCases } as unknown as PersonnelDashboardApi,
    { getSummary } as unknown as OptimizationApi,
    { openFindingCount } as unknown as UsageEvidenceApi,
    { countByCollectionState } as unknown as DevicesApi,
  );

  return {
    service,
    getItAdminScope,
    findUsableItAdminEmployeeIds,
    itAdminFacts,
    handingOverCases,
    getSummary,
    countByCollectionState,
  };
}

describe('ItAdminDashboardService', () => {
  // US-12-15 AC-4: the work of the departments in the IT Admin's charge; the machines to confirm are counted from the register; the discrepancies are the open findings of the vendor usage import.
  it('counts the work in the charge of the IT Admin and the departures of the departments in scope', async () => {
    const {
      service,
      getItAdminScope,
      findUsableItAdminEmployeeIds,
      itAdminFacts,
      handingOverCases,
      countByCollectionState,
    } = serviceWith(['d-des', 'd-ops']);

    const overview = await service.overview(actor(['IT_ADMIN']));

    expect(getItAdminScope).toHaveBeenCalledWith('it-1', expect.any(Function));
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1']);
    expect(itAdminFacts).toHaveBeenCalledWith('it-1');
    expect(handingOverCases).toHaveBeenCalledWith(['d-des', 'd-ops']);
    expect(overview.scope).toEqual({ departments: 2 });
    expect(overview.sections).toMatchObject({
      grantTasks: { state: 'COUNTED', count: 3, sourceOperationId: 'provisioningTaskList' },
      revocationTasks: { state: 'COUNTED', count: 1, sourceOperationId: 'provisioningTaskList' },
      saasIssues: { state: 'COUNTED', count: 2, sourceOperationId: 'saasIssueList' },
      // `G2` not closed plus `G1` open, from the facade of the recommendations.
      ghostSeats: { state: 'COUNTED', count: 3, sourceOperationId: 'ghostSeatRecommendationList' },
      licenseKeys: { state: 'COUNTED', count: 40, sourceOperationId: 'licenseKeyList' },
      offboardingHandovers: { state: 'COUNTED', count: 5, sourceOperationId: 'offboardingCaseList' },
      cancellationDeadlines: { state: 'AT_SOURCE', count: null, sourceOperationId: 'subscriptionList' },
      termsToReview: { state: 'AT_SOURCE', count: null, sourceOperationId: 'planWarningList' },
      // The open findings of people active in a vendor with no seat (Q-84).
      discrepancies: { state: 'COUNTED', count: 2, sourceOperationId: 'usageNoAssignmentFindingList' },
      // US-09-01 AC-2: the machines whose holder has not acknowledged the notice, counted as `GET /devices?state=AWAITING_ACKNOWLEDGEMENT` lists them.
      unconfirmedDevices: { state: 'COUNTED', count: 4, sourceOperationId: 'deviceList' },
    });
    expect(countByCollectionState).toHaveBeenCalledWith('org-1', 'AWAITING_ACKNOWLEDGEMENT');
  });

  it('refuses a caller without the IT Admin role before reading anything', async () => {
    const { service, getItAdminScope } = serviceWith([]);

    await expect(service.overview(actor(['SUPER_ADMIN', 'EMPLOYEE']))).rejects.toBeInstanceOf(DashboardRefusedError);
    expect(getItAdminScope).not.toHaveBeenCalled();
  });
});
