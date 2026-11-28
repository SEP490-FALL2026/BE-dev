import { addDays } from '../../../core/business-date';
import type { SeatLedgerApi, SubscriptionLineRecord } from '../../catalog/public/seat-ledger.api';
import type { SubscriptionPurchaseFacts } from '../../catalog/public/subscription-period.types';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { LicenseLotCostService } from './license-lot-cost.service';
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

const lineRecord = (extra: Partial<SubscriptionLineRecord> = {}): SubscriptionLineRecord => ({
  id: 'line-1',
  organizationId: 'org-1',
  subscriptionId: 'sub-k2',
  workspaceId: 'ws-1',
  planId: 'plan-1',
  monthlyUnitPriceMinor: 500_000n,
  minimumSeats: null,
  ledgerOpenedOn: '2026-07-01',
  renewedFromLineId: null,
  closedOn: null,
  closedReason: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
  ...extra,
});

describe('SharedPoolLineFactsService — ledger & label (1) (W3-22 & B2-R7)', () => {
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
    const seatLedger = {
      seatsOnDays: jest.fn().mockResolvedValue(new Map()),
      nextLineQuantities: jest.fn().mockResolvedValue(new Map()),
    };
    const lotCosts = {
      poolTotalsInRange: jest
        .fn()
        .mockResolvedValue({ lotIdleNetMinor: 0n, deviceLotPurchasesMinor: 0n, replacementKeysMinor: 0n }),
    };
    const service = new SharedPoolLineFactsService(
      poolRepo as unknown as SharedPoolLineRepo,
      periods as unknown as SubscriptionPeriodApi,
      licensing as unknown as LicensingSeatMonthApi,
      organizationReads as unknown as OrganizationReadApi,
      seatLedger as unknown as SeatLedgerApi,
      lotCosts as unknown as LicenseLotCostService,
    );

    return { service, poolRepo, periods, licensing, organizationReads, seatLedger };
  };

  it('W3-22 KHO-22 & B2-R7: computes paid & idle from line ledger seatsOnDays and line price (kills 1.583.333)', async () => {
    const { service, periods, licensing, seatLedger } = build();
    const novSeats = Array.from({ length: 7 }, (_, i) => ({
      ...seat('sub-k2', '2026-11-01', null),
      assignmentId: `full-${i}`,
    }));
    novSeats.push(
      { ...seat('sub-k2', '2026-11-16', null), assignmentId: 'half-1' },
      { ...seat('sub-k2', '2026-11-21', null), assignmentId: 'lan' },
    );
    licensing.getSeatsOfMonth.mockResolvedValue(novSeats);
    periods.getPurchaseFacts.mockResolvedValue([
      fact({ subscriptionId: 'sub-k2', purchasedQuantity: 11, monthlyPriceMinor: null }),
    ]);
    periods.linesOfSubscriptions.mockResolvedValue(
      new Map([['sub-k2', [lineRecord({ id: 'line-std', monthlyUnitPriceMinor: 500_000n })]]]),
    );
    const daily = new Map<string, number>();
    for (let d = '2026-11-01'; d < '2026-12-01'; d = addDays(d, 1)) {
      daily.set(d, d < '2026-11-21' ? 10 : 11);
    }
    seatLedger.seatsOnDays.mockResolvedValue(new Map([['line-std', daily]]));

    const [line] = await service.linesOfMonth('2026-11-01', undefined, 100);

    expect(seatLedger.seatsOnDays).toHaveBeenCalledWith(['line-std'], '2026-11-01', '2026-11-30', undefined);
    expect(line.paidMinor).toBe(5_166_667n);
    expect(line.idleCostMinor).toBe(1_250_000n);
    expect(line.idleCostMinor).not.toBe(1_583_333n);
  });

  it('W3-22 label (1) & B2-R7 multi-line: reads prior locked target for FIXED line, skips for MEMBERS, and sums line prices', async () => {
    const { service, periods, licensing, seatLedger } = build();
    licensing.getSeatsOfMonth.mockResolvedValue([
      ...Array.from({ length: 11 }, (_, i) => ({
        ...seat('sub-fixed', '2027-07-01', null),
        planId: 'plan-std',
        assignmentId: `std-${i}`,
      })),
      ...Array.from({ length: 1 }, (_, i) => ({
        ...seat('sub-fixed', '2027-07-01', null),
        planId: 'plan-prm',
        assignmentId: `prm-${i}`,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        ...seat('sub-members', '2027-07-01', null),
        planId: 'plan-mem',
        assignmentId: `mem-${i}`,
      })),
    ]);
    periods.getPurchaseFacts.mockResolvedValue([
      fact({
        subscriptionId: 'sub-fixed',
        seatCounting: 'FIXED',
        purchasedQuantity: 14,
        monthlyPriceMinor: null,
        startDate: '2027-07-01',
        endDate: '2028-06-30',
        endExclusive: '2028-07-01',
        renewalDate: '2028-07-01',
      }),
      fact({
        subscriptionId: 'sub-members',
        seatCounting: 'MEMBERS',
        commitmentTermMonths: 1,
        billingCycle: 'MONTHLY',
        purchasedQuantity: 12,
        monthlyPriceMinor: 500_000n,
        startDate: '2027-07-01',
        endDate: '2027-07-31',
        endExclusive: '2027-08-01',
        renewalDate: '2027-08-01',
      }),
    ]);
    periods.linesOfSubscriptions.mockResolvedValue(
      new Map([
        [
          'sub-fixed',
          [
            lineRecord({
              id: 'line-std',
              subscriptionId: 'sub-fixed',
              planId: 'plan-std',
              monthlyUnitPriceMinor: 500_000n,
              renewedFromLineId: 'prior-std',
            }),
            lineRecord({
              id: 'line-prm',
              subscriptionId: 'sub-fixed',
              planId: 'plan-prm',
              monthlyUnitPriceMinor: 2_500_000n,
              renewedFromLineId: 'prior-prm',
            }),
          ],
        ],
        [
          'sub-members',
          [
            lineRecord({
              id: 'line-mem',
              subscriptionId: 'sub-members',
              planId: 'plan-mem',
              monthlyUnitPriceMinor: 500_000n,
              renewedFromLineId: 'prior-mem',
            }),
          ],
        ],
      ]),
    );
    const makeConst = (qty: number) => {
      const m = new Map<string, number>();
      for (let d = '2027-07-01'; d < '2027-08-01'; d = addDays(d, 1)) m.set(d, qty);

      return m;
    };
    seatLedger.seatsOnDays.mockResolvedValue(
      new Map([
        ['line-std', makeConst(12)],
        ['line-prm', makeConst(2)],
        ['line-mem', makeConst(12)],
      ]),
    );
    licensing.getPriorLineTargets.mockResolvedValue([
      { subscriptionLineId: 'prior-std', renewalOn: '2027-07-01', target: 11 },
      { subscriptionLineId: 'prior-prm', renewalOn: '2027-07-01', target: 2 },
      { subscriptionLineId: 'prior-mem', renewalOn: '2027-07-01', target: 10 },
    ]);

    const lines = await service.linesOfMonth('2027-07-01', undefined, 100);
    const fixed = lines.find((l) => l.subscriptionId === 'sub-fixed')!;
    const members = lines.find((l) => l.subscriptionId === 'sub-members')!;

    // Standard: 12 * 500k = 6M (1 idle -> missedAdjustment 500k); Premium: 2 * 2.5M = 5M (1 idle -> lockedUntil 2.5M)
    expect(fixed.paidMinor).toBe(11_000_000n);
    expect(fixed.idleCostMinor).toBe(3_000_000n);
    expect(fixed.idleCostByLabel.missedAdjustmentMinor).toBe(500_000n);
    expect(fixed.idleCostByLabel.lockedUntil).toEqual({ '2028-07-01': 2_500_000n });

    // MEMBERS never gets missedAdjustment
    expect(members.idleCostMinor).toBe(1_000_000n);
    expect(members.idleCostByLabel.missedAdjustmentMinor).toBe(0n);
    expect(licensing.getPriorLineTargets).toHaveBeenCalledWith(['prior-std', 'prior-prm'], undefined);
  });

  it('F-15 Q-F multi-line: resolves qNext per line via renewed_from_line_id (Standard 12->11 + Premium 2->2 gives 483_333 until 2027-07-01 + 483_334 until 2028-07-01)', async () => {
    const { service, periods, licensing, seatLedger } = build();
    const juneSeats = [
      ...Array.from({ length: 10 }, (_, i) => ({
        ...seat('sub-claude', '2026-07-01', null),
        planId: 'plan-std',
        assignmentId: `std-${i}`,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        ...seat('sub-claude', '2026-07-01', null),
        planId: 'plan-prm',
        assignmentId: `prm-${i}`,
      })),
    ];
    licensing.getSeatsOfMonth.mockResolvedValue(juneSeats);
    licensing.getNextPeriodQuantities.mockResolvedValue(new Map([['sub-claude', 13]]));
    periods.getPurchaseFacts.mockResolvedValue([
      fact({
        subscriptionId: 'sub-claude',
        purchasedQuantity: 14,
        monthlyPriceMinor: null,
        noticeDeadline: '2027-06-01',
        nextPeriodPurchasedQuantity: 13,
      }),
    ]);
    periods.linesOfSubscriptions.mockResolvedValue(
      new Map([
        [
          'sub-claude',
          [
            lineRecord({
              id: 'line-std',
              subscriptionId: 'sub-claude',
              planId: 'plan-std',
              monthlyUnitPriceMinor: 500_000n,
            }),
            lineRecord({
              id: 'line-prm',
              subscriptionId: 'sub-claude',
              planId: 'plan-prm',
              monthlyUnitPriceMinor: 2_500_000n,
            }),
          ],
        ],
      ]),
    );
    const makeConst = (qty: number) => {
      const m = new Map<string, number>();
      for (let d = '2027-06-01'; d < '2027-07-01'; d = addDays(d, 1)) m.set(d, qty);

      return m;
    };
    seatLedger.seatsOnDays.mockResolvedValue(
      new Map([
        ['line-std', makeConst(12)],
        ['line-prm', makeConst(2)],
      ]),
    );
    (seatLedger as { nextLineQuantities?: jest.Mock }).nextLineQuantities = jest.fn().mockResolvedValue(
      new Map([
        ['line-std', 11],
        ['line-prm', 2],
      ]),
    );

    const [detail] = await service.linesOfMonth('2027-06-01', undefined, 100);

    expect(detail.idleCostByLabel.reducibleMinor).toBe(33_333n);
    expect(detail.idleCostByLabel.lockedUntil).toEqual({
      '2027-07-01': 483_333n,
      '2028-07-01': 483_334n,
    });
  });
});
