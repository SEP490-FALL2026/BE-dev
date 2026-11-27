import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PlanUsageRepo } from './plan-usage.repo';

describe('PlanUsageRepo (W3-22 KPI-3 & B2-R7)', () => {
  it('reads KPI-3 denominator from seats(L, period end) on opened lines, unopened fallback, and legacy subscriptions without lines', async () => {
    const prisma = {
      planUsageRate: {
        findMany: jest.fn().mockResolvedValue([
          { planId: 'plan-ledger', activeSeats: 9 },
          { planId: 'plan-unopened', activeSeats: 4 },
          { planId: 'plan-legacy', activeSeats: 3 },
        ]),
      },
      subscriptionLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'line-1',
            planId: 'plan-ledger',
            ledgerOpenedOn: new Date('2026-11-01T00:00:00Z'),
            closedOn: null,
            subscription: {
              purchasedQuantity: 10,
              endDate: new Date('2027-06-30T00:00:00Z'),
              renewalDate: new Date('2027-07-01T00:00:00Z'),
            },
          },
          {
            id: 'line-2',
            planId: 'plan-unopened',
            ledgerOpenedOn: null,
            closedOn: null,
            subscription: {
              purchasedQuantity: 8,
              endDate: new Date('2027-06-30T00:00:00Z'),
              renewalDate: null,
            },
          },
        ]),
      },
      seatChange: {
        findMany: jest.fn().mockResolvedValue([
          { subscriptionLineId: 'line-1', effectiveOn: new Date('2026-11-01T00:00:00Z'), delta: 10 },
          { subscriptionLineId: 'line-1', effectiveOn: new Date('2027-01-15T00:00:00Z'), delta: 2 },
          // After endDate (excluded from period-end seats)
          { subscriptionLineId: 'line-1', effectiveOn: new Date('2027-07-01T00:00:00Z'), delta: 5 },
        ]),
      },
      subscription: {
        groupBy: jest.fn<Promise<unknown>, [{ where: { lines: unknown } }]>(() =>
          Promise.resolve([{ planId: 'plan-legacy', _sum: { purchasedQuantity: 5 } }]),
        ),
      },
    };

    const repo = new PlanUsageRepo(prisma as unknown as PrismaService);
    const result = await repo.activeAndPurchased(['plan-ledger', 'plan-unopened', 'plan-legacy']);

    expect(result).toEqual([
      { planId: 'plan-ledger', activeSeats: 9, purchasedSeats: 12 },
      { planId: 'plan-unopened', activeSeats: 4, purchasedSeats: 8 },
      { planId: 'plan-legacy', activeSeats: 3, purchasedSeats: 5 },
    ]);
    const [[groupArgs]] = prisma.subscription.groupBy.mock.calls;
    expect(groupArgs.where.lines).toEqual({ none: {} });
  });
});
