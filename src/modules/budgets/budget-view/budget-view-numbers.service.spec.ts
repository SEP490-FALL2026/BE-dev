import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { CatalogPricingApi } from '../../catalog/public/catalog-pricing.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { BudgetFactsRepo } from '../budget/budget-facts.repo';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { InvoiceRepo } from '../budget/invoice.repo';
import type { CycleRepo } from '../cycle/cycle.repo';
import type { PendingSpendContributions } from '../public/budgets.extension-points';
import { RunningUncommittedFactsService } from '../running-uncommitted/running-uncommitted-facts.service';
import type { RunningUncommittedRepo } from '../running-uncommitted/running-uncommitted.repo';
import type { SharedPoolLineRepo } from '../shared-pool-line/shared-pool-line.repo';
import { BudgetViewNumbersService } from './budget-view-numbers.service';

const CC_A = 'cc-a';
const CC_B = 'cc-b';

describe('BudgetViewNumbersService (D-17 noPriceRightCount)', () => {
  it('propagates noPriceRightCount per Cost Center alongside runningUncommitted from real RunningUncommittedFactsService', async () => {
    const licensing = {
      getSeatsInForceOn: jest.fn().mockResolvedValue([]),
      getUnrequestedK1SeatsInForceOn: jest.fn().mockResolvedValue([
        {
          assignmentId: 'k1-no-price-1',
          planId: 'plan-no-price',
          employeeId: 'emp-1',
          kind: 'PERSONAL',
          owningDepartmentId: null,
          heldFrom: '2027-01-01',
          heldUntil: null,
          billingAnchorOn: '2027-01-01',
          referenceMonthlyPriceMinor: null,
        },
        {
          assignmentId: 'k1-no-price-2',
          planId: 'plan-no-price',
          employeeId: 'emp-1',
          kind: 'PERSONAL',
          owningDepartmentId: null,
          heldFrom: '2027-01-01',
          heldUntil: null,
          billingAnchorOn: '2027-01-01',
          referenceMonthlyPriceMinor: null,
        },
        {
          assignmentId: 'k1-priced',
          planId: 'plan-priced',
          employeeId: 'emp-1',
          kind: 'PERSONAL',
          owningDepartmentId: null,
          heldFrom: '2027-01-01',
          heldUntil: null,
          billingAnchorOn: '2027-01-01',
          referenceMonthlyPriceMinor: 300_000n,
        },
        {
          assignmentId: 'k1-b-no-price',
          planId: 'plan-no-price',
          employeeId: 'emp-2',
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
          ['emp-1', { costCenter: { id: CC_A } }],
          ['emp-2', { costCenter: { id: CC_B } }],
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

    const service = new BudgetViewNumbersService(
      { totals: jest.fn().mockResolvedValue(new Map()) } as unknown as CommitmentRepo,
      { totals: jest.fn().mockResolvedValue(new Map()) } as unknown as PendingSpendContributions,
      { priorPeriodAdjustments: jest.fn().mockResolvedValue(new Map()) } as unknown as InvoiceRepo,
      {} as CycleRepo,
      organization,
      {} as BudgetFactsRepo,
      runningUncommitted,
    );

    const totals = await service.totals([
      { costCenterId: CC_A, year: 2027 },
      { costCenterId: CC_B, year: 2027 },
    ]);

    expect(totals.get(`${CC_A}:2027`)).toMatchObject({
      runningUncommitted: 1_800_000n,
      noPriceRightCount: 2,
    });
    expect(totals.get(`${CC_B}:2027`)).toMatchObject({
      runningUncommitted: 0n,
      noPriceRightCount: 1,
    });
  });
});
