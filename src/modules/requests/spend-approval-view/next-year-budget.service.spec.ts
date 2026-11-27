import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BudgetFactsRepo } from '../../budgets/budget/budget-facts.repo';
import { BudgetsReadApi } from '../../budgets/public/budgets-read.api';
import { RunningUncommittedFactsService } from '../../budgets/running-uncommitted/running-uncommitted-facts.service';
import type { RunningUncommittedRepo } from '../../budgets/running-uncommitted/running-uncommitted.repo';
import type { SharedPoolLineRepo } from '../../budgets/shared-pool-line/shared-pool-line.repo';
import type { CatalogPricingApi } from '../../catalog/public/catalog-pricing.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SpendWireViewService } from '../spend/spend-wire-view.service';
import { NextYearBudgetRepo } from './next-year-budget.repo';
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
        getUnrequestedK1SeatsInForceOn: jest.fn().mockResolvedValue([]),
      } as unknown as LicensingSeatMonthApi,
      {
        linesOfSubscriptions: jest.fn().mockResolvedValue(new Map()),
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
      } as unknown as CatalogPricingApi,
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
    const budgetsRead = new BudgetsReadApi(factsRepo, runningFacts);

    const repo = {
      keptByCostCenter: jest.fn().mockResolvedValue({ totals: new Map([['cc-1', 1_000_000n]]), requestIds: [] }),
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

  it('FIX-W3 B-2: excludes seats of COMPLETED requests already counted in keptByCostCenter on 15/11 (no double-counting)', async () => {
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2027-11-15'),
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
            assignmentId: 'asg-completed',
            subscriptionId: 'sub-1',
            planId: 'plan-1',
            requestId: 'req-completed',
            source: 'REQUEST',
            kind: 'PERSONAL',
            employeeId: 'emp-1',
            owningDepartmentId: null,
            heldFrom: '2027-11-15',
            heldUntil: null,
          },
        ]),
        getUnrequestedK1SeatsInForceOn: jest.fn().mockResolvedValue([]),
      } as unknown as LicensingSeatMonthApi,
      {
        linesOfSubscriptions: jest.fn().mockResolvedValue(new Map()),
        getPurchaseFacts: jest.fn().mockResolvedValue([
          {
            subscriptionId: 'sub-1',
            status: 'ACTIVE',
            kind: 'TERM',
            provisioningType: 'K2',
            monthlyPriceMinor: 400_000n,
            startDate: '2027-01-01',
          },
        ]),
      } as unknown as CatalogPricingApi,
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
          new Map([['cc-1', { versionId: 'v-2028', baseMinor: 10_000_000n, reserveMinor: 0n, currency: 'VND' }]]),
        ),
    } as unknown as BudgetFactsRepo;
    const budgetsRead = new BudgetsReadApi(factsRepo, runningFacts);

    const prisma = {
      accessRequest: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'req-completed', costCenterId: 'cc-1', nextYearAmountMinor: 4_800_000n }]),
      },
    } as unknown as PrismaService;
    const repo = new NextYearBudgetRepo(prisma);
    const wireView = {
      formatter: jest.fn().mockResolvedValue((minor: bigint) => ({ amount: minor.toString(), currency: 'VND' })),
    } as unknown as SpendWireViewService;

    const service = new NextYearBudgetService(repo, budgetsRead, organizationReads, wireView);
    const out = await service.of([
      {
        requestId: 'req-new',
        costCenterId: 'cc-1',
        budgetYear: 2027,
        nextYearAmountMinor: 2_000_000n,
        currency: 'VND',
      },
    ]);

    expect(out.get('req-new')).toEqual({
      year: 2028,
      approved: { amount: '10000000', currency: 'VND' },
      // 10_000_000 approved - 4_800_000 kept = 5_200_000 remaining (NOT 10_000_000 - 9_600_000 = 400_000)
      remaining: { amount: '5200000', currency: 'VND' },
      remainingAfter: { amount: '3200000', currency: 'VND' },
      warning: false,
    });
  });
});
