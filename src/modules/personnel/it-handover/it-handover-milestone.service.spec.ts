import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import type { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { ItHandoverMilestoneService } from './it-handover-milestone.service';

const TX = {} as DbTx;

describe('ItHandoverMilestoneService', () => {
  it('passes usable subscription IT Admins of each plan left without admin to vendorAdminsGone', async () => {
    const usableSubscriptionItAdminsOfPlan = jest.fn().mockResolvedValue(['it-sub-1', 'it-sub-2']);
    const catalog = {
      vendorAdminRolesOf: jest.fn().mockResolvedValue([
        { planId: 'plan-1', applicationId: 'app-1', role: 'OWNER', othersWorking: 0 },
        { planId: 'plan-2', applicationId: 'app-2', role: 'ADMIN', othersWorking: 1 },
      ]),
      usableSubscriptionItAdminsOfPlan,
      countResponsibilitiesOf: jest
        .fn()
        .mockResolvedValue(new Map([['leaver', { subscriptions: 1, applications: 0 }]])),
    } as unknown as CatalogResponsibilityApi;
    const vendorAdminsGone = jest.fn().mockResolvedValue(2);
    const itHandoverPending = jest.fn().mockResolvedValue(1);
    const notifier = { vendorAdminsGone, itHandoverPending } as unknown as PersonnelNotifier;
    const service = new ItHandoverMilestoneService(catalog, notifier);

    const told = await service.reached(TX, {
      organizationId: 'org-1',
      source: { kind: 'OFFBOARDING_CASE', id: 'case-1' },
      employeeId: 'leaver',
      dueOn: '2026-11-10',
    });

    expect(told).toBe(1);
    expect(usableSubscriptionItAdminsOfPlan).toHaveBeenCalledTimes(1);
    expect(usableSubscriptionItAdminsOfPlan).toHaveBeenCalledWith('plan-1', TX);
    expect(vendorAdminsGone).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      planId: 'plan-1',
      applicationId: 'app-1',
      sourceId: 'case-1',
      responsibleItAdminEmployeeIds: ['it-sub-1', 'it-sub-2'],
      leavingEmployeeId: 'leaver',
    });
    expect(itHandoverPending).toHaveBeenCalledTimes(1);
  });
});
