import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { LockedPlan } from '../../plan/plan-facts.service';
import {
  SubscriptionDuplicatePlanError,
  SubscriptionMembersPaymentDayRequiredError,
  SubscriptionStaleError,
  SubscriptionVendorAdminsRequiredError,
  SubscriptionWorkspaceMovedError,
} from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
import type { SubscriptionRecord } from '../subscription.types';
import { SubscriptionPoolService, retryOnWorkspaceMove } from './subscription-pool.service';

const tx = {} as unknown as DbTx;

/** The service with only the two facades a declaration reads the IT Admin through; everything else is a bare stand-in the test never reaches. */
function build(input: { applicationResponsible: string | null; usable: readonly string[] }) {
  const responsibleItAdminIdOf = jest.fn().mockResolvedValue(input.applicationResponsible);
  const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(input.usable));
  const service = new SubscriptionPoolService(
    { findUsableItAdminEmployeeIds } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { responsibleItAdminIdOf } as never,
    {} as never,
  );

  return { service, responsibleItAdminIdOf, findUsableItAdminEmployeeIds };
}

describe('the IT Admin a subscription being declared answers to (QĐ-111g)', () => {
  it('is the one the declaration names, and reads nothing', async () => {
    const { service, responsibleItAdminIdOf, findUsableItAdminEmployeeIds } = build({
      applicationResponsible: 'it-app',
      usable: ['it-app'],
    });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', 'it-named')).toBe('it-named');
    expect(responsibleItAdminIdOf).not.toHaveBeenCalled();
    expect(findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });

  it('is the IT Admin responsible for the application of the plan, read through the plan, while they are a usable IT Admin', async () => {
    const { service, responsibleItAdminIdOf, findUsableItAdminEmployeeIds } = build({
      applicationResponsible: 'it-app',
      usable: ['it-app'],
    });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', undefined)).toBe('it-app');
    expect(responsibleItAdminIdOf).toHaveBeenCalledWith('plan-1', tx);
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-app'], tx);
  });

  it('is nobody when the one responsible for the application has left or lost the role', async () => {
    const { service } = build({ applicationResponsible: 'it-gone', usable: [] });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', undefined)).toBeNull();
  });

  it('is nobody, and does not ask who is usable, when the application names no IT Admin', async () => {
    const { service, findUsableItAdminEmployeeIds } = build({ applicationResponsible: null, usable: [] });

    expect(await service.responsibleOfDeclaration(tx, 'plan-1', undefined)).toBeNull();
    expect(findUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });
});

describe('SubscriptionPoolService.assertVendorAdmins and assertActivation', () => {
  const k2Plan: LockedPlan = {
    id: 'plan-k2',
    name: 'K2 Plan',
    applicationId: 'app-1',
    applicationName: 'App 1',
    applicationKind: 'SAAS',
    applicationStatus: 'APPROVED',
    provisioningType: 'K2',
    keyBinding: null,
    pricingModel: 'PER_SEAT',
    sharingPolicy: null,
    hasAdminConsole: false,
    referenceCommitmentMonths: null,
  };
  const k1Plan: LockedPlan = {
    ...k2Plan,
    id: 'plan-k1',
    provisioningType: 'K1',
  };

  function buildGate(input: {
    bound?: boolean;
    closed?: boolean;
    workingCount?: number;
    usableResponsible?: boolean;
    livenessRows?: Array<{
      id: string;
      planId: string;
      workspaceId?: string | null;
      status: 'DRAFT' | 'ACTIVE';
      kind: 'TERM' | 'PERPETUAL';
      endDate: string | null;
      renewed: boolean;
    }>;
  }) {
    const isClosed = jest.fn().mockResolvedValue(input.closed ?? true);
    const baselinePhase = {
      isBound: jest.fn().mockReturnValue(input.bound ?? true),
      get: jest.fn().mockImplementation(() => {
        if (input.bound === false) throw new Error("ExtensionPoint 'catalog.seat-baseline-phase' is not bound.");

        return { isClosed };
      }),
    };
    const workingAdminCount = jest.fn().mockResolvedValue(input.workingCount ?? 0);
    const findUsableItAdminEmployeeIds = jest
      .fn()
      .mockResolvedValue(input.usableResponsible === false ? new Set() : new Set(['it-1']));
    const getEmployee = jest.fn().mockResolvedValue({ status: 'ACTIVE', workState: 'WORKING' });
    const businessToday = jest.fn().mockResolvedValue('2026-11-15');
    const findLivenessOfPooledPlans = jest.fn().mockResolvedValue(input.livenessRows ?? []);
    const service = new SubscriptionPoolService(
      { findUsableItAdminEmployeeIds } as never,
      { getEmployee, businessToday } as never,
      { findLivenessOfPooledPlans } as never,
      {} as never,
      baselinePhase as never,
      {} as never,
      { workingAdminCount } as never,
    );

    return { service, isClosed, baselinePhase, workingAdminCount, findLivenessOfPooledPlans };
  }

  it('skips the gate for a plan that needs no vendor admins', async () => {
    const { service, baselinePhase, workingAdminCount } = buildGate({ closed: true });

    await expect(service.assertVendorAdmins(tx, k1Plan, 'org-1', 'ws-a')).resolves.toBeUndefined();
    expect(baselinePhase.isBound).not.toHaveBeenCalled();
    expect(workingAdminCount).not.toHaveBeenCalled();
  });

  it('lets a declaration through while the seat baseline phase is still open', async () => {
    const { service, isClosed, workingAdminCount } = buildGate({
      bound: true,
      closed: false,
      workingCount: 1,
    });

    await expect(service.assertVendorAdmins(tx, k2Plan, 'org-1', 'ws-a')).resolves.toBeUndefined();
    expect(isClosed).toHaveBeenCalledWith(tx, 'org-1');
    expect(workingAdminCount).not.toHaveBeenCalled();
  });

  it('refuses when the baseline phase is closed and fewer than two workspace admins are still working', async () => {
    const { service, workingAdminCount } = buildGate({
      bound: true,
      closed: true,
      workingCount: 1,
    });

    const err = await service.assertVendorAdmins(tx, k2Plan, 'org-1', 'ws-a').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubscriptionVendorAdminsRequiredError);
    expect((toSubscriptionApiException(err) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
      code: 'SUBSCRIPTION.VENDOR_ADMINS_REQUIRED',
    });
    expect(workingAdminCount).toHaveBeenCalledWith(tx, 'ws-a');
  });

  it('refuses when workspaceId is null for a plan that needs vendor admins', async () => {
    const { service, workingAdminCount } = buildGate({
      bound: true,
      closed: true,
      workingCount: 2,
    });

    const err = await service.assertVendorAdmins(tx, k2Plan, 'org-1', null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubscriptionVendorAdminsRequiredError);
    expect((toSubscriptionApiException(err) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
      code: 'SUBSCRIPTION.VENDOR_ADMINS_REQUIRED',
    });
    expect(workingAdminCount).not.toHaveBeenCalled();
  });

  it('allows activation when the baseline phase is closed and two workspace admins are working', async () => {
    const { service } = buildGate({
      bound: true,
      closed: true,
      workingCount: 2,
    });

    await expect(service.assertVendorAdmins(tx, k2Plan, 'org-1', 'ws-a')).resolves.toBeUndefined();
  });

  it('H-6 / G-4: fails loudly when SeatBaselinePhaseHook is not bound', async () => {
    const { service, isClosed } = buildGate({ bound: false, workingCount: 1 });

    await expect(service.assertVendorAdmins(tx, k2Plan, 'org-1', 'ws-a')).rejects.toThrow('not bound');
    expect(isClosed).not.toHaveBeenCalled();
  });

  it('checks vendor admins during assertActivation for a new subscription but skips for a renewal period', async () => {
    const state = {
      billingCycle: 'MONTHLY' as const,
      commitmentTermMonths: 1 as const,
      responsibleItAdminEmployeeId: 'it-1',
      workspaceId: 'ws-a',
    };
    const closedShort = buildGate({
      bound: true,
      closed: true,
      workingCount: 1,
    });

    const err = await closedShort.service
      .assertActivation(tx, k2Plan, 'TERM', state, false, 'org-1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubscriptionVendorAdminsRequiredError);
    expect((toSubscriptionApiException(err) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
      code: 'SUBSCRIPTION.VENDOR_ADMINS_REQUIRED',
    });
    await expect(
      closedShort.service.assertActivation(tx, k2Plan, 'TERM', state, true, 'org-1'),
    ).resolves.toBeUndefined();
  });

  describe('W3-14: workspace-scoped duplicate check and W3-11 active MEMBERS payment day', () => {
    it('refuses a second live subscription in the same (workspaceId, planId) even while the baseline is open', async () => {
      const { service } = buildGate({
        bound: true,
        closed: false,
        livenessRows: [
          {
            id: 'sub-1',
            planId: 'plan-k2',
            workspaceId: 'ws-a',
            status: 'ACTIVE',
            kind: 'TERM',
            endDate: '2026-12-31',
            renewed: false,
          },
        ],
      });

      const dupErr = await service.assertNoLiveDuplicate(tx, k2Plan, null, 'ws-a').catch((e: unknown) => e);
      expect(dupErr).toBeInstanceOf(SubscriptionDuplicatePlanError);
      expect((toSubscriptionApiException(dupErr) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
        code: 'SUBSCRIPTION.DUPLICATE_PLAN',
      });
      await expect(service.assertNoLiveDuplicate(tx, k2Plan, null, 'ws-b')).resolves.toBeUndefined();
      await expect(service.assertNoLiveDuplicate(tx, k2Plan, 'sub-1', 'ws-a')).resolves.toBeUndefined();
    });

    it('refuses clearing renewalDate on an already active MEMBERS subscription and refuses moving into a duplicate workspace', async () => {
      const { service } = buildGate({
        livenessRows: [
          {
            id: 'sub-moving',
            planId: 'plan-k2',
            workspaceId: 'ws-a',
            status: 'ACTIVE',
            kind: 'TERM',
            endDate: '2026-12-31',
            renewed: false,
          },
          {
            id: 'sub-target',
            planId: 'plan-k2',
            workspaceId: 'ws-b',
            status: 'ACTIVE',
            kind: 'TERM',
            endDate: '2026-12-31',
            renewed: false,
          },
        ],
      });
      const current = {
        id: 'sub-moving',
        planId: 'plan-k2',
        kind: 'TERM',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        commitmentTermMonths: 1,
        responsibleItAdminEmployeeId: null,
        renewedFromId: null,
        workspace: { id: 'ws-a', name: 'Anthropic' },
        seatCounting: 'MEMBERS',
        renewalDate: '2026-12-05',
      } as unknown as SubscriptionRecord;

      const payDayErr = await service
        .judgeChange(tx, {
          plan: k2Plan,
          current,
          state: {
            status: 'ACTIVE',
            billingCycle: 'MONTHLY',
            commitmentTermMonths: 1,
            responsibleItAdminEmployeeId: null,
            seatCounting: 'MEMBERS',
            renewalDate: null,
            workspaceId: 'ws-a',
          } as never,
          input: { renewalDate: null },
          actor: { employeeId: 'it-1' } as never,
          organizationId: 'org-1',
        })
        .catch((e: unknown) => e);
      expect(payDayErr).toBeInstanceOf(SubscriptionMembersPaymentDayRequiredError);
      expect((toSubscriptionApiException(payDayErr) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
        code: 'SUBSCRIPTION.MEMBERS_PAYMENT_DAY_REQUIRED',
      });

      const dupWsErr = await service
        .judgeChange(tx, {
          plan: k2Plan,
          current,
          state: {
            status: 'ACTIVE',
            billingCycle: 'MONTHLY',
            commitmentTermMonths: 1,
            responsibleItAdminEmployeeId: null,
            seatCounting: 'MEMBERS',
            renewalDate: '2026-12-05',
            workspaceId: 'ws-b',
          } as never,
          input: { workspaceId: 'ws-b' },
          actor: { employeeId: 'it-1' } as never,
          organizationId: 'org-1',
        })
        .catch((e: unknown) => e);
      expect(dupWsErr).toBeInstanceOf(SubscriptionDuplicatePlanError);
      expect((toSubscriptionApiException(dupWsErr) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
        code: 'SUBSCRIPTION.DUPLICATE_PLAN',
      });
    });
  });
});

describe('retryOnWorkspaceMove (W3-14, N5)', () => {
  const moved = () => new SubscriptionWorkspaceMovedError(new Date('2026-12-01T00:00:00.000Z'));

  it('returns what the work returns when the workspace did not move', async () => {
    const work = jest.fn().mockResolvedValue('written');

    await expect(retryOnWorkspaceMove(work)).resolves.toBe('written');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('starts the write again when the workspace moved, and answers what the second try writes', async () => {
    const work = jest.fn().mockRejectedValueOnce(moved()).mockResolvedValue('written');

    await expect(retryOnWorkspaceMove(work)).resolves.toBe('written');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('says the subscription is stale, with its version, after three tries, and no more', async () => {
    const work = jest.fn().mockRejectedValue(moved());

    await expect(retryOnWorkspaceMove(work)).rejects.toBeInstanceOf(SubscriptionStaleError);
    await expect(retryOnWorkspaceMove(work)).rejects.toMatchObject({
      currentUpdatedAt: new Date('2026-12-01T00:00:00.000Z'),
    });
    expect(work).toHaveBeenCalledTimes(6);
  });

  it('lets any other error through at once, with no new try', async () => {
    const work = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(retryOnWorkspaceMove(work)).rejects.toThrow('db down');
    expect(work).toHaveBeenCalledTimes(1);
  });
});
