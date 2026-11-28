import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { BudgetsApi } from '../../budgets/public/budgets.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestTicketNotFoundError } from '../request-ticket/request-ticket.errors';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import { RequestReadAccessService } from './request-read-access.service';
import type { RequestReadRepo } from './request-read.repo';

const actor: AuthenticatedPrincipal = {
  subject: 'emp-1',
  appUserId: 'user-1',
  sessionId: 'sess-1',
  employeeId: 'emp-1',
  directRoles: ['EMPLOYEE'],
  roles: ['EMPLOYEE'],
};

const makeRecord = (id: string, requesterEmployeeId: string): AccessRequestRecord =>
  ({
    id,
    type: 'GRANT',
    state: 'PENDING',
    requesterEmployeeId,
    beneficiaryEmployeeIds: [requesterEmployeeId],
    departmentId: 'dept-1',
    needStep: { assigneeEmployeeId: 'head-1' },
    needSteps: [],
    lines: [],
  }) as unknown as AccessRequestRecord;

describe('RequestReadAccessService.visibleTicket', () => {
  const build = (options: {
    summary?: { id: string; requesterEmployeeId: string; items: { requestId: string; position: number }[] } | null;
    records?: AccessRequestRecord[];
  }) => {
    const tx = { tag: 'tx' };
    const runner = { run: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
    const tickets = { summaryWithItems: jest.fn().mockResolvedValue(options.summary ?? null) };
    const requests = { findByIds: jest.fn().mockResolvedValue(options.records ?? []) };
    const service = new RequestReadAccessService(
      { spendFactsOf: jest.fn() } as unknown as RequestReadRepo,
      { getHeadedDepartment: jest.fn() } as unknown as OrganizationReadApi,
      { requestHoldsCommitment: jest.fn() } as unknown as BudgetsApi,
      runner as unknown as TransactionRunner,
      tickets as unknown as RequestTicketRepo,
      requests as unknown as AccessRequestRepo,
    );
    return { service, tx, runner, tickets, requests };
  };

  it('throws RequestTicketNotFoundError when ticket is missing or has no items', async () => {
    const { service, requests } = build({ summary: null });
    await expect(service.visibleTicket(actor, 'ticket-1')).rejects.toBeInstanceOf(RequestTicketNotFoundError);
    expect(requests.findByIds).not.toHaveBeenCalled();
  });

  it('throws RequestTicketNotFoundError when no item is visible to the caller', async () => {
    const { service } = build({
      summary: { id: 'ticket-1', requesterEmployeeId: 'other', items: [{ requestId: 'req-1', position: 1 }] },
      records: [makeRecord('req-1', 'other')],
    });
    await expect(service.visibleTicket(actor, 'ticket-1')).rejects.toBeInstanceOf(RequestTicketNotFoundError);
  });

  it('reads ticket, records, and visibility in one transaction and orders items by position', async () => {
    const { service, tx, tickets, requests } = build({
      summary: {
        id: 'ticket-1',
        requesterEmployeeId: 'emp-1',
        items: [
          { requestId: 'req-2', position: 2 },
          { requestId: 'req-1', position: 1 },
        ],
      },
      records: [makeRecord('req-1', 'emp-1'), makeRecord('req-2', 'other')],
    });

    const result = await service.visibleTicket(actor, 'ticket-1');

    expect(tickets.summaryWithItems).toHaveBeenCalledWith(tx, 'ticket-1');
    expect(requests.findByIds).toHaveBeenCalledWith(['req-1', 'req-2'], tx);
    expect(result.ticket).toEqual({ id: 'ticket-1', requesterEmployeeId: 'emp-1' });
    expect(result.items.map((item) => item.requestId)).toEqual(['req-1', 'req-2']);
    expect(result.visibleIds).toEqual(new Set(['req-1']));
  });
});
