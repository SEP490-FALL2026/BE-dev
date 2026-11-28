import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { TicketRef } from '../access-request/access-request.types';
import type { BudgetCheckRepo } from '../spend/budget-check.repo';
import type { SpendBatchRepo } from '../spend/spend-batch.repo';
import type { SpendStepRepo } from '../spend/spend-step.repo';
import type { SpendWireViewService } from '../spend/spend-wire-view.service';
import type { NextYearBudgetService } from './next-year-budget.service';
import { SpendApprovalQueueFactsService } from './spend-approval-queue-facts.service';
import { SpendApprovalQueueService } from './spend-approval-queue.service';
import type { StepDueOnService } from './step-due-on.service';

type OpenSpendRow = Awaited<ReturnType<SpendStepRepo['pageOpenSpendOf']>>['rows'][number];

const actor: AuthenticatedPrincipal = {
  subject: 'u-1',
  appUserId: 'u-1',
  sessionId: 's-1',
  employeeId: 'boss-1',
  directRoles: ['SPENDING_APPROVER'],
  roles: ['SPENDING_APPROVER'],
};

const makeRow = (requestId: string, stepId: string): OpenSpendRow =>
  ({
    id: stepId,
    requestId,
    createdAt: new Date('2026-10-01T02:00:00Z'),
    slaWorkingDays: 2,
    samePersonAsSpend: false,
    request: {
      type: 'GRANT',
      planId: 'plan-1',
      requesterEmployeeId: 'emp-1',
      beneficiaries: [{ employeeId: 'emp-1' }],
      costCenterId: 'cc-1',
      proposal: null,
      _count: { beneficiaries: 1 },
      amountMinor: 100000n,
      amountCurrency: 'VND',
      budgetYear: 2026,
      nextYearAmountMinor: null,
      offPlan: false,
      routingMode: 'ONE_STEP',
      oneStepReason: 'REQUESTER_IS_HEAD',
    },
  }) as unknown as OpenSpendRow;

function createHarness() {
  const steps = { pageOpenSpendOf: jest.fn() };
  const checks = { latestOf: jest.fn().mockResolvedValue(new Map()) };
  const batches = { latestBatchOf: jest.fn().mockResolvedValue(new Map()) };
  const catalog = {
    getPlanSummaries: jest.fn().mockResolvedValue([{ planId: 'plan-1', planName: 'Team', applicationName: 'Tool' }]),
  };
  const organizationReads = {
    costCentersByIds: jest.fn().mockResolvedValue([{ id: 'cc-1', code: 'CC-01' }]),
  };
  const wireView = {
    people: jest
      .fn()
      .mockResolvedValue(new Map([['emp-1', { employeeId: 'emp-1', employeeCode: 'E-1', fullName: 'An' }]])),
    units: jest.fn().mockResolvedValue(new Map([['VND', 0]])),
  };
  const deadlines = {
    dueOn: jest.fn().mockResolvedValue(
      new Map([
        ['step-1', '2026-10-05'],
        ['step-2', '2026-10-05'],
      ]),
    ),
  };
  const nextYear = { of: jest.fn().mockResolvedValue(new Map()) };
  const tickets = {
    refsOf: jest.fn<Promise<Map<string, TicketRef>>, [readonly string[]]>().mockResolvedValue(new Map()),
  };

  const facts = new SpendApprovalQueueFactsService(
    checks as unknown as BudgetCheckRepo,
    batches as unknown as SpendBatchRepo,
    catalog as unknown as CatalogApi,
    organizationReads as unknown as OrganizationReadApi,
    wireView as unknown as SpendWireViewService,
    deadlines as unknown as StepDueOnService,
    nextYear as unknown as NextYearBudgetService,
    tickets as unknown as RequestTicketRepo,
  );
  const service = new SpendApprovalQueueService(steps as unknown as SpendStepRepo, facts);

  return { service, steps, tickets };
}

describe('SpendApprovalQueueService', () => {
  it('calls RequestTicketRepo.refsOf once per page for all requestIds and maps ticketRef', async () => {
    const { service, steps, tickets } = createHarness();
    steps.pageOpenSpendOf.mockResolvedValue({
      rows: [makeRow('req-1', 'step-1'), makeRow('req-2', 'step-2')],
      total: 2,
    });
    tickets.refsOf.mockResolvedValue(new Map([['req-2', { id: 'ticket-1', position: 2, itemCount: 3 }]]));

    const page = await service.queue(actor, { page: 1, pageSize: 20 });

    expect(tickets.refsOf).toHaveBeenCalledTimes(1);
    expect(tickets.refsOf).toHaveBeenCalledWith(['req-1', 'req-2']);
    expect(page.items.map((item) => ({ requestId: item.requestId, ticketRef: item.ticketRef }))).toEqual([
      { requestId: 'req-1', ticketRef: null },
      { requestId: 'req-2', ticketRef: { id: 'ticket-1', position: 2, itemCount: 3 } },
    ]);
  });

  it('handles an empty page safely', async () => {
    const { service, steps, tickets } = createHarness();
    steps.pageOpenSpendOf.mockResolvedValue({ rows: [], total: 0 });

    const page = await service.queue(actor, { page: 1, pageSize: 20 });

    expect(page.items).toEqual([]);
    expect(tickets.refsOf.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
