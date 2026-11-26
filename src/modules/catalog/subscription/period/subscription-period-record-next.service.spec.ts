import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import type { PlanFactsService } from '../../plan/plan-facts.service';
import type { SubscriptionPeriodLinesService } from '../../subscription-line/subscription-period-lines.service';
import type { SubscriptionPoolService } from '../pool/subscription-pool.service';
import type { SubscriptionPricingService } from '../subscription-pricing.service';
import type { SubscriptionRepo } from '../subscription.repo';
import type { SubscriptionRecord } from '../subscription.types';
import { SubscriptionWindowsService } from '../subscription-windows.service';
import type { SubscriptionPeriodRepo } from './subscription-period.repo';
import { SubscriptionPeriodService } from './subscription-period.service';

const TODAY = '2026-11-17';

function prevRecord(): SubscriptionRecord {
  return {
    id: 'sub-1',
    planId: 'plan-1',
    planName: 'Team',
    planPricingModel: 'PER_SEAT',
    planProvisioningType: 'K2',
    planHasAdminConsole: false,
    applicationId: 'app-1',
    applicationName: 'Slack',
    applicationLogoUrl: null,
    applicationKind: 'SAAS',
    vendor: { id: 'vendor-1', name: 'Vendor' },
    kind: 'TERM',
    status: 'ACTIVE',
    purchasedQuantity: 14,
    unitPrice: { amountMinor: 500000n, currency: 'VND', recordedOn: '2026-01-01' },
    monthlyUnitPriceMinor: 500000n,
    priceSnapshot: null,
    originalPrice: null,
    billingCycle: 'ANNUAL',
    commitmentTermMonths: 12,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    renewalDate: '2027-01-01',
    noticeDeadline: '2026-12-01',
    noticePeriodDays: null,
    autoRenew: true,
    allowsMidTermReduction: false,
    responsibleItAdminEmployeeId: 'emp-1',
    vendorMinimumSeats: 5,
    isPrimaryForPlan: false,
    renewedFromId: null,
    workspace: { id: 'ws-1', name: 'Slack WS' },
    seatCounting: 'FIXED',
    minimumSeatsTotal: 14,
    invoicedLater: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

describe('SubscriptionPeriodService.recordNext multi-line ACTIVE pricing', () => {
  it('populates non-null unitPrice and priceSnapshot when continuing a multi-line ACTIVE period so subscriptions_active_complete holds', async () => {
    const subscriptions = {
      findMany: jest.fn(),
      find: jest.fn().mockResolvedValue(prevRecord()),
      lock: jest.fn(),
      successorsOf: jest.fn().mockResolvedValue(new Map()),
      insert: jest.fn((_tx: DbTx, created: Partial<SubscriptionRecord>) =>
        Promise.resolve({ ...prevRecord(), ...created, id: 'sub-2' }),
      ),
    };
    const plans = {
      lockShared: jest.fn().mockResolvedValue({
        applicationKind: 'SAAS',
        provisioningType: 'K2',
        applicationStatus: 'ACTIVE',
      }),
    };
    const pricing = {
      read: jest.fn(),
      priceToday: jest.fn(),
      businessToday: jest.fn().mockResolvedValue(TODAY),
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    };
    const audit = { record: jest.fn() };
    const pool = { releasePrimary: jest.fn() };
    const parameters = { getValuesAt: jest.fn().mockResolvedValue([30]) };
    const oldLines = [
      {
        id: 'line-std',
        subscriptionId: 'sub-1',
        workspaceId: 'ws-1',
        planId: 'plan-1',
        monthlyUnitPriceMinor: 500000n,
        minimumSeats: 5,
        closedReason: null,
      },
      {
        id: 'line-prm',
        subscriptionId: 'sub-1',
        workspaceId: 'ws-1',
        planId: 'plan-2',
        monthlyUnitPriceMinor: 2500000n,
        minimumSeats: null,
        closedReason: null,
      },
    ];
    const periodLines = {
      linesOf: jest.fn().mockResolvedValue(oldLines),
      closeLines: jest.fn(),
      createRenewedLines: jest.fn(),
    };
    const service = new SubscriptionPeriodService(
      subscriptions as unknown as SubscriptionRepo,
      {} as SubscriptionPeriodRepo,
      plans as unknown as PlanFactsService,
      pricing as unknown as SubscriptionPricingService,
      audit as unknown as AuditApi,
      pool as unknown as SubscriptionPoolService,
      new SubscriptionWindowsService(parameters as unknown as OperatingParametersApi),
      periodLines as unknown as SubscriptionPeriodLinesService,
    );

    await service.recordNext(
      {} as DbTx,
      { systemCorrelationId: 'auto-sub-2' },
      {
        previousSubscriptionId: 'sub-1',
        purchasedQuantity: 14,
        billingCycle: 'ANNUAL',
        startDate: '2027-01-01',
        renewalDate: '2028-01-01',
        noticeDeadline: '2027-12-01',
        autoRenew: true,
        allowsMidTermReduction: false,
        renewalId: 'ren-2',
        autoRecorded: true,
        lines: [
          { previousLineId: 'line-std', quantity: 12 },
          { previousLineId: 'line-prm', quantity: 2 },
        ],
      },
    );

    const inserted = (subscriptions.insert.mock.calls as unknown[][])[0][1] as {
      status?: string;
      unitPrice?: { amountMinor: bigint; currency: string } | null;
      priceSnapshot?: { reportingMinor: bigint; rate: bigint } | null;
      monthlyUnitPriceMinor?: bigint | null;
    };
    expect(inserted).toMatchObject({
      status: 'ACTIVE',
      unitPrice: { amountMinor: 500000n, currency: 'VND' },
      priceSnapshot: { reportingMinor: 500000n, rate: 1n },
      monthlyUnitPriceMinor: 500000n,
    });
  });
});
