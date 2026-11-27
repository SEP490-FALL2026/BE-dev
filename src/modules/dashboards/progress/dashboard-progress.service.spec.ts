import type { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import type { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import type { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import { DashboardProgressService } from './dashboard-progress.service';

describe('DashboardProgressService (W3-12)', () => {
  it('reads workspacesBelowVendorAdminMinimum via CatalogResponsibilityApi.countWorkspacesBelowMinimum', async () => {
    const personnel = {
      progress: jest.fn().mockResolvedValue({
        calendar: { from: '2026-11-16', to: '2026-11-30' },
        departures: {
          upcoming: 0,
          awaitingRevocation: 0,
          revocationOverdue: 0,
          closedThisMonth: 0,
          itHandoverPending: 0,
          mailboxLockPending: 0,
        },
        transfers: { inGrace: 0, graceEndingSoon: 0, revoking: 0, revocationFailed: 0 },
      }),
    } as unknown as PersonnelDashboardApi;
    const licensing = {
      seatsReturned: jest.fn().mockResolvedValue({ returned: 1, reused: 0 }),
    } as unknown as LicensingDashboardApi;
    const catalog = {
      countPlansBelowVendorAdminMinimum: jest.fn().mockResolvedValue(2),
      countWorkspacesBelowMinimum: jest.fn().mockResolvedValue(3),
    } as unknown as CatalogResponsibilityApi;

    const result = await new DashboardProgressService(personnel, licensing, catalog).read('2026-11-16', {});

    expect(result.plansBelowVendorAdminMinimum.count).toBe(2);
    expect(result.workspacesBelowVendorAdminMinimum).toEqual({
      state: 'COUNTED',
      count: 3,
      sourceOperationId: null,
      reason: null,
    });
  });
});
