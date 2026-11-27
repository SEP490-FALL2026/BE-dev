import type { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { PlanFactsService } from '../../plan/plan-facts.service';
import type { SubscriptionPeriodLinesService } from '../../subscription-line/subscription-period-lines.service';
import { SubscriptionSeatCountingFixedError, SubscriptionStaleError } from '../subscription.errors';
import type { SubscriptionRepo } from '../subscription.repo';
import type { SubscriptionRecord } from '../subscription.types';
import type { SubscriptionChangeGuard } from '../subscription-change-guard.service';
import { SubscriptionChangeService } from '../subscription-change.service';
import type { SubscriptionPricingService } from '../subscription-pricing.service';
import type { SubscriptionViewService } from '../subscription-view.service';

/** W3-11 and W3-14 on the update of a subscription: how the seats are counted, and the order of the locks when it moves to another workspace. */
describe('SubscriptionChangeService: the workspace of a subscription (W3-11, W3-14)', () => {
  const tx = { tag: 'tx' };
  const actor = {
    appUserId: 'u-khoa',
    employeeId: 'emp-khoa',
    sessionId: 's-1',
    roles: ['IT_ADMIN'],
  } as unknown as AuthenticatedPrincipal;
  const plan = {
    id: 'plan-1',
    provisioningType: 'K2',
    applicationKind: 'SAAS',
    applicationStatus: 'APPROVED',
    pricingModel: 'PER_SEAT',
    hasAdminConsole: false,
    applicationVendorId: 'v-1',
  };
  const updatedAt = new Date('2026-12-01T00:00:00.000Z');
  const stored = (over: Partial<SubscriptionRecord> = {}) =>
    ({
      id: 'sub-1',
      planId: 'plan-1',
      planProvisioningType: 'K2',
      kind: 'TERM',
      status: 'ACTIVE',
      purchasedQuantity: 5,
      unitPrice: { amountMinor: 10000n, currency: 'VND', recordedOn: '2026-11-18' },
      monthlyUnitPriceMinor: 10000n,
      priceSnapshot: {
        rate: 10000n,
        rateDate: '2026-11-18',
        rateSource: 'SAME_CURRENCY',
        reportingMinor: 10000n,
        reportingCurrency: 'VND',
        exchangeRateId: null,
      },
      originalPrice: null,
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 1,
      startDate: '2026-11-01',
      endDate: null,
      renewalDate: '2026-12-05',
      noticeDeadline: null,
      noticePeriodDays: null,
      autoRenew: true,
      allowsMidTermReduction: false,
      responsibleItAdminEmployeeId: 'emp-khoa',
      vendorMinimumSeats: null,
      isPrimaryForPlan: false,
      renewedFromId: null,
      workspace: { id: 'ws-a', name: 'Anthropic' },
      seatCounting: 'FIXED',
      minimumSeatsTotal: null,
      invoicedLater: false,
      updatedAt,
      ...over,
    }) as unknown as SubscriptionRecord;

  function setup(options: { reads: SubscriptionRecord[]; locked?: SubscriptionRecord }) {
    const order: string[] = [];
    const reads = [...options.reads];
    const subscriptions = {
      find: jest.fn(() => {
        order.push('find');

        return Promise.resolve(reads.shift() ?? options.reads[options.reads.length - 1]);
      }),
      lock: jest.fn(() => {
        order.push('lock');

        return Promise.resolve(options.locked ?? stored());
      }),
      update: jest.fn((_tx: unknown, _id: string, state: object) => Promise.resolve(stored({ ...state }))),
    } as unknown as SubscriptionRepo;
    const plans = {
      lockShared: jest.fn(() => {
        order.push('lockShared');

        return Promise.resolve(plan);
      }),
      lookups: jest.fn().mockResolvedValue([plan]),
    } as unknown as PlanFactsService;
    const guard = {
      requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
      assertNotBelowOccupied: jest.fn(),
      judgePool: jest.fn(),
      tellSeatIncrease: jest.fn(),
      tellSeatReduction: jest.fn(),
      lockWorkspaces: jest.fn(() => {
        order.push('lockWorkspaces');

        return Promise.resolve();
      }),
    } as unknown as SubscriptionChangeGuard;
    const runner = {
      run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)),
    } as unknown as TransactionRunner;
    const service = new SubscriptionChangeService(
      subscriptions,
      plans,
      { priceToday: jest.fn() } as unknown as SubscriptionPricingService,
      { viewAll: jest.fn((records: unknown[]) => Promise.resolve(records)) } as unknown as SubscriptionViewService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
      guard,
      {
        activatePeriod: jest.fn(),
        syncDraftUpdate: jest.fn(),
        hasLines: jest.fn().mockResolvedValue(false),
      } as unknown as SubscriptionPeriodLinesService,
    );

    return {
      service,
      order,
      subscriptions: subscriptions as unknown as Record<string, jest.Mock>,
      guard: guard as unknown as Record<string, jest.Mock>,
    };
  }

  it('locks the workspace it leaves and the one it goes to before the period and the plan, then writes the new workspace', async () => {
    const { service, order, guard, subscriptions } = setup({ reads: [stored()] });

    await service.update(actor, 'sub-1', { workspaceId: 'ws-b' });

    expect(order).toEqual(['find', 'lockWorkspaces', 'lock', 'lockShared']);
    expect(guard.lockWorkspaces).toHaveBeenCalledWith(tx, plan, ['ws-a', 'ws-b']);
    expect(subscriptions.update).toHaveBeenCalledWith(tx, 'sub-1', expect.objectContaining({ workspaceId: 'ws-b' }));
  });

  it('locks no workspace when the update does not name one', async () => {
    const { service, guard } = setup({ reads: [stored()] });

    await service.update(actor, 'sub-1', { autoRenew: false });

    expect(guard.lockWorkspaces).not.toHaveBeenCalled();
  });

  it('starts again when the subscription moved to another workspace between the read and the lock of the period, then says stale after three tries', async () => {
    const moved = setup({ reads: [stored()], locked: stored({ workspace: { id: 'ws-c', name: 'Other' } }) });

    await expect(moved.service.update(actor, 'sub-1', { workspaceId: 'ws-b' })).rejects.toBeInstanceOf(
      SubscriptionStaleError,
    );
    expect(moved.guard.lockWorkspaces).toHaveBeenCalledTimes(3);
    expect(moved.subscriptions.update).not.toHaveBeenCalled();
  });

  it('refuses to change how the seats are counted once the subscription is active, with the code of the rule, and writes nothing', async () => {
    const { service, subscriptions } = setup({ reads: [stored()] });

    await expect(service.update(actor, 'sub-1', { seatCounting: 'MEMBERS' })).rejects.toBeInstanceOf(
      SubscriptionSeatCountingFixedError,
    );
    expect(subscriptions.update).not.toHaveBeenCalled();
  });

  it('lets a draft choose how its seats are counted, and an active one repeat the way it already counts them', async () => {
    const draft = setup({ reads: [stored()], locked: stored({ status: 'DRAFT' }) });
    await expect(draft.service.update(actor, 'sub-1', { seatCounting: 'MEMBERS' })).resolves.toBeDefined();
    expect(draft.subscriptions.update).toHaveBeenCalledWith(
      tx,
      'sub-1',
      expect.objectContaining({ seatCounting: 'MEMBERS' }),
    );

    const same = setup({ reads: [stored()] });
    await expect(
      same.service.update(actor, 'sub-1', { seatCounting: 'FIXED', invoicedLater: true }),
    ).resolves.toBeDefined();
  });
});
