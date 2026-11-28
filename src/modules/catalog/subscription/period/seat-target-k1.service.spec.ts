import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { LicenseLotRepo } from '../../license-lot/license-lot.repo';
import type { PlanFactsService } from '../../plan/plan-facts.service';
import type { SubscriptionLineRepo } from '../../subscription-line/subscription-line.repo';
import type { SubscriptionLineSeatsService } from '../../subscription-line/subscription-line-seats.service';
import { SeatTargetService } from '../seat-target.service';
import type { SubscriptionRepo } from '../subscription.repo';
import type { SubscriptionRecord } from '../subscription.types';

describe('SeatTargetService (P13a W3-17 K1 without subscription)', () => {
  const tx = {} as DbTx;

  const k1Sub = (closedAt: Date | null): SubscriptionRecord =>
    ({
      id: 'sub-closed-k1',
      planId: 'plan-1',
      planProvisioningType: 'K1',
      kind: 'TERM',
      status: 'ACTIVE',
      purchasedQuantity: 5,
      unitPrice: null,
      priceSnapshot: null,
      originalPrice: null,
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 12,
      startDate: '2026-01-01',
      endDate: null,
      renewalDate: null,
      noticeDeadline: null,
      noticePeriodDays: null,
      autoRenew: false,
      allowsMidTermReduction: false,
      responsibleItAdminEmployeeId: null,
      vendorMinimumSeats: null,
      isPrimaryForPlan: true,
      closedAt,
      updatedAt: new Date('2026-11-18T00:00:00Z'),
    }) as unknown as SubscriptionRecord;

  const k1Plan = {
    id: 'plan-1',
    name: 'K1 Annual Plan',
    provisioningType: 'K1' as const,
    keyBinding: null,
    pricingModel: 'PER_SEAT' as const,
    sharingPolicy: 'NOT_ALLOWED' as const,
    hasAdminConsole: false,
    referencePriceMinor: 450_000n,
    referenceCommitmentMonths: 12 as const,
    applicationId: 'app-1',
    applicationName: 'App 1',
    applicationKind: 'SAAS' as const,
    applicationStatus: 'APPROVED' as const,
  };

  it('locks plan FOR SHARE and returns subscriptionId = null, monthlyUnitPriceMinor, and referenceCommitmentMonths', async () => {
    const subLock = jest.fn().mockResolvedValue(k1Sub(new Date('2026-12-01')));
    const lockShared = jest.fn().mockResolvedValue(k1Plan);
    const service = new SeatTargetService(
      { lock: subLock, find: jest.fn() } as unknown as SubscriptionRepo,
      { lockShared, find: jest.fn().mockResolvedValue(k1Plan) } as unknown as PlanFactsService,
      { lockByPeriodAndPlan: jest.fn(), findOfPlan: jest.fn() } as unknown as SubscriptionLineRepo,
      { seatsOn: jest.fn() } as unknown as SubscriptionLineSeatsService,
      { businessToday: jest.fn() } as unknown as OrganizationReadApi,
      { find: jest.fn().mockResolvedValue(null), lock: jest.fn().mockResolvedValue(null) } as unknown as LicenseLotRepo,
    );

    const byPlan = await service.lock(tx, { planId: 'plan-1' });
    expect(subLock).not.toHaveBeenCalled();
    expect(lockShared).toHaveBeenCalledWith(tx, 'plan-1');
    expect(byPlan).toMatchObject({
      kind: 'PLAN',
      subscriptionId: null,
      provisioningType: 'K1',
      monthlyUnitPriceMinor: 450_000n,
      referenceCommitmentMonths: 12,
    });

    const viaOldSub = await service.lock(tx, { subscriptionId: 'sub-closed-k1' });
    expect(viaOldSub).toMatchObject({
      kind: 'PLAN',
      subscriptionId: null,
      provisioningType: 'K1',
      monthlyUnitPriceMinor: 450_000n,
      referenceCommitmentMonths: 12,
    });
  });
});
