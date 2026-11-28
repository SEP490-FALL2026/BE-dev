import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestTicketNotFoundError } from '../request-ticket/request-ticket.errors';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { RequestTicketRawView } from '../request-ticket/request-ticket.types';
import type { RequestReadAccessService } from '../request-view/request-read-access.service';
import { RequestTicketViewService } from './request-ticket-view.service';

const TS = new Date('2026-06-01T08:00:00.000Z');
const REPLY_TS = new Date('2026-06-02T09:00:00.000Z');

function makeTicketView(
  states: [AccessRequestRecord['state'], AccessRequestRecord['state'], AccessRequestRecord['state']],
): RequestTicketRawView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    requesterEmployeeId: 'emp-1',
    departmentId: 'dept-1',
    submittedAt: TS,
    items: [
      {
        position: 1,
        requestId: 'req-1',
        planId: 'plan-1',
        state: states[0] as Exclude<AccessRequestRecord['state'], 'DRAFT'>,
        termMonths: 3,
        routingMode: 'VIA_HEAD',
        latestReply: null,
      },
      {
        position: 2,
        requestId: 'req-2',
        planId: 'plan-2',
        state: states[1] as Exclude<AccessRequestRecord['state'], 'DRAFT'>,
        termMonths: 4,
        routingMode: 'VIA_HEAD',
        latestReply: null,
      },
      {
        position: 3,
        requestId: 'req-3',
        planId: 'plan-3',
        state: states[2] as Exclude<AccessRequestRecord['state'], 'DRAFT'>,
        termMonths: 5,
        routingMode: 'VIA_HEAD',
        latestReply: {
          kind: 'REQUESTER_RESUBMISSION',
          note: 'dùng cho dự án X, 3 tháng',
          authorEmployeeId: 'emp-1',
          createdAt: REPLY_TS,
        },
      },
    ],
  };
}

describe('RequestTicketViewService', () => {
  const actor = { employeeId: 'c1', roles: ['SPENDING_APPROVER'] } as unknown as AuthenticatedPrincipal;
  const runner = {
    run: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as unknown as TransactionRunner;
  const tickets = { view: jest.fn() };
  const readAccess = { visibleTicket: jest.fn() };
  const organizationReads = {
    getEmployees: jest.fn(),
    getDepartmentBrief: jest.fn(),
  };
  const catalog = { getPlanSummaries: jest.fn() };
  const service = new RequestTicketViewService(
    runner,
    tickets as unknown as RequestTicketRepo,
    readAccess as unknown as RequestReadAccessService,
    organizationReads as unknown as OrganizationReadApi,
    catalog as unknown as CatalogApi,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    organizationReads.getEmployees.mockResolvedValue([{ id: 'emp-1', employeeCode: 'E1', fullName: 'Nguyen Van A' }]);
    organizationReads.getDepartmentBrief.mockResolvedValue({ id: 'dept-1', code: 'P-DES', name: 'Design' });
    catalog.getPlanSummaries.mockResolvedValue([
      { planId: 'plan-1', planName: 'Figma Org', applicationId: 'app-1', applicationName: 'Figma' },
      { planId: 'plan-2', planName: 'Miro Business', applicationId: 'app-2', applicationName: 'Miro' },
      { planId: 'plan-3', planName: 'Notion Plus', applicationId: 'app-3', applicationName: 'Notion' },
    ]);
  });

  it('throws RequestTicketNotFoundError when the ticket does not exist', async () => {
    tickets.view.mockResolvedValue(null);

    await expect(service.get(actor, 'missing')).rejects.toBeInstanceOf(RequestTicketNotFoundError);
    expect(readAccess.visibleTicket).not.toHaveBeenCalled();
  });

  it('throws RequestTicketNotFoundError when caller cannot view any item', async () => {
    tickets.view.mockResolvedValue(makeTicketView(['COMPLETED', 'REJECTED', 'AWAITING_SPEND_DECISION']));
    readAccess.visibleTicket.mockRejectedValue(new RequestTicketNotFoundError());

    await expect(service.get(actor, '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      RequestTicketNotFoundError,
    );
  });

  it('filters items to the 1 of 3 visible to the caller while deriving status across all 3 items', async () => {
    tickets.view.mockResolvedValue(makeTicketView(['COMPLETED', 'REJECTED', 'AWAITING_SPEND_DECISION']));
    readAccess.visibleTicket.mockResolvedValue({ visibleIds: new Set(['req-3']) });

    const ticket = await service.get(actor, '11111111-1111-4111-8111-111111111111');

    expect(ticket.status).toBe('IN_PROGRESS');
    expect(ticket.items).toHaveLength(1);
    expect(ticket.items[0]).toMatchObject({
      position: 3,
      requestId: 'req-3',
      plan: { id: 'plan-3', name: 'Notion Plus' },
      latestReply: {
        kind: 'REQUESTER_RESUBMISSION',
        note: 'dùng cho dự án X, 3 tháng',
        author: { id: 'emp-1', name: 'Nguyen Van A' },
        createdAt: '2026-06-02T09:00:00.000Z',
      },
    });
    expect(organizationReads.getEmployees).toHaveBeenCalledWith(['emp-1']);
    expect(organizationReads.getDepartmentBrief).toHaveBeenCalledWith('dept-1');
    expect(catalog.getPlanSummaries).toHaveBeenCalledWith(['plan-1', 'plan-2', 'plan-3']);
  });

  it('returns status DONE when all items are in ended states even if only a subset is visible', async () => {
    tickets.view.mockResolvedValue(makeTicketView(['COMPLETED', 'REJECTED', 'REJECTED']));
    readAccess.visibleTicket.mockResolvedValue({ visibleIds: new Set(['req-1']) });

    const ticket = await service.get(actor, '11111111-1111-4111-8111-111111111111');

    expect(ticket.status).toBe('DONE');
    expect(ticket.items.map((item) => item.requestId)).toEqual(['req-1']);
  });
});
