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

/** A subscription has no owning department (`QĐ-113g`): none is asked when a K1 one is declared, and no Cost Center when one is changed. */
describe('QĐ-113g: no owning department on a subscription', () => {
  const actor = { roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal;
  const tx = {};
  const runner = { run: (work: (t: unknown) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
  const plan = {
    id: 'plan-1',
    provisioningType: 'K1',
    applicationKind: 'SAAS',
    applicationStatus: 'ACTIVE',
    pricingModel: 'PER_SEAT',
  };
  const stored = (over: Partial<SubscriptionRecord> = {}) =>
    ({
      id: 'sub-1',
      planId: 'plan-1',
      planProvisioningType: 'K1',
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

  it('declares a K1 subscription: it has no department and none is looked at', async () => {
    const insert = jest.fn(() => Promise.resolve(stored({})));
    const service = new SubscriptionService(
      { insert } as unknown as SubscriptionRepo,
      { lockExclusive: jest.fn(() => Promise.resolve(plan)) } as unknown as PlanFactsService,
      pricing,
      view,
      { ...organization, lockDepartmentShared } as unknown as OrganizationReadApi,
      {
        assertNoLiveDuplicate: jest.fn(),
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

  it('changes a subscription so that it owes more without asking a Cost Center of any department', async () => {
    const update = jest.fn((_tx: unknown, _id: string, state: object) => Promise.resolve(stored({ ...state })));
    const guard = {
      requireOrganizationId: jest.fn(() => Promise.resolve('org-1')),
      requireResponsible: jest.fn(),
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

    await service.update(actor, 'sub-1', { purchasedQuantity: 50, autoRenew: true });

    expect(update).toHaveBeenCalledWith(
      tx,
      'sub-1',
      expect.objectContaining({ purchasedQuantity: 50, autoRenew: true }),
    );
  });
});
