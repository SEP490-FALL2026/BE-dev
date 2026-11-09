import type { BudgetFactsService } from '../budget/budget-facts.service';
import type { ReferenceFigures } from '../budget/version.repo';
import { BudgetTableViewService } from './budget-table-view.service';
import type { BudgetViewRepo } from './budget-view.repo';
import type { BudgetViewNumbersService } from './budget-view-numbers.service';

const CC_A = 'cc-a';
const CC_B = 'cc-b';
const CC_C = 'cc-c';

const figures = (costCenterId: string, currency: string, base: bigint, reserve: bigint): ReferenceFigures => ({
  costCenterId,
  year: 2027,
  currency,
  baseMinor: base,
  reserveMinor: reserve,
  totalMinor: base + reserve,
});

function serviceOver(
  versions: ReferenceFigures[],
  held: Map<string, { held: bigint; spent: bigint }>,
  lastInvoice: Date | null = null,
) {
  return new BudgetTableViewService(
    {
      rows: jest.fn().mockResolvedValue(versions.map((row) => ({ ...row, versionId: 'version', number: 1 }))),
    } as unknown as BudgetViewRepo,
    {
      totals: jest.fn().mockResolvedValue(
        new Map(
          versions.map((row) => {
            const key = `${row.costCenterId}:${row.year}`;
            return [
              key,
              {
                committed: held.get(key)?.held ?? 0n,
                spent: held.get(key)?.spent ?? 0n,
                pendingSpend: 0n,
                priorPeriodAdjustment: 0n,
              },
            ];
          }),
        ),
      ),
      cycle: jest.fn().mockResolvedValue(null),
      lastInvoice: jest.fn().mockResolvedValue(lastInvoice?.toISOString() ?? null),
    } as unknown as BudgetViewNumbersService,
    {
      formatter: (currency: string) => Promise.resolve((minor: bigint) => ({ amount: minor.toString(), currency })),
    } as unknown as BudgetFactsService,
  );
}

describe('BR-MF4-05 BudgetTableViewService.summary', () => {
  it('adds the Cost Centers of one currency and counts the ones over budget', async () => {
    const service = serviceOver(
      [figures(CC_A, 'VND', 900n, 100n), figures(CC_B, 'VND', 450n, 50n)],
      new Map([
        [`${CC_A}:2027`, { held: 300n, spent: 200n }],
        [`${CC_B}:2027`, { held: 400n, spent: 150n }],
      ]),
    );

    const { totals, year, lastInvoiceRecordedAt } = await service.summary(2027);

    expect(year).toBe(2027);
    expect(lastInvoiceRecordedAt).toBeNull();
    expect(Object.keys(totals)).toEqual(['VND']);
    expect(totals.VND).toEqual({
      currency: 'VND',
      base: { amount: '1350', currency: 'VND' },
      reserve: { amount: '150', currency: 'VND' },
      total: { amount: '1500', currency: 'VND' },
      committed: { amount: '700', currency: 'VND' },
      spent: { amount: '350', currency: 'VND' },
      remaining: { amount: '450', currency: 'VND' },
      pendingSpend: { amount: '0', currency: 'VND' },
      remainingBase: { amount: '300', currency: 'VND' },
      remainingWithReserve: { amount: '450', currency: 'VND' },
      costCenterCount: 2,
      // A: 1000 - 300 - 200 = 500; B: 500 - 400 - 150 = -50.
      overBudgetCount: 1,
    });
  });

  it('keeps the currencies apart and never adds them together', async () => {
    const service = serviceOver(
      [figures(CC_A, 'VND', 1000n, 0n), figures(CC_B, 'USD', 10n, 0n)],
      new Map([[`${CC_B}:2027`, { held: 4n, spent: 0n }]]),
    );

    const { totals } = await service.summary(2027);

    expect(Object.keys(totals).sort()).toEqual(['USD', 'VND']);
    expect(totals.VND.total.amount).toBe('1000');
    expect(totals.USD.total.amount).toBe('10');
    expect(totals.USD.remaining.amount).toBe('6');
  });

  it('counts a Cost Center that has nothing held as having its whole budget left', async () => {
    const service = serviceOver([figures(CC_C, 'VND', 100n, 0n)], new Map());

    const { totals } = await service.summary(2027);

    expect(totals.VND.remaining.amount).toBe('100');
    expect(totals.VND.overBudgetCount).toBe(0);
  });

  it('does not call a Cost Center over budget when exactly nothing is left', async () => {
    const service = serviceOver(
      [figures(CC_A, 'VND', 100n, 0n)],
      new Map([[`${CC_A}:2027`, { held: 60n, spent: 40n }]]),
    );

    const { totals } = await service.summary(2027);

    expect(totals.VND.remaining.amount).toBe('0');
    expect(totals.VND.overBudgetCount).toBe(0);
  });

  it('says when the last invoice of the year was recorded, which is when the spent figure was last brought up to date', async () => {
    const service = serviceOver([figures(CC_A, 'VND', 100n, 0n)], new Map(), new Date('2027-03-05T04:05:06.000Z'));

    const { lastInvoiceRecordedAt } = await service.summary(2027);

    expect(lastInvoiceRecordedAt).toBe('2027-03-05T04:05:06.000Z');
  });

  it('has no totals for a year without a current budget', async () => {
    const { totals } = await serviceOver([], new Map()).summary(2031);

    expect(totals).toEqual({});
  });
});
