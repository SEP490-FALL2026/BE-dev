import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RequestsDashboardApi } from '../../requests/public/requests-dashboard.api';
import { EmployeeDashboardService } from './employee-dashboard.service';

const actor = (roles: readonly string[]): AuthenticatedPrincipal => ({
  subject: 'u1',
  appUserId: 'u1',
  sessionId: 's1',
  employeeId: 'e-1',
  directRoles: roles,
  roles,
});

function serviceWith(openRequests: number = 2) {
  const employeeFacts = jest.fn().mockResolvedValue({ currentRights: 4, expiringRights: 1, openSaasIssues: 0 });
  const openRequestsSentBy = jest.fn().mockResolvedValue(openRequests);
  const service = new EmployeeDashboardService(
    { businessToday: () => Promise.resolve('2026-10-23') } as unknown as OrganizationReadApi,
    { employeeFacts } as unknown as LicensingDashboardApi,
    { openRequestsSentBy } as unknown as RequestsDashboardApi,
  );

  return { service, employeeFacts, openRequestsSentBy };
}

describe('EmployeeDashboardService', () => {
  it('counts the rights, requests and reports of the caller', async () => {
    const { service, employeeFacts, openRequestsSentBy } = serviceWith(2);

    await expect(service.overview(actor(['EMPLOYEE']))).resolves.toEqual({
      asOf: '2026-10-23',
      sections: {
        softwareRights: { state: 'COUNTED', count: 4, sourceOperationId: 'meSoftwareRightList', reason: null },
        expiringRights: { state: 'COUNTED', count: 1, sourceOperationId: 'meSoftwareRightList', reason: null },
        requests: {
          state: 'COUNTED',
          count: 2,
          sourceOperationId: 'meAccessRequestList',
          reason: null,
        },
        saasIssues: { state: 'COUNTED', count: 0, sourceOperationId: 'saasIssueList', reason: null },
      },
    });
    expect(employeeFacts).toHaveBeenCalledWith('e-1', '2026-10-23');
    expect(openRequestsSentBy).toHaveBeenCalledWith(actor(['EMPLOYEE']));
  });

  it.each(['SUPER_ADMIN', 'SPENDING_APPROVER', 'IT_ADMIN', 'FINANCE', 'MANAGER', 'EMPLOYEE'])(
    'counts the caller own data for the single role %s',
    async (role) => {
      const { service, employeeFacts, openRequestsSentBy } = serviceWith(0);
      const overview = await service.overview(actor([role]));
      expect(overview.sections.requests).toEqual({
        state: 'COUNTED',
        count: 0,
        sourceOperationId: 'meAccessRequestList',
        reason: null,
      });
      expect(employeeFacts).toHaveBeenCalledWith('e-1', '2026-10-23');
      expect(openRequestsSentBy).toHaveBeenCalledWith(actor([role]));
    },
  );
});
