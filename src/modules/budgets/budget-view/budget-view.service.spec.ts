import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { CatalogPricingApi } from '../../catalog/public/catalog-pricing.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { BudgetFactsRepo } from '../budget/budget-facts.repo';
import type { BudgetFactsService } from '../budget/budget-facts.service';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceRepo } from '../budget/invoice.repo';
import type { ReferenceFigures } from '../budget/version.repo';
import type { CycleRepo } from '../cycle/cycle.repo';
import type { PendingSpendContributions } from '../public/budgets.extension-points';
import { RunningUncommittedFactsService } from '../running-uncommitted/running-uncommitted-facts.service';
import type { RunningUncommittedRepo } from '../running-uncommitted/running-uncommitted.repo';
import { SharedPoolLineFactsService } from '../shared-pool-line/shared-pool-line-facts.service';
import type { SharedPoolLineRepo } from '../shared-pool-line/shared-pool-line.repo';
import { SeatMonthRepo } from '../seat-month/seat-month.repo';
import { BudgetTableViewService } from './budget-table-view.service';
import { BudgetViewNumbersService } from './budget-view-numbers.service';
import type { BudgetViewRepo } from './budget-view.repo';

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
      adjustmentOf: jest.fn().mockResolvedValue(0n),
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
                runningUncommitted: 0n,
                noPriceRightCount: 0,
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
    {
      yearTotals: jest.fn().mockResolvedValue({ companyMinor: 0n, withoutCostCenterMinor: 0n }),
    } as unknown as SeatMonthRepo,
    {
      yearFigures: jest.fn().mockResolvedValue({
        idleCostMinor: 0n,
        invoiceVarianceMinor: 0n,
        invoiceVarianceInReviewMinor: 0n,
        deviceLotPurchasesMinor: 0n,
        replacementKeysMinor: 0n,
        unallocatedMinor: 0n,
      }),
    } as unknown as SharedPoolLineFactsService,
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
      effectiveBudget: {
        base: { amount: '1350', currency: 'VND' },
        reserve: { amount: '150', currency: 'VND' },
        total: { amount: '1500', currency: 'VND' },
        adjustment: { amount: '0', currency: 'VND' },
      },
      committed: { amount: '700', currency: 'VND' },
      spent: { amount: '350', currency: 'VND' },
      remaining: { amount: '450', currency: 'VND' },
      pendingSpend: { amount: '0', currency: 'VND' },
      runningUncommitted: { amount: '0', currency: 'VND' },
      remainingBase: { amount: '300', currency: 'VND' },
      remainingWithReserve: { amount: '450', currency: 'VND' },
      costCenterCount: 2,
      // A: 1000 - 300 - 200 = 500; B: 500 - 400 - 150 = -50.
      overBudgetCount: 1,
      noPriceRightCount: 0,
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

  it('deducts runningUncommitted from summary remaining figures and overBudgetCount', async () => {
    const repo = {
      rows: jest.fn().mockResolvedValue([{ ...figures(CC_A, 'VND', 900n, 100n), versionId: 'version', number: 1 }]),
    } as unknown as BudgetViewRepo;
    const numbers = {
      adjustmentOf: jest.fn().mockResolvedValue(0n),
      totals: jest.fn().mockResolvedValue(
        new Map([
          [
            `${CC_A}:2027`,
            {
              committed: 300n,
              spent: 200n,
              pendingSpend: 0n,
              runningUncommitted: 550n,
              noPriceRightCount: 0,
              priorPeriodAdjustment: 0n,
            },
          ],
        ]),
      ),
      cycle: jest.fn().mockResolvedValue(null),
      lastInvoice: jest.fn().mockResolvedValue(null),
    } as unknown as BudgetViewNumbersService;
    const service = new BudgetTableViewService(
      repo,
      numbers,
      {
        formatter: (currency: string) => Promise.resolve((minor: bigint) => ({ amount: minor.toString(), currency })),
      } as unknown as BudgetFactsService,
      {
        yearTotals: jest.fn().mockResolvedValue({ companyMinor: 0n, withoutCostCenterMinor: 0n }),
      } as unknown as SeatMonthRepo,
      {
        yearFigures: jest.fn().mockResolvedValue({
          idleCostMinor: 0n,
          invoiceVarianceMinor: 0n,
          invoiceVarianceInReviewMinor: 0n,
          deviceLotPurchasesMinor: 0n,
          replacementKeysMinor: 0n,
          unallocatedMinor: 0n,
        }),
      } as unknown as SharedPoolLineFactsService,
    );

    const { totals } = await service.summary(2027);

    expect(totals.VND.runningUncommitted).toEqual({ amount: '550', currency: 'VND' });
    expect(totals.VND.remainingBase).toEqual({ amount: '-150', currency: 'VND' });
    expect(totals.VND.remainingWithReserve).toEqual({ amount: '-50', currency: 'VND' });
    expect(totals.VND.remaining).toEqual({ amount: '-50', currency: 'VND' });
    expect(totals.VND.overBudgetCount).toBe(1);
  });

  it('exposes noPriceRightCount in budgetTable rows and sums it in budgetSummary when unrequested K1 rights lack reference price (D-17)', async () => {
    const licensing = {
      getSeatsInForceOn: jest.fn().mockResolvedValue([]),
      getUnrequestedK1SeatsInForceOn: jest.fn().mockResolvedValue([
        {
          assignmentId: 'k1-a-1',
          planId: 'plan-no-price',
          employeeId: 'emp-a',
          kind: 'PERSONAL',
          owningDepartmentId: null,
          heldFrom: '2027-01-01',
          heldUntil: null,
          billingAnchorOn: '2027-01-01',
          referenceMonthlyPriceMinor: null,
        },
        {
          assignmentId: 'k1-a-2',
          planId: 'plan-no-price',
          employeeId: 'emp-a',
          kind: 'PERSONAL',
          owningDepartmentId: null,
          heldFrom: '2027-01-01',
          heldUntil: null,
          billingAnchorOn: '2027-01-01',
          referenceMonthlyPriceMinor: null,
        },
        {
          assignmentId: 'k1-b-1',
          planId: 'plan-no-price',
          employeeId: 'emp-b',
          kind: 'PERSONAL',
          owningDepartmentId: null,
          heldFrom: '2027-01-01',
          heldUntil: null,
          billingAnchorOn: '2027-01-01',
          referenceMonthlyPriceMinor: null,
        },
      ]),
    } as unknown as LicensingSeatMonthApi;

    const organization = {
      getOrganization: jest.fn().mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
        timeZone: 'Asia/Ho_Chi_Minh',
        reportingCurrency: 'VND',
      }),
      businessToday: jest.fn().mockResolvedValue('2027-07-08'),
      getOwningUnits: jest.fn().mockResolvedValue(
        new Map([
          ['emp-a', { costCenter: { id: CC_A } }],
          ['emp-b', { costCenter: { id: CC_B } }],
        ]),
      ),
      getUnitCostCenterIds: jest.fn().mockResolvedValue(new Map()),
    } as unknown as OrganizationReadApi;

    const runningUncommitted = new RunningUncommittedFactsService(
      licensing,
      {} as CatalogPricingApi,
      organization,
      {} as RunningUncommittedRepo,
      {} as SharedPoolLineRepo,
    );

    const numbers = new BudgetViewNumbersService(
      { totals: jest.fn().mockResolvedValue(new Map()) } as unknown as CommitmentRepo,
      { totals: jest.fn().mockResolvedValue(new Map()) } as unknown as PendingSpendContributions,
      {
        priorPeriodAdjustments: jest.fn().mockResolvedValue(new Map()),
        lastRecordedAt: jest.fn().mockResolvedValue(null),
      } as unknown as InvoiceRepo,
      { findByYear: jest.fn().mockResolvedValue(null) } as unknown as CycleRepo,
      organization,
      {} as BudgetFactsRepo,
      runningUncommitted,
    );

    const viewRows = [
      { ...figures(CC_A, 'VND', 900n, 100n), versionId: 'ver-a', number: 1, adjustmentMinor: 0n },
      { ...figures(CC_B, 'VND', 450n, 50n), versionId: 'ver-b', number: 1, adjustmentMinor: 0n },
    ];
    const repo = {
      page: jest.fn().mockResolvedValue({ items: viewRows, total: 2 }),
      rows: jest.fn().mockResolvedValue(viewRows),
    } as unknown as BudgetViewRepo;

    const service = new BudgetTableViewService(
      repo,
      numbers,
      {
        costCenters: jest.fn().mockResolvedValue(
          new Map([
            [CC_A, { id: CC_A, code: 'CCA', name: 'Cost Center A' }],
            [CC_B, { id: CC_B, code: 'CCB', name: 'Cost Center B' }],
          ]),
        ),
        formatter: (currency: string) => Promise.resolve((minor: bigint) => ({ amount: minor.toString(), currency })),
      } as unknown as BudgetFactsService,
      {
        yearTotals: jest.fn().mockResolvedValue({ companyMinor: 0n, withoutCostCenterMinor: 0n }),
      } as unknown as SeatMonthRepo,
      {
        yearFigures: jest.fn().mockResolvedValue({
          idleCostMinor: 0n,
          invoiceVarianceMinor: 0n,
          invoiceVarianceInReviewMinor: 0n,
          deviceLotPurchasesMinor: 0n,
          replacementKeysMinor: 0n,
          unallocatedMinor: 0n,
        }),
      } as unknown as SharedPoolLineFactsService,
    );

    const table = await service.table({ year: 2027, page: 1, pageSize: 20 });
    expect(table.items[0]).toMatchObject({ costCenter: { id: CC_A }, noPriceRightCount: 2 });
    expect(table.items[1]).toMatchObject({ costCenter: { id: CC_B }, noPriceRightCount: 1 });

    const summary = await service.summary(2027);
    expect(summary.totals.VND).toMatchObject({ noPriceRightCount: 3 });
  });
});
