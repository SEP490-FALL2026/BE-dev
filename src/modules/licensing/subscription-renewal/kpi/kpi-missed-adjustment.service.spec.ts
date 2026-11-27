import { addDays } from '../../../../core/business-date';
import type { SeatLedgerApi, SubscriptionLineRecord } from '../../../catalog/public/seat-ledger.api';
import type { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { SubscriptionPurchaseFacts } from '../../../catalog/public/subscription-period.types';
import type { AssignmentSeatMonthRepo } from '../../assignment/assignment-seat-month.repo';
import type { SeatOfMonth } from '../../public/licensing-seat-month.types';
import type { SubscriptionRenewalLinesService } from '../lines/subscription-renewal-lines.service';
import { KpiMissedAdjustmentService } from './kpi-missed-adjustment.service';

const line = (extra: Partial<SubscriptionLineRecord> = {}): SubscriptionLineRecord => ({
  id: 'line-std',
  organizationId: 'org-1',
  subscriptionId: 'sub-1',
  workspaceId: 'ws-1',
  planId: 'plan-std',
  monthlyUnitPriceMinor: 500_000n,
  minimumSeats: null,
  ledgerOpenedOn: '2027-07-01',
  renewedFromLineId: 'prior-std',
  closedOn: null,
  closedReason: null,
  createdAt: new Date('2027-07-01T00:00:00Z'),
  updatedAt: new Date('2027-07-01T00:00:00Z'),
  ...extra,
});

const period = (extra: Partial<SubscriptionPurchaseFacts> = {}): SubscriptionPurchaseFacts => ({
  subscriptionId: 'sub-1',
  planId: 'plan-std',
  responsibleItAdminEmployeeId: 'it-1',
  kind: 'TERM',
  status: 'ACTIVE',
  provisioningType: 'K2',
  commitmentTermMonths: 12,
  billingCycle: 'ANNUAL',
  purchasedQuantity: 12,
  monthlyPriceMinor: 500_000n,
  cycleMonths: 12,
  startDate: '2027-07-01',
  endDate: '2028-06-30',
  endExclusive: '2028-07-01',
  renewalDate: '2028-07-01',
  noticeDeadline: null,
  noticePeriodDays: 30,
  autoRenew: true,
  seatCounting: 'FIXED',
  vendorMinimumSeats: null,
  nextPeriodPurchasedQuantity: null,
  ...extra,
});

const held = (count: number, heldFrom: string, heldUntil: string | null = null): SeatOfMonth[] =>
  Array.from({ length: count }, (_, i) => ({
    assignmentId: `a-${heldFrom}-${i}`,
    subscriptionId: 'sub-1',
    planId: 'plan-std',
    employeeId: `emp-${i}`,
    kind: 'PERSONAL',
    owningDepartmentId: null,
    heldFrom,
    heldUntil,
    requestId: null,
  }));

describe('KpiMissedAdjustmentService', () => {
  const build = () => {
    const linesService = { targetsOfLines: jest.fn().mockResolvedValue([]) };
    const seatLedger = {
      linesOfSubscription: jest.fn().mockResolvedValue([]),
      seatsOnDays: jest.fn().mockResolvedValue(new Map()),
    };
    const periods = { getPurchaseFacts: jest.fn().mockResolvedValue([]) };
    const assignments = { seatsOfPlans: jest.fn().mockResolvedValue([]) };
    const service = new KpiMissedAdjustmentService(
      linesService as unknown as SubscriptionRenewalLinesService,
      seatLedger as unknown as SeatLedgerApi,
      periods as unknown as SubscriptionPeriodApi,
      assignments as unknown as AssignmentSeatMonthRepo,
    );

    return { service, linesService, seatLedger, periods, assignments };
  };

  it('computes W3-22 Ca B 2A (2.5 seat-months = 1.250.000) across Jul-Sep 2027', async () => {
    const { service, linesService, seatLedger, periods, assignments } = build();
    periods.getPurchaseFacts.mockResolvedValue([period()]);
    seatLedger.linesOfSubscription.mockResolvedValue([line()]);
    linesService.targetsOfLines.mockResolvedValue([
      { subscriptionLineId: 'prior-std', renewalOn: '2027-07-01', target: 11 },
    ]);

    const daily = new Map<string, number>();
    for (let d = '2027-07-01'; d < '2027-10-01'; d = addDays(d, 1)) daily.set(d, 12);
    seatLedger.seatsOnDays.mockResolvedValue(new Map([['line-std', daily]]));
    assignments.seatsOfPlans.mockResolvedValue([...held(11, '2027-07-01'), ...held(1, '2027-09-16')]);

    const result = await service.kpi4ForSubscription('sub-1', ['2027-07-01', '2027-08-01', '2027-09-01']);

    expect(result.totalSeatMonths).toBe(2.5);
    expect(result.totalAmountMinor).toBe(1_250_000n);
    expect(result.lines[0].missedSeats).toBe(1);
    expect(result.lines[0].months.map((m) => [m.month, m.seatMonths, m.amountMinor])).toEqual([
      ['2027-07-01', 1, 500_000n],
      ['2027-08-01', 1, 500_000n],
      ['2027-09-01', 0.5, 250_000n],
    ]);
  });

  it('returns 0 KPI-4 for MEMBERS subscriptions without querying ledger or targets', async () => {
    const { service, linesService, seatLedger, periods } = build();
    periods.getPurchaseFacts.mockResolvedValue([period({ seatCounting: 'MEMBERS' })]);

    const result = await service.kpi4ForSubscription('sub-1', ['2027-07-01']);

    expect(result).toEqual({ subscriptionId: 'sub-1', totalSeatMonths: 0, totalAmountMinor: 0n, lines: [] });
    expect(seatLedger.linesOfSubscription).not.toHaveBeenCalled();
    expect(linesService.targetsOfLines).not.toHaveBeenCalled();
  });

  it('F-13 Ca 2D: vendor-forced shortfall stored in prior target yields missedSeats = 0 and 0 KPI-4', async () => {
    const { service, linesService, seatLedger, periods, assignments } = build();
    periods.getPurchaseFacts.mockResolvedValue([period({ purchasedQuantity: 5 })]);
    seatLedger.linesOfSubscription.mockResolvedValue([line()]);
    linesService.targetsOfLines.mockResolvedValue([
      { subscriptionLineId: 'prior-std', renewalOn: '2027-07-01', target: 5 },
    ]);
    const daily = new Map<string, number>();
    for (let d = '2027-07-01'; d < '2027-08-01'; d = addDays(d, 1)) daily.set(d, 5);
    seatLedger.seatsOnDays.mockResolvedValue(new Map([['line-std', daily]]));
    assignments.seatsOfPlans.mockResolvedValue(held(4, '2027-07-01'));

    const result = await service.kpi4ForSubscription('sub-1', ['2027-07-01']);

    expect(result.lines[0].missedSeats).toBe(0);
    expect(result.totalSeatMonths).toBe(0);
    expect(result.totalAmountMinor).toBe(0n);
  });
});
