import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { TicketRef } from '../request-ticket/request-ticket.types';
import type { MyRequestsFactsRepo } from './my-requests-facts.repo';
import type { MyRequestsRepo } from './my-requests.repo';
import { MyRequestsService } from './my-requests.service';
import type { MyRequestRow } from './my-requests.types';

const actor: AuthenticatedPrincipal = {
  subject: 'u-1',
  appUserId: 'u-1',
  sessionId: 's-1',
  employeeId: 'emp-1',
  directRoles: ['EMPLOYEE'],
  roles: ['EMPLOYEE'],
};

const makeRow = (id: string): MyRequestRow => ({
  id,
  type: 'GRANT',
  branch: 'PAID_IN_CATALOG',
  state: 'PENDING',
  routing: { mode: 'VIA_HEAD', oneStepReason: null },
  requesterEmployeeId: 'emp-1',
  departmentId: 'dep-1',
  planId: 'plan-1',
  termMonths: 6,
  expectedEndDate: null,
  submittedAt: new Date('2026-10-30T02:00:00.000Z'),
  updatedAt: new Date('2026-10-30T02:00:00.000Z'),
  hasSpendStep: true,
  hasAssessmentStep: false,
  withdrawalNeedStep: 'PENDING',
  beneficiaryEmployeeId: 'emp-1',
  lineCount: 1,
  needStepId: `step-${id}`,
  needStep: { state: 'PENDING', assigneeEmployeeId: 'head-1', waitingReason: null },
  withdrawal: null,
});

function createHarness() {
  const requests = {
    pageOf: jest.fn(),
    proposalNames: jest.fn().mockResolvedValue(new Map()),
  };
  const facts = {
    latestChecks: jest.fn().mockResolvedValue(new Map()),
    withOpenSpendStep: jest.fn().mockResolvedValue(new Set()),
    spendRefusals: jest.fn().mockResolvedValue(new Map()),
    needRefusals: jest.fn().mockResolvedValue(new Map()),
    assessmentRefusals: jest.fn().mockResolvedValue(new Map()),
    linesOf: jest.fn().mockResolvedValue(new Map()),
  };
  const organizationReads = {
    getEmployees: jest.fn().mockResolvedValue([
      { id: 'emp-1', employeeCode: 'E-1', fullName: 'An' },
      { id: 'head-1', employeeCode: 'H-1', fullName: 'Binh' },
    ]),
  };
  const catalog = {
    getPlanSummaries: jest
      .fn()
      .mockResolvedValue([
        { planId: 'plan-1', planName: 'Business', applicationId: 'app-1', applicationName: 'Figma' },
      ]),
  };
  const tickets = {
    refsOf: jest.fn<Promise<Map<string, TicketRef>>, [readonly string[]]>().mockResolvedValue(new Map()),
  };

  const service = new MyRequestsService(
    requests as unknown as MyRequestsRepo,
    facts as unknown as MyRequestsFactsRepo,
    organizationReads as unknown as OrganizationReadApi,
    catalog as unknown as CatalogApi,
    tickets as unknown as RequestTicketRepo,
  );

  return { service, requests, tickets };
}

describe('MyRequestsService', () => {
  it('calls RequestTicketRepo.refsOf once per page and attaches ticketRef to each item', async () => {
    const { service, requests, tickets } = createHarness();
    requests.pageOf.mockResolvedValue({ rows: [makeRow('req-1'), makeRow('req-2')], total: 2 });
    tickets.refsOf.mockResolvedValue(new Map([['req-2', { id: 'ticket-1', position: 2, itemCount: 3 }]]));

    const page = await service.list(actor, { page: 1, pageSize: 20 });

    expect(tickets.refsOf).toHaveBeenCalledTimes(1);
    expect(tickets.refsOf).toHaveBeenCalledWith(['req-1', 'req-2']);
    expect(page.items.map((item) => ({ id: item.id, ticketRef: item.ticketRef }))).toEqual([
      { id: 'req-1', ticketRef: null },
      { id: 'req-2', ticketRef: { id: 'ticket-1', position: 2, itemCount: 3 } },
    ]);
  });

  it('handles an empty page safely without failing on refsOf', async () => {
    const { service, requests, tickets } = createHarness();
    requests.pageOf.mockResolvedValue({ rows: [], total: 0 });

    const page = await service.list(actor, { page: 1, pageSize: 20 });

    expect(page.items).toEqual([]);
    expect(tickets.refsOf.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
