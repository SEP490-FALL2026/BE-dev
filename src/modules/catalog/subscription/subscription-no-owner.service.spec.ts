import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { PlanFactsService } from '../plan/plan-facts.service';
import type { SubscriptionPoolService } from './pool/subscription-pool.service';
import { SubscriptionChangeGuard } from './subscription-change-guard.service';
import { SubscriptionChangeService } from './subscription-change.service';
import type { SubscriptionPricingService } from './subscription-pricing.service';
import type { SubscriptionViewService } from './subscription-view.service';
import { SubscriptionService } from './subscription.service';
import type { SubscriptionRepo } from './subscription.repo';
import type { SubscriptionRecord } from './subscription.types';

/** A subscription has no owning department (`QĐ-113g`): none is asked when one is declared, and no Cost Center when one is changed. A plan of personal accounts (K1) has no subscription since W3-27, so the plan here is one of seats. */
describe('QĐ-113g: no owning department on a subscription', () => {
  const actor = { roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal;
  const tx = {};
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const plan = {
    id: 'plan-1',
    provisioningType: 'K2',
    applicationKind: 'SAAS',
    applicationStatus: 'ACTIVE',
    pricingModel: 'PER_SEAT',
  };
  const stored = (over: Partial<SubscriptionRecord> = {}) =>
    ({
      id: 'sub-1',
      planId: 'plan-1',
      planProvisioningType: 'K2',
      kind: 'TERM',
      status: 'DRAFT',
      purchasedQuantity: 5,
      unitPrice: null,
      priceSnapshot: null,
      originalPrice: null,
      billingCycle: null,
      commitmentTermMonths: null,
      startDate: null,
      endDate: null,
      renewalDate: null,
      noticeDeadline: null,
      noticePeriodDays: null,
      autoRenew: false,
      allowsMidTermReduction: false,
      responsibleItAdminEmployeeId: null,
      vendorMinimumSeats: null,
      isPrimaryForPlan: false,
      updatedAt: new Date('2026-11-18T00:00:00Z'),
      ...over,
    }) as unknown as SubscriptionRecord;
  const view = {
    viewAll: jest.fn((records: unknown[]) => Promise.resolve(records)),
  } as unknown as SubscriptionViewService;
  const audit = { record: jest.fn() } as unknown as AuditApi;
  const pricing = {
    priceToday: jest.fn(() => Promise.resolve({ unitPrice: null, priceSnapshot: null })),
  } as unknown as SubscriptionPricingService;
  const organization = { getOrganization: jest.fn(() => Promise.resolve({ id: 'org-1' })) };
  const lockDepartmentShared = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it('declares a subscription: it has no department and none is looked at', async () => {
    const insert = jest.fn(() => Promise.resolve(stored({})));
    const service = new SubscriptionService(
      { insert } as unknown as SubscriptionRepo,
      {
        lockExclusive: jest.fn(() => Promise.resolve(plan)),
        lookups: jest.fn(() => Promise.resolve([plan])),
      } as unknown as PlanFactsService,
      pricing,
      view,
      { ...organization, lockDepartmentShared } as unknown as OrganizationReadApi,
      {
        assertNoLiveDuplicate: jest.fn(),
        workspaceFor: jest.fn(() => Promise.resolve(null)),
        responsibleOfDeclaration: jest.fn(() => Promise.resolve(null)),
        assert: jest.fn(),
        assertVendorAdmins: jest.fn(),
        requireItAdmin: jest.fn(),
      } as unknown as SubscriptionPoolService,
      audit,
      runner,
    );

    await service.declare(actor, { planId: 'plan-1', kind: 'TERM' });

    expect((insert.mock.calls as unknown[][])[0]?.[1]).not.toHaveProperty('ownerDepartmentId');
    expect(lockDepartmentShared).not.toHaveBeenCalled();
  });

  it('changes the terms of a subscription without asking a Cost Center of any department', async () => {
    const update = jest.fn((_tx: unknown, _id: string, state: object) => Promise.resolve(stored({ ...state })));
    const guard = {
      requireOrganizationId: jest.fn(() => Promise.resolve('org-1')),
      assertNotBelowOccupied: jest.fn(),
      judgePool: jest.fn(),
      tellSeatIncrease: jest.fn(),
    } as unknown as SubscriptionChangeGuard;
    const service = new SubscriptionChangeService(
      { lock: jest.fn(() => Promise.resolve(stored())), update } as unknown as SubscriptionRepo,
      { lockShared: jest.fn(() => Promise.resolve(plan)) } as unknown as PlanFactsService,
      pricing,
      view,
      audit,
      runner,
      guard,
    );

    await service.update(actor, 'sub-1', { autoRenew: true }, stored().updatedAt);

    expect(update).toHaveBeenCalledWith(tx, 'sub-1', expect.objectContaining({ autoRenew: true }));
  });

  it('declares TERM with monthlyUnitPrice 500.000 ANNUAL -> stores monthly 500.000 and unit 6.000.000, and defaults commitmentTermMonths from plan', async () => {
    const insert = jest.fn((_t: unknown, data: object) => Promise.resolve(stored({ ...data })));
    const planWithCommitment = { ...plan, provisioningType: 'K2', referenceCommitmentMonths: 12 as const };
    const priceService = {
      read: jest.fn((money: { amount: string; currency: string }) =>
        Promise.resolve({ amountMinor: BigInt(money.amount), currency: money.currency }),
      ),
      priceToday: jest.fn((_t: unknown, money: { amountMinor: bigint; currency: string } | null) =>
        Promise.resolve(
          money
            ? {
                unitPrice: { ...money, recordedOn: '2026-11-25' },
                priceSnapshot: {
                  rate: 10_000_000_000n,
                  rateDate: '2026-11-25',
                  rateSource: 'SAME_CURRENCY',
                  reportingMinor: money.amountMinor,
                  reportingCurrency: 'VND',
                  exchangeRateId: null,
                },
              }
            : { unitPrice: null, priceSnapshot: null },
        ),
      ),
    } as unknown as SubscriptionPricingService;
    const service = new SubscriptionService(
      { insert } as unknown as SubscriptionRepo,
      {
        lockExclusive: jest.fn(() => Promise.resolve(planWithCommitment)),
        lookups: jest.fn(() => Promise.resolve([planWithCommitment])),
      } as unknown as PlanFactsService,
      priceService,
      view,
      { ...organization, lockDepartmentShared } as unknown as OrganizationReadApi,
      {
        assertNoLiveDuplicate: jest.fn(),
        workspaceFor: jest.fn(() => Promise.resolve(null)),
        responsibleOfDeclaration: jest.fn(() => Promise.resolve('it-1')),
        assert: jest.fn(),
        assertVendorAdmins: jest.fn(),
        requireItAdmin: jest.fn(),
      } as unknown as SubscriptionPoolService,
      audit,
      runner,
    );

    await service.declare(actor, {
      planId: 'plan-1',
      kind: 'TERM',
      purchasedQuantity: 5,
      billingCycle: 'ANNUAL',
      startDate: '2026-11-01',
      monthlyUnitPrice: { amount: '500000', currency: 'VND' },
    });

    expect(insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        commitmentTermMonths: 12,
        monthlyUnitPriceMinor: 500_000n,
        unitPrice: { amountMinor: 6_000_000n, currency: 'VND', recordedOn: '2026-11-25' },
      }),
    );
  });

  it('declares TERM with unitPrice 1.000.001 ANNUAL -> writes monthly 83.333 and derived unitPrice 999.996', async () => {
    const insert = jest.fn((_t: unknown, data: object) => Promise.resolve(stored({ ...data })));
    const priceService = {
      read: jest.fn((money: { amount: string; currency: string }) =>
        Promise.resolve({ amountMinor: BigInt(money.amount), currency: money.currency }),
      ),
      priceToday: jest.fn((_t: unknown, money: { amountMinor: bigint; currency: string } | null) =>
        Promise.resolve(
          money
            ? {
                unitPrice: { ...money, recordedOn: '2026-11-25' },
                priceSnapshot: {
                  rate: 10_000_000_000n,
                  rateDate: '2026-11-25',
                  rateSource: 'SAME_CURRENCY',
                  reportingMinor: money.amountMinor,
                  reportingCurrency: 'VND',
                  exchangeRateId: null,
                },
              }
            : { unitPrice: null, priceSnapshot: null },
        ),
      ),
    } as unknown as SubscriptionPricingService;
    const service = new SubscriptionService(
      { insert } as unknown as SubscriptionRepo,
      {
        lockExclusive: jest.fn(() => Promise.resolve({ ...plan, referenceCommitmentMonths: 1 })),
        lookups: jest.fn(() => Promise.resolve([{ ...plan, referenceCommitmentMonths: 1 }])),
      } as unknown as PlanFactsService,
      priceService,
      view,
      { ...organization, lockDepartmentShared } as unknown as OrganizationReadApi,
      {
        assertNoLiveDuplicate: jest.fn(),
        workspaceFor: jest.fn(() => Promise.resolve(null)),
        responsibleOfDeclaration: jest.fn(() => Promise.resolve('it-1')),
        assert: jest.fn(),
        assertVendorAdmins: jest.fn(),
        requireItAdmin: jest.fn(),
      } as unknown as SubscriptionPoolService,
      audit,
      runner,
    );

    await service.declare(actor, {
      planId: 'plan-1',
      kind: 'TERM',
      purchasedQuantity: 5,
      billingCycle: 'ANNUAL',
      commitmentTermMonths: 12,
      startDate: '2026-11-01',
      unitPrice: { amount: '1000001', currency: 'VND' },
    });

    expect(insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        monthlyUnitPriceMinor: 83_333n,
        unitPrice: { amountMinor: 999_996n, currency: 'VND', recordedOn: '2026-11-25' },
      }),
    );
  });
});
