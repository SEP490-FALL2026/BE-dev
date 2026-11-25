import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ApplicationRepo } from '../catalog-entry/application.repo';
import type { PlanFactsService } from '../plan/plan-facts.service';
import type { SubscriptionRepo } from '../subscription/subscription.repo';
import type { LicenseLotRepo } from '../license-lot/license-lot.repo';
import type { WorkspaceRepo } from '../workspace/workspace.repo';
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
    {} as WorkspaceRepo,
    {} as LicenseLotRepo,
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

describe('ResponsibilityHandoverService.transfer: the workspaces of the IT Admin who leaves (W3-10, SBF-16)', () => {
  const actor = { appUserId: 'app-sa', sessionId: 'sess-1', roles: ['SUPER_ADMIN'] } as never;

  function build() {
    const order: string[] = [];
    const applications = {
      reassignResponsible: jest.fn(() => {
        order.push('applications');

        return Promise.resolve(['app-1']);
      }),
    };
    const workspaces = {
      reassignResponsible: jest.fn(() => {
        order.push('workspaces');

        return Promise.resolve(['ws-1', 'ws-2']);
      }),
    };
    const subscriptions = {
      reassignResponsible: jest.fn(() => {
        order.push('subscriptions');

        return Promise.resolve(['sub-1']);
      }),
    };
    const lots = {
      reassignResponsible: jest.fn(() => {
        order.push('lots');

        return Promise.resolve(['lot-1']);
      }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ResponsibilityHandoverService(
      applications as unknown as ApplicationRepo,
      subscriptions as unknown as SubscriptionRepo,
      { workingAdminsAmong: jest.fn().mockResolvedValue(new Set(['it-nam'])) } as unknown as PlanFactsService,
      { getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }) } as unknown as OrganizationReadApi,
      audit as unknown as AuditApi,
      workspaces as unknown as WorkspaceRepo,
      lots as unknown as LicenseLotRepo,
    );

    return { service, order, audit, workspaces, lots };
  }

  it('hands the workspaces over in the same transaction, between the applications and the subscriptions, and audits each one', async () => {
    const { service, order, audit, workspaces } = build();

    const moved = await service.transfer(TX, actor, 'it-khoa', 'it-nam', { kind: 'OffboardingCase', id: 'case-1' });

    expect(moved).toEqual({
      applicationIds: ['app-1'],
      subscriptionIds: ['sub-1'],
      workspaceIds: ['ws-1', 'ws-2'],
      licenseLotIds: ['lot-1'],
    });
    // The lots come last: after the subscriptions they were born from (tier 6a after tier 6).
    expect(order).toEqual(['applications', 'workspaces', 'subscriptions', 'lots']);
    expect(workspaces.reassignResponsible).toHaveBeenCalledWith(TX, 'it-khoa', 'it-nam');
    const actions = audit.record.mock.calls.map((call: unknown[]) => (call[1] as { action: string }).action);
    expect(actions.filter((action: string) => action === 'WORKSPACE.RESPONSIBLE_TRANSFERRED')).toHaveLength(2);
    expect(audit.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        action: 'WORKSPACE.RESPONSIBLE_TRANSFERRED',
        resourceId: 'ws-1',
        before: { responsibleItAdminEmployeeId: 'it-khoa' },
        after: { responsibleItAdminEmployeeId: 'it-nam', sourceKind: 'OffboardingCase', sourceId: 'case-1' },
      }),
    );
  });

  it('audits each lot it hands over with the event of the lot', async () => {
    const { service, audit, lots } = build();

    await service.transfer(TX, actor, 'it-khoa', 'it-nam');

    expect(lots.reassignResponsible).toHaveBeenCalledWith(TX, 'it-khoa', 'it-nam');
    expect(audit.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        action: 'LICENSE_LOT.RESPONSIBLE_TRANSFERRED',
        resourceType: 'LicenseLot',
        resourceId: 'lot-1',
      }),
    );
  });

  it('refuses a receiver who is not working, before it writes anything', async () => {
    const { service, workspaces } = build();

    await expect(service.transfer(TX, actor, 'it-khoa', 'it-locked')).rejects.toMatchObject({
      name: 'ResponsibilityHandoverRefusedError',
    });
    expect(workspaces.reassignResponsible).not.toHaveBeenCalled();
  });
});
