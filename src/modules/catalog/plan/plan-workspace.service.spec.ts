import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  WorkspaceAdminNotItAdminError,
  WorkspaceAdminsTooFewError,
  WorkspaceLimitExceededError,
  WorkspaceNotResponsibleError,
  WorkspacePrimaryOwnerNotAdminError,
  WorkspaceRequiredError,
  WorkspaceStaleError,
  WorkspaceTextInvalidError,
} from '../workspace/workspace.errors';
import type { WorkspaceRepo } from '../workspace/workspace.repo';
import type { WorkspaceService } from '../workspace/workspace.service';
import type { WorkspaceAdminsService } from '../workspace/workspace-admins.service';
import type { WorkspaceForSubscriptionService } from '../workspace/workspace-for-subscription.service';
import {
  PlanNotFoundError,
  PlanPrimaryOwnerNotListedError,
  PlanVendorAdminsInvalidError,
  PlanWorkspaceAmbiguousError,
  PlanWorkspaceLimitExceededError,
  PlanWorkspacePersonInvalidError,
  PlanWorkspaceProfileNotApplicableError,
  PlanWorkspaceTextInvalidError,
  PlanWorkspaceVendorRequiredError,
} from './plan.errors';
import type { PlanRepo } from './plan.repo';
import { PlanWorkspaceService, type WorkspaceProfileInput } from './plan-workspace.service';
import type { WorkspaceProfileRecord } from './plan.types';

describe('PlanWorkspaceService: the old route writes the workspace of the vendor (W3-13)', () => {
  const tx = { tag: 'tx' };
  const khoa = {
    appUserId: 'u-khoa',
    employeeId: 'emp-khoa',
    sessionId: 's-1',
    roles: ['IT_ADMIN'],
  } as unknown as AuthenticatedPrincipal;
  const version = new Date('2026-12-01T00:00:00.000Z');
  const input: WorkspaceProfileInput = {
    primaryOwnerEmployeeId: 'emp-khoa',
    members: [
      { employeeId: 'emp-khoa', role: 'OWNER' },
      { employeeId: 'emp-nam', role: 'ADMIN' },
    ],
    ownerAccountEmail: 'it@acme.vn',
    adminNote: 'Standard note',
  };

  function setup(
    options: {
      plan?: Record<string, unknown> | null;
      before?: WorkspaceProfileRecord | null;
      resolve?: () => Promise<string | null>;
      adminsFail?: Error;
      updateFail?: Error;
      employeesFail?: Error;
    } = {},
  ) {
    const order: string[] = [];
    const runSpy = jest.fn((work: (t: unknown) => unknown) => Promise.resolve(work(tx)));
    const localRunner = { run: runSpy } as unknown as TransactionRunner;
    const plan =
      options.plan === undefined
        ? { id: 'plan-1', provisioningType: 'K2', hasAdminConsole: false, applicationVendorId: 'v-1' }
        : options.plan;
    const plans = {
      findLookups: jest.fn().mockResolvedValue(plan ? [plan] : []),
      findProfile: jest.fn().mockResolvedValue(options.before === undefined ? null : options.before),
    } as unknown as PlanRepo;
    const afterAdminsVersion = new Date('2026-12-02T00:00:00.000Z');
    const workspaceAdmins = {
      setInTx: jest.fn(() => {
        order.push('admins');

        return options.adminsFail
          ? Promise.reject(options.adminsFail)
          : Promise.resolve({ id: 'ws-1', updatedAt: afterAdminsVersion });
      }),
    } as unknown as WorkspaceAdminsService;
    const workspaces = {
      requireItAdmins: jest.fn(() => {
        order.push('requireItAdmins');

        return options.employeesFail ? Promise.reject(options.employeesFail) : Promise.resolve();
      }),
      updateInTx: jest.fn(() => {
        order.push('update');

        return options.updateFail ? Promise.reject(options.updateFail) : Promise.resolve({});
      }),
    } as unknown as WorkspaceService;
    const forSubscription = {
      resolveAndLock: jest.fn(() => {
        order.push('resolveAndLock');

        return (options.resolve ?? (() => Promise.resolve('ws-1')))();
      }),
    } as unknown as WorkspaceForSubscriptionService;
    const workspaceRepo = {
      find: jest.fn().mockResolvedValue({ id: 'ws-1', updatedAt: version }),
    } as unknown as WorkspaceRepo;
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      getEmployees: jest.fn().mockResolvedValue([
        { id: 'emp-khoa', employeeCode: 'KHOA', fullName: 'Khoa' },
        { id: 'emp-nam', employeeCode: 'NAM', fullName: 'Nam' },
      ]),
    } as unknown as OrganizationReadApi;
    // The profile read back after the write.
    (plans.findProfile as jest.Mock).mockResolvedValueOnce(options.before === undefined ? null : options.before);

    return {
      service: new PlanWorkspaceService(
        plans,
        workspaces,
        workspaceAdmins,
        forSubscription,
        workspaceRepo,
        organizationReads,
        localRunner,
      ),
      plans: plans as unknown as Record<string, jest.Mock>,
      workspaceAdmins: workspaceAdmins as unknown as Record<string, jest.Mock>,
      workspaces: workspaces as unknown as Record<string, jest.Mock>,
      forSubscription: forSubscription as unknown as Record<string, jest.Mock>,
      runSpy,
      order,
    };
  }

  const stored = (over: Partial<WorkspaceProfileRecord> = {}): WorkspaceProfileRecord => ({
    planId: 'plan-1',
    primaryOwnerEmployeeId: 'emp-khoa',
    members: [
      { employeeId: 'emp-khoa', role: 'OWNER' },
      { employeeId: 'emp-nam', role: 'ADMIN' },
    ],
    ownerLimit: null,
    adminLimit: null,
    ownerTransferProcedure: null,
    emergencyAccount: null,
    ownerAccountEmail: 'it@acme.vn',
    adminNote: 'Standard note',
    updatedAt: version,
    ...over,
  });

  it('locks employees then workspace in a single transaction, checks limits with new values, and updates the profile', async () => {
    const { service, plans, workspaceAdmins, workspaces, forSubscription, runSpy, order } = setup();
    plans.findProfile.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(stored());

    const view = await service.set(khoa, 'plan-1', {
      ...input,
      ownerLimit: 1,
      adminLimit: 4,
      emergencyAccount: {
        identity: 'break-glass',
        occupiesSeat: false,
        holderEmployeeId: 'emp-break',
        lastReviewedOn: '2026-12-01',
      },
    });

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(workspaces.requireItAdmins).toHaveBeenCalledWith(tx, ['emp-break', 'emp-khoa', 'emp-nam']);
    expect(forSubscription.resolveAndLock).toHaveBeenCalledWith(
      tx,
      khoa,
      'org-1',
      { vendorId: 'v-1', needsWorkspace: true },
      undefined,
    );
    expect(order).toEqual(['requireItAdmins', 'resolveAndLock', 'admins', 'update']);
    expect(workspaceAdmins.setInTx).toHaveBeenCalledWith(
      tx,
      khoa,
      'org-1',
      'ws-1',
      {
        admins: input.members,
        primaryOwnerEmployeeId: 'emp-khoa',
        expectedUpdatedAt: version,
      },
      {
        current: { id: 'ws-1', updatedAt: version },
        limits: { ownerLimit: 1, adminLimit: 4 },
        employeesChecked: true,
      },
    );
    expect(workspaces.updateInTx).toHaveBeenCalledWith(
      tx,
      khoa,
      'org-1',
      'ws-1',
      {
        expectedUpdatedAt: new Date('2026-12-02T00:00:00.000Z'),
        ownerLimit: 1,
        adminLimit: 4,
        ownerTransferProcedure: null,
        emergencyAccount: {
          identity: 'break-glass',
          occupiesSeat: false,
          holderEmployeeId: 'emp-break',
          lastReviewedOn: '2026-12-01',
        },
        ownerAccountEmail: 'it@acme.vn',
        adminNote: 'Standard note',
      },
      { current: { id: 'ws-1', updatedAt: new Date('2026-12-02T00:00:00.000Z') }, employeeChecked: true },
    );
    expect(view.primaryOwner).toEqual({ employeeId: 'emp-khoa', employeeCode: 'KHOA', fullName: 'Khoa' });
  });

  it('stops on invalid emergency holder before resolveAndLock so no workspace or admin is written', async () => {
    const { service, forSubscription, workspaceAdmins } = setup({
      employeesFail: new WorkspaceAdminNotItAdminError('emp-fin'),
    });

    await expect(
      service.set(khoa, 'plan-1', {
        ...input,
        emergencyAccount: {
          identity: 'break-glass',
          occupiesSeat: false,
          holderEmployeeId: 'emp-fin',
          lastReviewedOn: '2026-12-01',
        },
      }),
    ).rejects.toBeInstanceOf(PlanWorkspacePersonInvalidError);
    expect(forSubscription.resolveAndLock).not.toHaveBeenCalled();
    expect(workspaceAdmins.setInTx).not.toHaveBeenCalled();
  });

  it('passes through WorkspaceStaleError when a concurrent write moved the workspace version', async () => {
    const { service } = setup({
      before: stored({ adminNote: 'Old note' }),
      adminsFail: new WorkspaceStaleError(new Date('2026-12-03T00:00:00.000Z')),
    });

    await expect(service.set(khoa, 'plan-1', input)).rejects.toBeInstanceOf(WorkspaceStaleError);
  });

  it('writes nothing when the profile already says what the route is given', async () => {
    const { service, workspaceAdmins, workspaces, plans } = setup({ before: stored() });
    plans.findProfile.mockReset().mockResolvedValue(stored());

    await service.set(khoa, 'plan-1', input);

    expect(workspaceAdmins.setInTx).not.toHaveBeenCalled();
    expect(workspaces.updateInTx).not.toHaveBeenCalled();
  });

  it('refuses a plan that does not exist, a plan that needs no admins at the vendor, and an application with no vendor', async () => {
    await expect(setup({ plan: null }).service.set(khoa, 'plan-9', input)).rejects.toBeInstanceOf(PlanNotFoundError);
    await expect(
      setup({
        plan: { id: 'p', provisioningType: 'K1', hasAdminConsole: false, applicationVendorId: 'v-1' },
      }).service.set(khoa, 'p', input),
    ).rejects.toBeInstanceOf(PlanWorkspaceProfileNotApplicableError);
    await expect(
      setup({
        plan: { id: 'p', provisioningType: 'K2', hasAdminConsole: false, applicationVendorId: null },
      }).service.set(khoa, 'p', input),
    ).rejects.toBeInstanceOf(PlanWorkspaceVendorRequiredError);
  });

  it('judges the shape of the profile before it touches the workspace, with the codes the route always had', async () => {
    const { service, forSubscription } = setup();

    await expect(
      service.set(khoa, 'plan-1', { ...input, members: [{ employeeId: 'emp-khoa', role: 'OWNER' }] }),
    ).rejects.toBeInstanceOf(PlanVendorAdminsInvalidError);
    await expect(service.set(khoa, 'plan-1', { ...input, primaryOwnerEmployeeId: 'emp-nam' })).rejects.toBeInstanceOf(
      PlanPrimaryOwnerNotListedError,
    );
    await expect(
      service.set(khoa, 'plan-1', {
        ...input,
        ownerLimit: 1,
        members: [...input.members, { employeeId: 'emp-lan', role: 'OWNER' }],
      }),
    ).rejects.toBeInstanceOf(PlanWorkspaceLimitExceededError);
    expect(forSubscription.resolveAndLock).not.toHaveBeenCalled();
  });

  it('tells a vendor with several workspaces (409 PLAN.WORKSPACE_AMBIGUOUS), naming them', async () => {
    const { service } = setup({ resolve: () => Promise.reject(new WorkspaceRequiredError(['ws-1', 'ws-2'])) });

    await expect(service.set(khoa, 'plan-1', input)).rejects.toBeInstanceOf(PlanWorkspaceAmbiguousError);
    await expect(service.set(khoa, 'plan-1', input)).rejects.toMatchObject({ workspaceIds: ['ws-1', 'ws-2'] });
  });

  it('says what the workspace says to anyone who does not answer for it (403), unchanged', async () => {
    const { service } = setup({ adminsFail: new WorkspaceNotResponsibleError() });

    await expect(service.set(khoa, 'plan-1', input)).rejects.toBeInstanceOf(WorkspaceNotResponsibleError);
  });

  it.each([
    [new WorkspaceAdminNotItAdminError('emp-fin'), PlanWorkspacePersonInvalidError],
    [new WorkspaceAdminsTooFewError(1, 2), PlanVendorAdminsInvalidError],
    [new WorkspacePrimaryOwnerNotAdminError(), PlanPrimaryOwnerNotListedError],
    [new WorkspaceLimitExceededError('ADMIN'), PlanWorkspaceLimitExceededError],
    [new WorkspaceTextInvalidError(), PlanWorkspaceTextInvalidError],
  ])('turns %p of the workspace into the error the route always answered', async (failure, expected) => {
    await expect(setup({ adminsFail: failure }).service.set(khoa, 'plan-1', input)).rejects.toBeInstanceOf(expected);
  });

  it('refuses an emergency account with no identity before it writes', async () => {
    const { service, workspaceAdmins } = setup();

    await expect(
      service.set(khoa, 'plan-1', {
        ...input,
        emergencyAccount: {
          identity: '   ',
          occupiesSeat: false,
          holderEmployeeId: 'emp-khoa',
          lastReviewedOn: '2026-12-01',
        },
      }),
    ).rejects.toBeInstanceOf(PlanWorkspaceTextInvalidError);
    expect(workspaceAdmins.setInTx).not.toHaveBeenCalled();
  });
});
