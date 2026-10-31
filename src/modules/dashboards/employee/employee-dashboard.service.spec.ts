import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { DashboardRefusedError } from '../section/dashboard-section.errors';
import { EmployeeDashboardService } from './employee-dashboard.service';

const actor = (roles: readonly string[]): AuthenticatedPrincipal => ({
  subject: 'u1',
  appUserId: 'u1',
  sessionId: 's1',
  employeeId: 'e-1',
  directRoles: roles,
  derivedRoles: [],
  roles,
});

function serviceWith() {
  const employeeFacts = jest.fn().mockResolvedValue({ currentRights: 4, expiringRights: 1, openSaasIssues: 0 });
  const service = new EmployeeDashboardService(
    { businessToday: () => Promise.resolve('2026-10-23') } as unknown as OrganizationApi,
    { employeeFacts } as unknown as LicensingDashboardApi,
  );

  return { service, employeeFacts };
}

describe('EmployeeDashboardService', () => {
  // US-12-15 AC-2: the software, the rights about to end and the reports of the caller; the requests have no list yet.
  it('counts the rights and reports of the caller and says the requests are not available', async () => {
    const { service, employeeFacts } = serviceWith();

    await expect(service.overview(actor(['EMPLOYEE']))).resolves.toEqual({
      asOf: '2026-10-23',
      sections: {
        softwareRights: { state: 'COUNTED', count: 4, sourceOperationId: 'meSoftwareRightList', reason: null },
        expiringRights: { state: 'COUNTED', count: 1, sourceOperationId: 'meSoftwareRightList', reason: null },
        requests: {
          state: 'NOT_AVAILABLE',
          count: null,
          sourceOperationId: null,
          reason: 'REQUEST_QUEUE_NOT_DELIVERED',
        },
        saasIssues: { state: 'COUNTED', count: 0, sourceOperationId: 'saasIssueList', reason: null },
      },
    });
    expect(employeeFacts).toHaveBeenCalledWith('e-1', '2026-10-23');
  });

  it('refuses a caller without the Employee role before reading anything', async () => {
    const { service, employeeFacts } = serviceWith();

    await expect(service.overview(actor(['IT_ADMIN', 'MANAGER']))).rejects.toBeInstanceOf(DashboardRefusedError);
    expect(employeeFacts).not.toHaveBeenCalled();
  });
});
