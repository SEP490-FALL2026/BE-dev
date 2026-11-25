import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../../budgets/budget/budget-facts.repo';
import { BudgetsReadApi } from '../../budgets/public/budgets-read.api';
import { RunningUncommittedFactsService } from '../../budgets/running-uncommitted/running-uncommitted-facts.service';
import type { RunningUncommittedRepo } from '../../budgets/running-uncommitted/running-uncommitted.repo';
import type { SharedPoolLineRepo } from '../../budgets/shared-pool-line/shared-pool-line.repo';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SpendWireViewService } from '../spend/spend-wire-view.service';
import type { NextYearBudgetRepo } from './next-year-budget.repo';
import { NextYearBudgetService } from './next-year-budget.service';

describe('NextYearBudgetService (FIX-B1 F7 / D-10)', () => {
  it('subtracts live Y+1 runningUncommitted from next-year remaining and remainingAfter', async () => {
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2027-07-08'),
      getOrganization: jest
        .fn()
        .mockResolvedValue({ id: 'org-1', reportingCurrency: 'VND', timeZone: 'Asia/Ho_Chi_Minh' }),
      getOwningUnits: jest
        .fn()
        .mockResolvedValue(
          new Map([
            [
              'emp-1',
              { departmentId: 'dept-1', costCenter: { id: 'cc-1', code: 'CC1', name: 'CC1', status: 'ACTIVE' } },
            ],
          ]),
        ),
      getUnitCostCenterIds: jest.fn().mockResolvedValue(new Map()),
    } as unknown as OrganizationReadApi;

    const runningFacts = new RunningUncommittedFactsService(
      {
        getSeatsInForceOn: jest.fn().mockResolvedValue([
          {
            assignmentId: 'asg-1',
            subscriptionId: 'sub-1',
            planId: 'plan-1',
            requestId: null,
            source: 'BASELINE',
            kind: 'PERSONAL',
            employeeId: 'emp-1',
            owningDepartmentId: null,
            heldFrom: '2027-01-01',
            heldUntil: null,
          },
        ]),
      } as unknown as LicensingSeatMonthApi,
      {
        getPurchaseFacts: jest.fn().mockResolvedValue([
          {
            subscriptionId: 'sub-1',
            status: 'ACTIVE',
            kind: 'TERM',
            provisioningType: 'K2',
            monthlyPriceMinor: 500_000n,
            startDate: '2027-01-01',
          },
        ]),
      } as unknown as SubscriptionPeriodApi,
      organizationReads,
      {
        commitmentsOfRequestsInYear: jest.fn().mockResolvedValue(new Map()),
      } as unknown as RunningUncommittedRepo,
      {
        subscriptionIdsWithRunsByMonth: jest.fn().mockResolvedValue([]),
      } as unknown as SharedPoolLineRepo,
    );

    const factsRepo = {
      yearFacts: jest.fn(),
      approvedOfCostCenters: jest
        .fn()
        .mockResolvedValue(
          new Map([
            ['cc-1', { versionId: 'v-2028', baseMinor: 10_000_000n, reserveMinor: 2_000_000n, currency: 'VND' }],
          ]),
        ),
    } as unknown as BudgetFactsRepo;
    const budgetsRead = new BudgetsReadApi(factsRepo);
    budgetsRead.registerRunningUncommitted(runningFacts);

    const repo = {
      keptByCostCenter: jest.fn().mockResolvedValue(new Map([['cc-1', 1_000_000n]])),
    } as unknown as NextYearBudgetRepo;
    const wireView = {
      formatter: jest.fn().mockResolvedValue((minor: bigint) => ({ amount: minor.toString(), currency: 'VND' })),
    } as unknown as SpendWireViewService;

    const service = new NextYearBudgetService(repo, budgetsRead, organizationReads, wireView);
    const out = await service.of([
      {
        requestId: 'req-1',
        costCenterId: 'cc-1',
        budgetYear: 2027,
        nextYearAmountMinor: 5_500_000n,
        currency: 'VND',
      },
    ]);

    expect(out.get('req-1')).toEqual({
      year: 2028,
      approved: { amount: '12000000', currency: 'VND' },
      // 12M approved - 1M kept - 6M runningUncommitted = 5M remaining; 5M - 5.5M = -500k => warning: true
      remaining: { amount: '5000000', currency: 'VND' },
      remainingAfter: { amount: '-500000', currency: 'VND' },
      warning: true,
    });
    void ({} as DbTx);
  });
});
