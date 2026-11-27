import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { PlanFactsService } from '../../plan/plan-facts.service';
import type { SubscriptionLineRepo } from '../../subscription-line/subscription-line.repo';
import type { SubscriptionLineSeatsService } from '../../subscription-line/subscription-line-seats.service';
import type { SubscriptionLineRecord } from '../../subscription-line/subscription-line.types';
import type { LicenseLotRepo } from '../../license-lot/license-lot.repo';
import { SeatTargetService } from '../seat-target.service';
import type { SubscriptionRepo } from '../subscription.repo';
import type { SubscriptionRecord } from '../subscription.types';

const seatTargetPlan = (provisioningType: 'K1' | 'K2' | 'K4' | 'K5' = 'K2') => ({
  id: 'plan-1',
  name: 'Standard',
  applicationId: 'app-1',
  applicationName: 'Claude',
  applicationKind: 'SAAS' as const,
  provisioningType,
  keyBinding: provisioningType === 'K4' ? ('ACCOUNT' as const) : null,
  referenceCommitmentMonths: 12 as const,
  applicationStatus: 'APPROVED' as const,
  pricingModel: 'PER_SEAT' as const,
  applicationVendorId: 'vendor-1',
});

const seatTargetSub = (provisioningType: 'K1' | 'K2' | 'K4' = 'K2'): SubscriptionRecord =>
  ({
    id: 'sub-1',
    planId: 'plan-1',
    planProvisioningType: provisioningType,
    kind: provisioningType === 'K4' ? 'PERPETUAL' : 'TERM',
    status: 'ACTIVE',
    purchasedQuantity: 10,
    billingCycle: provisioningType === 'K4' ? null : 'ANNUAL',
    startDate: '2026-07-01',
    endDate: provisioningType === 'K4' ? null : '2027-06-30',
    unitPrice: { amountMinor: 6_000_000n, currency: 'VND', recordedOn: '2026-07-01' },
    priceSnapshot: { reportingMinor: 6_000_000n, reportingCurrency: 'VND' },
    allowsMidTermReduction: false,
  }) as unknown as SubscriptionRecord;

const seatTargetLine = (overrides: Partial<SubscriptionLineRecord> = {}): SubscriptionLineRecord => ({
  id: 'line-1',
  organizationId: 'org-1',
  subscriptionId: 'sub-1',
  workspaceId: 'ws-1',
  planId: 'plan-1',
  monthlyUnitPriceMinor: 500_000n,
  minimumSeats: null,
  ledgerOpenedOn: '2026-07-01',
  renewedFromLineId: null,
  closedOn: null,
  closedReason: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  ...overrides,
});

describe('SeatTargetService (K2 lines and lock order)', () => {
  const tx = { kind: 'tx' } as unknown as DbTx;

  it('lock for K2 acquires period (6) -> line (6c) -> plan (7), includes RENEWED line if closedOn >= servingOn, and reads seats from ledger', async () => {
    const order: string[] = [];
    const service = new SeatTargetService(
      {
        lock: jest.fn().mockImplementation(() => {
          order.push('lockPeriod');
          return Promise.resolve(seatTargetSub('K2'));
        }),
      } as unknown as SubscriptionRepo,
      {
        lockShared: jest.fn().mockImplementation(() => {
          order.push('lockPlan');
          return Promise.resolve(seatTargetPlan('K2'));
        }),
      } as unknown as PlanFactsService,
      {
        lockByPeriodAndPlan: jest.fn().mockImplementation(() => {
          order.push('lockLine');
          return Promise.resolve(seatTargetLine({ closedOn: '2027-06-30', closedReason: 'RENEWED' }));
        }),
      } as unknown as SubscriptionLineRepo,
      { seatsOn: jest.fn().mockResolvedValue(12) } as unknown as SubscriptionLineSeatsService,
      { businessToday: jest.fn().mockResolvedValue('2027-06-20') } as unknown as OrganizationReadApi,
      { find: jest.fn().mockResolvedValue(null), lock: jest.fn().mockResolvedValue(null) } as unknown as LicenseLotRepo,
    );

    const target = await service.lock(tx, { subscriptionId: 'sub-1', planId: 'plan-1', servingOn: '2027-06-20' });

    expect(order).toEqual(['lockPeriod', 'lockLine', 'lockPlan']);
    expect(target).toMatchObject({
      kind: 'SUBSCRIPTION',
      subscriptionId: 'sub-1',
      subscriptionLineId: 'line-1',
      purchasedQuantity: 12,
    });
  });

  it('find returns subscriptionLineId = null when line closed before servingOn', async () => {
    const service = new SeatTargetService(
      { find: jest.fn().mockResolvedValue(seatTargetSub('K2')) } as unknown as SubscriptionRepo,
      { find: jest.fn().mockResolvedValue(seatTargetPlan('K2')) } as unknown as PlanFactsService,
      {
        findOfPlan: jest.fn().mockResolvedValue(seatTargetLine({ closedOn: '2027-06-30', closedReason: 'RENEWED' })),
      } as unknown as SubscriptionLineRepo,
      { seatsOn: jest.fn().mockResolvedValue(12) } as unknown as SubscriptionLineSeatsService,
      { businessToday: jest.fn().mockResolvedValue('2027-07-01') } as unknown as OrganizationReadApi,
      { find: jest.fn().mockResolvedValue(null), lock: jest.fn().mockResolvedValue(null) } as unknown as LicenseLotRepo,
    );

    const target = await service.find({ subscriptionId: 'sub-1', planId: 'plan-1', servingOn: '2027-07-01' });
    expect(target?.subscriptionLineId).toBeNull();
  });

  it('lock for K4 skips line queries and keeps subscriptionLineId null', async () => {
    const lockByPeriodAndPlan = jest.fn();
    const service = new SeatTargetService(
      { lock: jest.fn().mockResolvedValue(seatTargetSub('K4')) } as unknown as SubscriptionRepo,
      { lockShared: jest.fn().mockResolvedValue(seatTargetPlan('K4')) } as unknown as PlanFactsService,
      { lockByPeriodAndPlan } as unknown as SubscriptionLineRepo,
      { seatsOn: jest.fn() } as unknown as SubscriptionLineSeatsService,
      { businessToday: jest.fn() } as unknown as OrganizationReadApi,
      { find: jest.fn().mockResolvedValue(null), lock: jest.fn().mockResolvedValue(null) } as unknown as LicenseLotRepo,
    );

    const target = await service.lock(tx, { subscriptionId: 'sub-1' });
    expect(lockByPeriodAndPlan).not.toHaveBeenCalled();
    expect(target?.subscriptionLineId).toBeNull();
  });
});
