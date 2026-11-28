import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { TicketRef } from '../access-request/access-request.types';
import type { SpendWireViewService } from '../spend/spend-wire-view.service';
import type { StepDueOnService } from '../spend-approval-view/step-due-on.service';
import type { NeedDecisionQueueRepo, NeedQueueRow } from './need-decision-queue.repo';
import { NeedDecisionQueueService } from './need-decision-queue.service';

const actor: AuthenticatedPrincipal = {
  subject: 'u-1',
  appUserId: 'u-1',
  sessionId: 's-1',
  employeeId: 'head-1',
  directRoles: ['MANAGER'],
  roles: ['MANAGER'],
};

const makeRow = (requestId: string, stepId: string): NeedQueueRow =>
  ({
    id: stepId,
    requestId,
    createdAt: new Date('2026-10-01T02:00:00Z'),
    assignedAt: new Date('2026-10-02T02:00:00Z'),
    slaWorkingDays: 2,
    routingRow: 1,
    samePersonAsSpend: false,
    _count: { lines: 0 },
    request: {
      type: 'GRANT',
      planId: 'plan-1',
      departmentId: 'dep-1',
      requesterEmployeeId: 'emp-1',
      businessReason: 'Need tool',
      termMonths: 6,
      expectedEndDate: null,
      pricingStatus: 'PRICED',
      amountMinor: 100000n,
      amountCurrency: 'VND',
      policy: {},
      proposal: null,
      renewal: null,
      beneficiaries: [{ employeeId: 'emp-1' }],
      _count: { beneficiaries: 1 },
    },
  }) as unknown as NeedQueueRow;

function createHarness() {
  const steps = { pageOpenOf: jest.fn() };
  const catalog = {
    getPlanSummaries: jest.fn().mockResolvedValue([{ planId: 'plan-1', planName: 'Team', applicationName: 'Wiki' }]),
  };
  const organizationReads = {
    getDepartmentBriefs: jest.fn().mockResolvedValue([{ id: 'dep-1', code: 'P-DES', name: 'Design' }]),
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
  const tickets = {
    refsOf: jest.fn<Promise<Map<string, TicketRef>>, [readonly string[]]>().mockResolvedValue(new Map()),
  };

  const service = new NeedDecisionQueueService(
    steps as unknown as NeedDecisionQueueRepo,
    catalog as unknown as CatalogApi,
    organizationReads as unknown as OrganizationReadApi,
    wireView as unknown as SpendWireViewService,
    deadlines as unknown as StepDueOnService,
    tickets as unknown as RequestTicketRepo,
  );

  return { service, steps, tickets };
}

describe('NeedDecisionQueueService', () => {
  it('calls RequestTicketRepo.refsOf once per page for all requestIds and maps ticketRef', async () => {
    const { service, steps, tickets } = createHarness();
    steps.pageOpenOf.mockResolvedValue({
      rows: [makeRow('req-1', 'step-1'), makeRow('req-2', 'step-2')],
      total: 2,
    });
    tickets.refsOf.mockResolvedValue(new Map([['req-2', { id: 'ticket-1', position: 2, itemCount: 4 }]]));

    const page = await service.queue(actor, { page: 1, pageSize: 20 });

    expect(tickets.refsOf).toHaveBeenCalledTimes(1);
    expect(tickets.refsOf).toHaveBeenCalledWith(['req-1', 'req-2']);
    expect(page.items.map((item) => ({ requestId: item.requestId, ticketRef: item.ticketRef }))).toEqual([
      { requestId: 'req-1', ticketRef: null },
      { requestId: 'req-2', ticketRef: { id: 'ticket-1', position: 2, itemCount: 4 } },
    ]);
  });

  it('short-circuits lookups without calling refsOf when the page is empty', async () => {
    const { service, steps, tickets } = createHarness();
    steps.pageOpenOf.mockResolvedValue({ rows: [], total: 0 });

    const page = await service.queue(actor, { page: 1, pageSize: 20 });

    expect(page.items).toEqual([]);
    expect(tickets.refsOf).not.toHaveBeenCalled();
  });
});
