import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ApplicationRepo } from '../catalog-entry/application.repo';
import type { PlanFactsService } from '../plan/plan-facts.service';
import type { SubscriptionRepo } from '../subscription/subscription.repo';
import { ResponsibilityHandoverService } from './responsibility-handover.service';

const TX = {} as DbTx;

function setup(subscriptionIds: string[], workingIds: string[]) {
  const findActiveResponsibleItAdminIdsOfPlan = jest.fn().mockResolvedValue(subscriptionIds);
  const workingAdminsAmong = jest.fn().mockResolvedValue(new Set(workingIds));
  const service = new ResponsibilityHandoverService(
    {} as ApplicationRepo,
    { findActiveResponsibleItAdminIdsOfPlan } as unknown as SubscriptionRepo,
    { workingAdminsAmong } as unknown as PlanFactsService,
    {} as OrganizationReadApi,
    {} as AuditApi,
  );

  return { service, findActiveResponsibleItAdminIdsOfPlan, workingAdminsAmong };
}

describe('ResponsibilityHandoverService.usableSubscriptionItAdminsOfPlan', () => {
  it('returns empty without calling workingAdminsAmong when no active subscription names a responsible IT Admin', async () => {
    const { service, workingAdminsAmong } = setup([], []);

    await expect(service.usableSubscriptionItAdminsOfPlan('plan-1', TX)).resolves.toEqual([]);
    expect(workingAdminsAmong).not.toHaveBeenCalled();
  });

  it('filters active subscription responsible IT Admins through workingAdminsAmong preserving order', async () => {
    const { service, findActiveResponsibleItAdminIdsOfPlan, workingAdminsAmong } = setup(
      ['it-1', 'it-locked', 'it-2'],
      ['it-1', 'it-2'],
    );

    await expect(service.usableSubscriptionItAdminsOfPlan('plan-1', TX)).resolves.toEqual(['it-1', 'it-2']);
    expect(findActiveResponsibleItAdminIdsOfPlan).toHaveBeenCalledWith('plan-1', TX);
    expect(workingAdminsAmong).toHaveBeenCalledWith(['it-1', 'it-locked', 'it-2'], TX);
  });
});
