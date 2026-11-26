import type { SubscriptionPurchaseFacts } from '../../catalog/public/subscription-period.types';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SharedPoolLineFactsService } from './shared-pool-line-facts.service';
import type { SharedPoolLineRepo } from './shared-pool-line.repo';

const fact = (extra: Partial<SubscriptionPurchaseFacts> = {}): SubscriptionPurchaseFacts => ({
  subscriptionId: 'sub-k2',
  planId: 'plan-1',
  responsibleItAdminEmployeeId: 'it-1',
  kind: 'TERM',
  status: 'ACTIVE',
  provisioningType: 'K2',
  commitmentTermMonths: 12,
  billingCycle: 'ANNUAL',
  purchasedQuantity: 10,
  monthlyPriceMinor: 500_000n,
  cycleMonths: 12,
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  endExclusive: '2027-07-01',
  renewalDate: '2027-07-01',
  noticeDeadline: null,
  noticePeriodDays: 30,
  autoRenew: true,
  vendorMinimumSeats: null,
  nextPeriodPurchasedQuantity: null,
  ...extra,
});

const seat = (subscriptionId: string, heldFrom = '2026-11-01', heldUntil: string | null = null): SeatOfMonth => ({
  assignmentId: 'a-1',
  subscriptionId,
  planId: 'plan-1',
  employeeId: 'emp-1',
  kind: 'PERSONAL',
  owningDepartmentId: null,
  heldFrom,
  heldUntil,
  requestId: null,
});

describe('SharedPoolLineFactsService', () => {
  const build = () => {
    const poolRepo = {
      invoiceVariancesBySubscriptionMonth: jest.fn().mockResolvedValue([]),
      invoiceVariancesTotals: jest.fn().mockResolvedValue({ varianceMinor: 0n, varianceInReviewMinor: 0n }),
      seatMonthTotalsBySubscriptionMonth: jest.fn().mockResolvedValue([]),
      monthlyFigures: jest.fn().mockResolvedValue([]),
    };
    const periods = {
      getPurchaseFacts: jest.fn().mockResolvedValue([]),
      adjustmentWindowsOf: jest.fn().mockResolvedValue(new Map()),
      linesOfSubscriptions: jest.fn().mockResolvedValue(new Map()),
    };
    const licensing = {
      getSeatsOfMonth: jest.fn().mockResolvedValue([]),
      getNextPeriodQuantities: jest.fn().mockResolvedValue(new Map()),
      getPriorLineTargets: jest.fn().mockResolvedValue([]),
    };
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      businessToday: jest.fn().mockResolvedValue('2026-12-05'),
    };
    const service = new SharedPoolLineFactsService(
      poolRepo as unknown as SharedPoolLineRepo,
      periods as unknown as SubscriptionPeriodApi,
      licensing as unknown as LicensingSeatMonthApi,
      organizationReads as unknown as OrganizationReadApi,
    );

    return { service, poolRepo, periods, licensing, organizationReads };
  };

  it('filters month periods to active K2 TERM with seats or charges and omits DRAFT or non-K2', async () => {
    const { service, periods, licensing, poolRepo } = build();
    licensing.getSeatsOfMonth.mockResolvedValue([seat('sub-k2'), seat('sub-draft'), seat('sub-k1')]);
    poolRepo.seatMonthTotalsBySubscriptionMonth.mockResolvedValue([
      { subscriptionId: 'sub-k2', month: '2026-11-01', amountMinor: 500_000n, appliedMinor: 0n },
    ]);
    periods.getPurchaseFacts.mockResolvedValue([
      fact({ subscriptionId: 'sub-k2' }),
      fact({ subscriptionId: 'sub-draft', status: 'DRAFT' }),
      fact({ subscriptionId: 'sub-k1', provisioningType: 'K1' }),
      fact({ subscriptionId: 'sub-empty-k2' }),
    ]);
    periods.adjustmentWindowsOf.mockResolvedValue(
      new Map([['sub-k2', { monthlyDays: 7, annualDays: 30, redAlertDaysAnnual: 30 }]]),
    );
    poolRepo.monthlyFigures.mockResolvedValue([
      {
        subscriptionId: 'sub-k2',
        month: '2026-11-01',
        invoicedMinor: 0n,
        allocatedMinor: 500_000n,
        withoutCostCenterMinor: 0n,
      },
    ]);

    const lines = await service.linesOfMonth('2026-11-01', undefined, 100);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      subscriptionId: 'sub-k2',
      paidMinor: 5_000_000n,
      idleCostMinor: 4_500_000n,
      unallocatedMinor: 4_500_000n,
      flags: [],
    });
  });

  it('adds per-subscription invoice variances and surfaces NO_PRICE flag cleanly', async () => {
    const { service, periods, licensing, poolRepo } = build();
    licensing.getSeatsOfMonth.mockResolvedValue([seat('sub-no-price')]);
    periods.getPurchaseFacts.mockResolvedValue([fact({ subscriptionId: 'sub-no-price', monthlyPriceMinor: null })]);
    poolRepo.invoiceVariancesBySubscriptionMonth.mockResolvedValue([
      { subscriptionId: 'sub-no-price', varianceMinor: 200_000n, varianceInReviewMinor: 50_000n },
    ]);
    poolRepo.monthlyFigures.mockResolvedValue([
      {
        subscriptionId: 'sub-no-price',
        month: '2026-11-01',
        invoicedMinor: 1_000_000n,
        allocatedMinor: 300_000n,
        withoutCostCenterMinor: 0n,
      },
    ]);

    const [line] = await service.linesOfMonth('2026-11-01', undefined, 100);

    expect(line.idleCostMinor).toBeNull();
    expect(line.paidMinor).toBeNull();
    expect(line.flags).toEqual(['NO_PRICE']);
    expect(line.invoiceVarianceMinor).toBe(200_000n);
    expect(line.invoiceVarianceInReviewMinor).toBe(50_000n);
    expect(line.unallocatedMinor).toBe(250_000n);
  });

  it('FIX-B1 F4 (B-I1): missing price with 10M confirmed invoice yields 10M year total (not 20M) and matches monthly line', async () => {
    const { service, periods, licensing, poolRepo, organizationReads } = build();
    organizationReads.businessToday.mockResolvedValue('2026-12-05');
    licensing.getSeatsOfMonth.mockImplementation((month: string) =>
      Promise.resolve(month === '2026-11-01' ? [seat('sub-no-price')] : []),
    );
    periods.getPurchaseFacts.mockResolvedValue([fact({ subscriptionId: 'sub-no-price', monthlyPriceMinor: null })]);
    poolRepo.invoiceVariancesBySubscriptionMonth.mockImplementation((_orgId: string, month: string) =>
      Promise.resolve(
        month === '2026-11-01'
          ? [{ subscriptionId: 'sub-no-price', varianceMinor: 10_000_000n, varianceInReviewMinor: 0n }]
          : [],
      ),
    );
    poolRepo.invoiceVariancesTotals.mockResolvedValue({ varianceMinor: 10_000_000n, varianceInReviewMinor: 0n });
    poolRepo.monthlyFigures.mockResolvedValue([
      {
        subscriptionId: 'sub-no-price',
        month: '2026-11-01',
        invoicedMinor: 10_000_000n,
        allocatedMinor: 0n,
        withoutCostCenterMinor: 0n,
      },
    ]);

    const [novLine] = await service.linesOfMonth('2026-11-01', undefined, 100);
    const yearTotals = await service.yearFigures(2026, 11);
    const onlyTotals = await service.yearFigures(2026, 11, 'sub-no-price');

    expect(novLine.flags).toEqual(['NO_PRICE']);
    expect(novLine.idleCostMinor).toBeNull();
    expect(novLine.unallocatedMinor).toBe(10_000_000n);
    expect(yearTotals.idleCostMinor).toBe(0n);
    expect(yearTotals.unallocatedMinor).toBe(10_000_000n);
    expect(onlyTotals.unallocatedMinor).toBe(novLine.unallocatedMinor);
  });

  it('FIX-B1 F5 (B-I3): includes variance-only subscription in June poolLines when renewal starts 01/07 and matches year total (and only branch)', async () => {
    const { service, periods, licensing, poolRepo, organizationReads } = build();
    organizationReads.businessToday.mockResolvedValue('2027-07-05');
    licensing.getSeatsOfMonth.mockResolvedValue([]);
    poolRepo.seatMonthTotalsBySubscriptionMonth.mockResolvedValue([]);
    poolRepo.invoiceVariancesBySubscriptionMonth.mockImplementation((_orgId: string, month: string) =>
      Promise.resolve(
        month === '2027-06-01'
          ? [{ subscriptionId: 'sub-renewal-july', varianceMinor: 2_000_000n, varianceInReviewMinor: 0n }]
          : [],
      ),
    );
    poolRepo.invoiceVariancesTotals.mockResolvedValue({ varianceMinor: 2_000_000n, varianceInReviewMinor: 0n });
    periods.getPurchaseFacts.mockResolvedValue([
      fact({
        subscriptionId: 'sub-renewal-july',
        startDate: '2027-07-01',
        endDate: '2028-06-30',
        endExclusive: '2028-07-01',
      }),
    ]);

    const juneLines = await service.linesOfMonth('2027-06-01', undefined, 100);
    const yearTotals = await service.yearFigures(2027, 6);
    const onlyTotals = await service.yearFigures(2027, 6, 'sub-renewal-july');

    expect(juneLines).toHaveLength(1);
    expect(juneLines[0]).toMatchObject({
      subscriptionId: 'sub-renewal-july',
      paidMinor: 0n,
      idleCostMinor: 0n,
      invoiceVarianceMinor: 2_000_000n,
      unallocatedMinor: 2_000_000n,
    });
    const sumOfLines = juneLines.reduce((acc, item) => acc + item.unallocatedMinor, 0n);
    expect(sumOfLines).toBe(yearTotals.unallocatedMinor);
    expect(onlyTotals).toEqual(yearTotals);
  });

  it('aggregates year sub-lines through ended months including org-wide invoice variances', async () => {
    const { service, periods, licensing, poolRepo, organizationReads } = build();
    organizationReads.businessToday.mockResolvedValue('2026-12-05');
    licensing.getSeatsOfMonth.mockResolvedValue([]);
    poolRepo.invoiceVariancesTotals.mockResolvedValue({
      varianceMinor: 3_500_000n,
      varianceInReviewMinor: 500_000n,
    });
    const spy = jest.spyOn(service, 'linesOfMonth').mockImplementation((month) =>
      Promise.resolve(
        month === '2026-11-01'
          ? [
              {
                subscriptionId: 'sub-k2',
                responsibleItAdminEmployeeId: 'it-1',
                paidMinor: 5_000_000n,
                invoicedMinor: 0n,
                allocatedMinor: 0n,
                withoutCostCenterMinor: 0n,
                idleCostMinor: 8_100_000n,
                idleCostByLabel: { missedAdjustmentMinor: 0n, reducibleMinor: 0n, lockedUntil: {} },
                invoiceVarianceMinor: 0n,
                invoiceVarianceInReviewMinor: 0n,
                deviceLotPurchasesMinor: 0n,
                replacementKeysMinor: 0n,
                unallocatedMinor: 8_100_000n,
                flags: [],
                ratioPercent: '0.00',
                exceedsIdleRatioThreshold: false,
              },
            ]
          : [],
      ),
    );

    const figures = await service.yearFigures(2026, 11);
    spy.mockRestore();
    void periods;

    expect(figures).toEqual({
      idleCostMinor: 8_100_000n,
      invoiceVarianceMinor: 3_500_000n,
      invoiceVarianceInReviewMinor: 500_000n,
      deviceLotPurchasesMinor: 0n,
      replacementKeysMinor: 0n,
      unallocatedMinor: 12_100_000n,
    });
  });
});
