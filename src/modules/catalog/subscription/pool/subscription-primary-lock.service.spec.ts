import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { PlanFactsService } from '../../plan/plan-facts.service';
import type { SubscriptionPoolService } from './subscription-pool.service';
import { SubscriptionChangeGuard } from '../subscription-change-guard.service';
import { SubscriptionChangeService } from '../subscription-change.service';
import { SubscriptionNotFoundError, SubscriptionPrimaryRetiredError } from '../subscription.errors';
import type { SubscriptionPricingService } from '../subscription-pricing.service';
import type { SubscriptionViewService } from '../subscription-view.service';
import { SubscriptionService } from '../subscription.service';
import type { SubscriptionRepo } from '../subscription.repo';
import type { SubscriptionRecord } from '../subscription.types';

describe('Subscription primary lock order', () => {
  const actor = { roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal;
  const tx = { kind: 'tx' };
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const plan = {
    id: 'plan-1',
    provisioningType: 'K1',
    applicationKind: 'SAAS',
    applicationStatus: 'ACTIVE',
    pricingModel: 'PER_SEAT',
  };
  const updatedAt = new Date('2026-11-18T00:00:00Z');
  const stored = (over: Partial<SubscriptionRecord> = {}) =>
    ({
      id: 'sub-1',
      planId: 'plan-1',
      planProvisioningType: 'K1',
      kind: 'TERM',
      status: 'DRAFT',
      purchasedQuantity: 5,
      unitPrice: { amountMinor: 10000n, currency: 'VND', recordedOn: '2026-11-18' },
      priceSnapshot: {
        rate: 10000n,
        rateDate: '2026-11-18',
        rateSource: 'MANUAL',
        reportingMinor: 10000n,
        reportingCurrency: 'VND',
      },
      originalPrice: null,
      billingCycle: 'MONTHLY',
      commitmentTermMonths: null,
      startDate: '2026-11-01',
      endDate: '2026-12-01',
      renewalDate: null,
      noticeDeadline: null,
      noticePeriodDays: null,
      autoRenew: false,
      allowsMidTermReduction: false,
      responsibleItAdminEmployeeId: null,
      vendorMinimumSeats: null,
      isPrimaryForPlan: false,
      renewedFromId: null,
      updatedAt,
      ...over,
    }) as unknown as SubscriptionRecord;

  const view = {
    viewAll: jest.fn((records: unknown[]) => Promise.resolve(records)),
  } as unknown as SubscriptionViewService;
  const audit = { record: jest.fn() } as unknown as AuditApi;
  const pricing = {
    priceToday: jest.fn(() => Promise.resolve({ unitPrice: null, priceSnapshot: null })),
  } as unknown as SubscriptionPricingService;

  beforeEach(() => jest.clearAllMocks());

  describe('SubscriptionChangeService.update', () => {
    const makeGuard = () =>
      ({
        requireOrganizationId: jest.fn(() => Promise.resolve('org-1')),
        requireResponsible: jest.fn(),
        assertNotBelowOccupied: jest.fn(),
        judgePool: jest.fn(),
        tellSeatIncrease: jest.fn(),
      }) as unknown as SubscriptionChangeGuard;

    it('refuses isPrimaryForPlan true before any lock is taken: the mark is retired (W3-27), the lock of the first wave stays for the completion', async () => {
      const lockPrimaryCandidates = jest.fn();
      const lockExclusive = jest.fn();
      const service = new SubscriptionChangeService(
        { find: jest.fn(), lockPrimaryCandidates } as unknown as SubscriptionRepo,
        { lockExclusive, lookups: jest.fn() } as unknown as PlanFactsService,
        pricing,
        view,
        audit,
        runner,
        makeGuard(),
      );

      await expect(service.update(actor, 'sub-1', { isPrimaryForPlan: true }, updatedAt)).rejects.toBeInstanceOf(
        SubscriptionPrimaryRetiredError,
      );
      expect(lockPrimaryCandidates).not.toHaveBeenCalled();
      expect(lockExclusive).not.toHaveBeenCalled();
    });

    it('keeps lock + plans.lockShared for a change of the terms', async () => {
      const lock = jest.fn(() => Promise.resolve(stored()));
      const lockPrimaryCandidates = jest.fn();
      const lockShared = jest.fn(() => Promise.resolve(plan));
      const update = jest.fn((_tx: unknown, _id: string, state: object) => Promise.resolve(stored({ ...state })));

      const service = new SubscriptionChangeService(
        { lock, lockPrimaryCandidates, update } as unknown as SubscriptionRepo,
        { lockShared } as unknown as PlanFactsService,
        pricing,
        view,
        audit,
        runner,
        makeGuard(),
      );

      await service.update(actor, 'sub-1', { autoRenew: true }, stored().updatedAt);

      expect(lock).toHaveBeenCalledWith(tx, 'sub-1');
      expect(lockShared).toHaveBeenCalledWith(tx, 'plan-1');
      expect(lockPrimaryCandidates).not.toHaveBeenCalled();
    });
  });

  describe('SubscriptionService.complete', () => {
    const makePoolRules = () =>
      ({
        assertActivation: jest.fn(),
        assertNoLiveDuplicate: jest.fn(),
        workspaceFor: jest.fn(() => Promise.resolve(null)),
        takePrimaryFromPrevious: jest.fn(() => Promise.resolve(true)),
      }) as unknown as SubscriptionPoolService;

    it('locks primary candidates with renewedFromId before plans.lockExclusive when renewedFromId is set', async () => {
      const order: string[] = [];
      const row = stored({ renewedFromId: 'sub-prev' });
      const find = jest.fn(() => {
        order.push('find');
        return Promise.resolve(row);
      });
      const lockPrimaryCandidates = jest.fn(() => {
        order.push('lockPrimaryCandidates');
        return Promise.resolve();
      });
      const lockExclusive = jest.fn(() => {
        order.push('lockExclusive');
        return Promise.resolve(plan);
      });
      const update = jest.fn((_tx: unknown, _id: string, state: object) => Promise.resolve(stored({ ...state })));

      const service = new SubscriptionService(
        { find, lockPrimaryCandidates, update } as unknown as SubscriptionRepo,
        { lockExclusive, lookups: jest.fn(() => Promise.resolve([plan])) } as unknown as PlanFactsService,
        pricing,
        view,
        {
          requireOrganizationId: jest.fn(() => Promise.resolve('org-1')),
          createForPeriod: jest.fn(),
          activatePeriod: jest.fn(),
          hasLines: jest.fn(() => Promise.resolve(false)),
        } as never,
        makePoolRules(),
        audit,
        runner,
      );

      await service.complete(actor, 'sub-1');

      expect(lockPrimaryCandidates).toHaveBeenCalledWith(tx, 'plan-1', ['sub-1', 'sub-prev']);
      // The first read is the one that tells which workspace to lock (W3-14): the workspace comes before the period and the plan.
      expect(order).toEqual(['find', 'find', 'lockPrimaryCandidates', 'find', 'lockExclusive']);
    });

    it('locks only the subscription before plans.lockExclusive when renewedFromId is null', async () => {
      const order: string[] = [];
      const row = stored({ renewedFromId: null });
      const find = jest.fn(() => {
        order.push('find');
        return Promise.resolve(row);
      });
      const lock = jest.fn(() => {
        order.push('lock');
        return Promise.resolve(row);
      });
      const lockPrimaryCandidates = jest.fn();
      const lockExclusive = jest.fn(() => {
        order.push('lockExclusive');
        return Promise.resolve(plan);
      });
      const update = jest.fn((_tx: unknown, _id: string, state: object) => Promise.resolve(stored({ ...state })));

      const service = new SubscriptionService(
        { find, lock, lockPrimaryCandidates, update } as unknown as SubscriptionRepo,
        { lockExclusive, lookups: jest.fn(() => Promise.resolve([plan])) } as unknown as PlanFactsService,
        pricing,
        view,
        {
          requireOrganizationId: jest.fn(() => Promise.resolve('org-1')),
          createForPeriod: jest.fn(),
          activatePeriod: jest.fn(),
          hasLines: jest.fn(() => Promise.resolve(false)),
        } as never,
        makePoolRules(),
        audit,
        runner,
      );

      await service.complete(actor, 'sub-1');

      expect(lockPrimaryCandidates).not.toHaveBeenCalled();
      expect(order).toEqual(['find', 'find', 'lock', 'lockExclusive']);
    });

    it('throws SubscriptionNotFoundError when subscription does not exist', async () => {
      const service = new SubscriptionService(
        { find: jest.fn(() => Promise.resolve(null)) } as unknown as SubscriptionRepo,
        {} as unknown as PlanFactsService,
        pricing,
        view,
        {
          requireOrganizationId: jest.fn(() => Promise.resolve('org-1')),
          createForPeriod: jest.fn(),
          activatePeriod: jest.fn(),
          hasLines: jest.fn(() => Promise.resolve(false)),
        } as never,
        makePoolRules(),
        audit,
        runner,
      );

      await expect(service.complete(actor, 'missing')).rejects.toBeInstanceOf(SubscriptionNotFoundError);
    });
  });
});
