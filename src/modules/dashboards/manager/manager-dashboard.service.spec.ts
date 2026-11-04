import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import { RequestsDashboardApi } from '../../requests/public/requests-dashboard.api';
import { DashboardRefusedError } from '../section/dashboard-section.errors';
import { ManagerDashboardService } from './manager-dashboard.service';

const actor = (roles: readonly string[]): AuthenticatedPrincipal => ({
  subject: 'u1',
  appUserId: 'u1',
  sessionId: 's1',
  employeeId: 'h-1',
  directRoles: roles,
  roles,
});

const DEPARTMENT = { id: 'd-des', code: 'P-DES', name: 'Design', active: true, costCenterActive: true };

function serviceWith(headed: { departmentId: string } | null = { departmentId: 'd-des' }, needApprovals = 3) {
  const departmentFacts = jest.fn().mockResolvedValue({ seatsInUse: 12 });
  const openTransferReviews = jest.fn().mockResolvedValue(2);
  const needDecisionsHeldBy = jest.fn().mockResolvedValue(needApprovals);
  const service = new ManagerDashboardService(
    {
      businessToday: () => Promise.resolve('2026-10-23'),
      getHeadedDepartment: jest.fn().mockResolvedValue(headed),
      getDepartmentBrief: jest.fn().mockResolvedValue(DEPARTMENT),
    } as unknown as OrganizationReadApi,
    { departmentFacts } as unknown as LicensingDashboardApi,
    { openTransferReviews } as unknown as PersonnelDashboardApi,
    { needDecisionsHeldBy } as unknown as RequestsDashboardApi,
  );

  return { service, departmentFacts, openTransferReviews, needDecisionsHeldBy };
}

describe('ManagerDashboardService', () => {
  // US-12-15 AC-3: the department of the head only; cost and usage say they have no source and show no zero.
  it('reads the department the head heads, counting the need approvals waiting for them', async () => {
    const { service, departmentFacts, openTransferReviews, needDecisionsHeldBy } = serviceWith();

    const overview = await service.overview(actor(['MANAGER']));

    expect(overview.department).toEqual({ id: 'd-des', code: 'P-DES', name: 'Design' });
    expect(departmentFacts).toHaveBeenCalledWith('d-des', '2026-10-23');
    expect(openTransferReviews).toHaveBeenCalledWith('d-des');
    expect(needDecisionsHeldBy).toHaveBeenCalledWith('h-1');
    expect(overview.sections.needApprovals).toEqual({
      state: 'COUNTED',
      count: 3,
      sourceOperationId: 'needDecisionList',
      reason: null,
    });
    expect(overview.sections.departmentSoftware).toMatchObject({ state: 'COUNTED', count: 12 });
    expect(overview.sections.transferReviews).toMatchObject({ state: 'COUNTED', count: 2 });
    expect(overview.sections.spending).toEqual({
      state: 'NOT_AVAILABLE',
      count: null,
      sourceOperationId: null,
      reason: 'FINANCE_FIGURES_NOT_DELIVERED',
    });
    expect(overview.sections.ghostSeats).toMatchObject({ state: 'NOT_AVAILABLE', reason: 'USAGE_DATA_NOT_DELIVERED' });
    expect(overview.sections.spendQueue).toMatchObject({ state: 'AT_SOURCE', sourceOperationId: 'spendQueueList' });
    for (const key of ['remaining', 'budgetCheck', 'companyTotal', 'kpi5'])
      expect(overview.sections).not.toHaveProperty(key);
  });

  it('refuses a head who heads no department on the business day', async () => {
    const { service, departmentFacts } = serviceWith(null);

    await expect(service.overview(actor(['MANAGER']))).rejects.toBeInstanceOf(DashboardRefusedError);
    expect(departmentFacts).not.toHaveBeenCalled();
  });

  it('refuses a caller without the head role', async () => {
    const { service } = serviceWith();

    await expect(service.overview(actor(['EMPLOYEE', 'IT_ADMIN']))).rejects.toBeInstanceOf(DashboardRefusedError);
  });
});
