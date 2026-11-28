import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import type { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { ItHandoverMilestoneService } from './it-handover-milestone.service';

const TX = {} as DbTx;

describe('ItHandoverMilestoneService', () => {
  it('notifies per workspace via workspaceAdminNotWorking when an admin reaches departure milestone', async () => {
    const catalog = {
      vendorAdminRolesOf: jest.fn().mockResolvedValue([
        {
          planId: 'plan-1',
          applicationId: 'app-1',
          role: 'OWNER',
          othersWorking: 0,
          workspaceId: 'ws-1',
          responsibleItAdminEmployeeId: 'it-resp-1',
        },
        {
          planId: 'plan-2',
          applicationId: 'app-2',
          role: 'ADMIN',
          othersWorking: 1,
          workspaceId: 'ws-2',
          responsibleItAdminEmployeeId: 'it-resp-2',
        },
      ]),
      countResponsibilitiesOf: jest
        .fn()
        .mockResolvedValue(new Map([['leaver', { subscriptions: 1, applications: 0 }]])),
    } as unknown as CatalogResponsibilityApi;
    const workspaceAdminNotWorking = jest.fn().mockResolvedValue(1);
    const itHandoverPending = jest.fn().mockResolvedValue(1);
    const notifier = { workspaceAdminNotWorking, itHandoverPending } as unknown as PersonnelNotifier;
    const service = new ItHandoverMilestoneService(catalog, notifier);

    const told = await service.reached(TX, {
      organizationId: 'org-1',
      source: { kind: 'OFFBOARDING_CASE', id: 'case-1' },
      employeeId: 'leaver',
      dueOn: '2026-11-10',
    });

    expect(told).toBe(1);
    expect(workspaceAdminNotWorking).toHaveBeenCalledTimes(2);
    expect(workspaceAdminNotWorking).toHaveBeenNthCalledWith(1, TX, {
      organizationId: 'org-1',
      workspaceId: 'ws-1',
      employeeId: 'leaver',
      responsibleItAdminEmployeeId: 'it-resp-1',
      workingAdminCount: 0,
    });
    expect(workspaceAdminNotWorking).toHaveBeenNthCalledWith(2, TX, {
      organizationId: 'org-1',
      workspaceId: 'ws-2',
      employeeId: 'leaver',
      responsibleItAdminEmployeeId: 'it-resp-2',
      workingAdminCount: 1,
    });
    expect(itHandoverPending).toHaveBeenCalledTimes(1);
  });

  it('notifies Super Admin with itHandoverPending when the leaving IT Admin only holds workspaces and license lots', async () => {
    const catalog = {
      vendorAdminRolesOf: jest.fn().mockResolvedValue([]),
      countResponsibilitiesOf: jest
        .fn()
        .mockResolvedValue(new Map([['leaver', { subscriptions: 0, applications: 0, workspaces: 1, licenseLots: 1 }]])),
    } as unknown as CatalogResponsibilityApi;
    const workspaceAdminNotWorking = jest.fn().mockResolvedValue(0);
    const itHandoverPending = jest.fn().mockResolvedValue(1);
    const notifier = { workspaceAdminNotWorking, itHandoverPending } as unknown as PersonnelNotifier;
    const service = new ItHandoverMilestoneService(catalog, notifier);

    const told = await service.reached(TX, {
      organizationId: 'org-1',
      source: { kind: 'OFFBOARDING_CASE', id: 'case-1' },
      employeeId: 'leaver',
      dueOn: '2026-11-10',
    });

    expect(told).toBe(1);
    expect(itHandoverPending).toHaveBeenCalledTimes(1);
  });
});
