import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogPricingApi } from '../../catalog/public/catalog-pricing.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { BudgetFactsRepo } from '../budget/budget-facts.repo';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceRepo } from '../budget/invoice.repo';
import type { PendingSpendContributions } from '../public/budgets.extension-points';
import { RunningUncommittedFactsService } from '../running-uncommitted/running-uncommitted-facts.service';
import type { RunningUncommittedRepo } from '../running-uncommitted/running-uncommitted.repo';
import type { SeatMonthRepo } from '../seat-month/seat-month.repo';
import type { SharedPoolLineRepo } from '../shared-pool-line/shared-pool-line.repo';
import { BudgetReviewFiguresService } from './budget-review-figures.service';
import type { BudgetReviewPriceService } from './budget-review-price.service';

const TX = {} as DbTx;
const CC_TK = 'cc-tk';
const TR = 1_000_000n;

function buildW308Service() {
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2027-07-08'),
    getOrganization: jest
      .fn()
      .mockResolvedValue({ id: 'org-1', reportingCurrency: 'VND', timeZone: 'Asia/Ho_Chi_Minh' }),
    getOwningUnits: jest.fn().mockResolvedValue(
      new Map([
        ['emp-1', { departmentId: 'dept-1', costCenter: { id: CC_TK, code: 'TK', name: 'TK', status: 'ACTIVE' } }],
        ['emp-2', { departmentId: 'dept-1', costCenter: { id: CC_TK, code: 'TK', name: 'TK', status: 'ACTIVE' } }],
      ]),
    ),
    getUnitCostCenterIds: jest.fn().mockResolvedValue(new Map()),
  } as unknown as OrganizationReadApi;

  const runningUncommitted = new RunningUncommittedFactsService(
    {
      getSeatsInForceOn: jest.fn().mockResolvedValue([
        {
          assignmentId: 'a1',
          subscriptionId: 'sub-figma',
          planId: 'plan-figma',
          requestId: null,
          source: 'BASELINE',
          kind: 'PERSONAL',
          employeeId: 'emp-1',
          owningDepartmentId: null,
          heldFrom: '2027-01-01',
          heldUntil: null,
        },
        {
          assignmentId: 'a2',
          subscriptionId: 'sub-figma',
          planId: 'plan-figma',
          requestId: null,
          source: 'BASELINE',
          kind: 'PERSONAL',
          employeeId: 'emp-2',
          owningDepartmentId: null,
          heldFrom: '2027-01-01',
          heldUntil: null,
        },
      ]),
      getUnrequestedK1SeatsInForceOn: jest.fn().mockResolvedValue([]),
    } as unknown as LicensingSeatMonthApi,
    {
      linesOfSubscriptions: jest.fn().mockResolvedValue(new Map()),
      getPurchaseFacts: jest.fn().mockResolvedValue([
        {
          subscriptionId: 'sub-figma',
          status: 'ACTIVE',
          kind: 'TERM',
          provisioningType: 'K2',
          monthlyPriceMinor: 375_000n,
          startDate: '2027-01-01',
        },
      ]),
    } as unknown as CatalogPricingApi,
    organizationReads,
    { commitmentsOfRequestsInYear: jest.fn().mockResolvedValue(new Map()) } as unknown as RunningUncommittedRepo,
    {
      subscriptionIdsWithRunsByMonth: jest
        .fn()
        .mockResolvedValue([1, 2, 3, 4, 5, 6].map((m) => ({ subscriptionId: 'sub-figma', month: `2027-0${m}-01` }))),
    } as unknown as SharedPoolLineRepo,
  );

  const budgets = {
    approvedOfYear: jest
      .fn()
      .mockResolvedValue(new Map([[CC_TK, { baseMinor: 120n * TR, reserveMinor: 12n * TR, currency: 'VND' }]])),
    approvedOfCostCenters: jest
      .fn()
      .mockResolvedValue(new Map([[CC_TK, { baseMinor: 120n * TR, reserveMinor: 12n * TR, currency: 'VND' }]])),
    priorYearReleasedOf: jest.fn().mockResolvedValue(new Map()),
  } as unknown as BudgetFactsRepo;

  const commitments = {
    totals: jest.fn().mockResolvedValue(new Map([[`${CC_TK}:2027`, { held: 50n * TR, spent: 60n * TR }]])),
  } as unknown as CommitmentRepo;

  const invoices = {
    spentOf: jest.fn().mockResolvedValue(new Map([[`${CC_TK}:2027`, 60n * TR]])),
    priceBasisOf: jest
      .fn()
      .mockResolvedValue(new Map([[`${CC_TK}:2027`, { basisMinor: 60n * TR, actualMinor: 60n * TR }]])),
  } as unknown as InvoiceRepo;

  const service = new BudgetReviewFiguresService(
    budgets,
    commitments,
    invoices,
    {
      totals: jest.fn().mockResolvedValue(new Map([[`${CC_TK}:2027`, 10n * TR]])),
    } as unknown as PendingSpendContributions,
    { itemsOf: jest.fn().mockResolvedValue(new Map()) } as unknown as BudgetReviewPriceService,
    {} as SeatMonthRepo,
    runningUncommitted,
  );

  return { service };
}

describe('BudgetReviewFiguresService (W3-08 D-11 forecastMinor + runningUncommitted)', () => {
  it('adds live runningUncommitted (4.5M on 08/07/2027) to forecastMinor in both linesOf and forecastsOf', async () => {
    const { service } = buildW308Service();

    const lines = await service.linesOf(TX, 2027, 6, 'VND', '2027-07-08');
    expect(lines).toHaveLength(1);
    expect(lines[0].forecastMinor).toBe(124_500_000n);
    expect(lines[0].light).toBe('YELLOW');

    const forecasts = await service.forecastsOf(TX, 2027, [CC_TK], '2027-07-08');
    expect(forecasts.get(CC_TK)).toBe(124_500_000n);
  });
});
