import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestTicketNotFoundError } from '../request-ticket/request-ticket.errors';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { RequestTicketView } from '../request-ticket/request-ticket.types';
import type { RequestReadAccessService } from '../request-view/request-read-access.service';
import { RequestTicketViewService } from './request-ticket-view.service';

const TS = new Date('2026-06-01T08:00:00.000Z');
const REPLY_TS = new Date('2026-06-02T09:00:00.000Z');

function makeTicketView(
  states: [AccessRequestRecord['state'], AccessRequestRecord['state'], AccessRequestRecord['state']],
): RequestTicketView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    requester: { employeeId: 'emp-1', employeeCode: 'E1', fullName: 'Nguyen Van A' },
    department: { id: 'dept-1', code: 'P-DES', name: 'Design' },
    submittedAt: TS,
    items: [
      {
        position: 1,
        requestId: 'req-1',
        plan: { id: 'plan-1', name: 'Figma Org' },
        state: states[0] as Exclude<AccessRequestRecord['state'], 'DRAFT'>,
        termMonths: 3,
        routingMode: 'VIA_HEAD',
        latestReply: null,
      },
      {
        position: 2,
        requestId: 'req-2',
        plan: { id: 'plan-2', name: 'Miro Business' },
        state: states[1] as Exclude<AccessRequestRecord['state'], 'DRAFT'>,
        termMonths: 4,
        routingMode: 'VIA_HEAD',
        latestReply: null,
      },
      {
        position: 3,
        requestId: 'req-3',
        plan: { id: 'plan-3', name: 'Notion Plus' },
        state: states[2] as Exclude<AccessRequestRecord['state'], 'DRAFT'>,
        termMonths: 5,
        routingMode: 'VIA_HEAD',
        latestReply: {
          kind: 'REQUESTER_RESUBMISSION',
          note: 'dùng cho dự án X, 3 tháng',
          author: { id: 'emp-1', name: 'Nguyen Van A' },
          createdAt: REPLY_TS,
        },
      },
    ],
  };
}

function makeRecord(id: string): AccessRequestRecord {
  return {
    id,
    organizationId: 'org-1',
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'PENDING',
    planId: 'plan-1',
    requesterEmployeeId: 'emp-1',
    departmentId: 'dept-1',
    costCenterId: 'cc-1',
    businessReason: 'Need license',
    termMonths: 3,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2026,
      expectedEndDate: null,
      amountMonths: 3,
      amount: { amountMinor: 1_500_000n, currency: 'VND' },
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      monthlyPriceMinor: 500_000n,
      billingCycle: 'MONTHLY',
      nextYearAmount: null,
    },
    policy: {
      version: 2,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
      slaWorkingDays: 3,
    },
    planLine: null,
    offPlan: false,
    expectedEndDate: null,
    submittedAt: TS,
    ticket: { id: '11111111-1111-4111-8111-111111111111', position: 1, itemCount: 3 },
    withdrawal: null,
    cancellation: null,
    serviceAccount: null,
    renewal: null,
    beneficiaryEmployeeIds: ['emp-1'],
    needStep: {
      id: `step-${id}`,
      state: 'PENDING',
      assigneeEmployeeId: 'head-1',
      routingRow: 1,
      waitingReason: null,
      samePersonAsSpend: false,
      slaWorkingDays: 3,
      createdAt: TS,
      assignedAt: TS,
      decidedAt: null,
    },
    needSteps: [],
    needDecision: null,
    lines: [],
  };
}

describe('RequestTicketViewService', () => {
  const actor = { employeeId: 'c1', roles: ['SPENDING_APPROVER'] } as unknown as AuthenticatedPrincipal;
  const runner = {
    run: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as unknown as TransactionRunner;
  const tickets = { view: jest.fn() };
  const requests = { findByIds: jest.fn() };
  const readAccess = { visibleItemIds: jest.fn() };
  const service = new RequestTicketViewService(
    runner,
    tickets as unknown as RequestTicketRepo,
    requests as unknown as AccessRequestRepo,
    readAccess as unknown as RequestReadAccessService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('throws RequestTicketNotFoundError when the ticket does not exist', async () => {
    tickets.view.mockResolvedValue(null);

    await expect(service.get(actor, 'missing')).rejects.toBeInstanceOf(RequestTicketNotFoundError);
    expect(requests.findByIds).not.toHaveBeenCalled();
  });

  it('throws RequestTicketNotFoundError when caller cannot view any item', async () => {
    tickets.view.mockResolvedValue(makeTicketView(['COMPLETED', 'REJECTED', 'AWAITING_SPEND_DECISION']));
    requests.findByIds.mockResolvedValue([makeRecord('req-1'), makeRecord('req-2'), makeRecord('req-3')]);
    readAccess.visibleItemIds.mockResolvedValue(new Set());

    await expect(service.get(actor, '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      RequestTicketNotFoundError,
    );
  });

  it('filters items to the 1 of 3 visible to the caller while deriving status across all 3 items', async () => {
    tickets.view.mockResolvedValue(makeTicketView(['COMPLETED', 'REJECTED', 'AWAITING_SPEND_DECISION']));
    requests.findByIds.mockResolvedValue([makeRecord('req-1'), makeRecord('req-2'), makeRecord('req-3')]);
    readAccess.visibleItemIds.mockResolvedValue(new Set(['req-3']));

    const ticket = await service.get(actor, '11111111-1111-4111-8111-111111111111');

    expect(ticket.status).toBe('IN_PROGRESS');
    expect(ticket.items).toHaveLength(1);
    expect(ticket.items[0]).toMatchObject({
      position: 3,
      requestId: 'req-3',
      latestReply: {
        kind: 'REQUESTER_RESUBMISSION',
        note: 'dùng cho dự án X, 3 tháng',
        createdAt: '2026-06-02T09:00:00.000Z',
      },
    });
  });

  it('returns status DONE when all items are in ended states even if only a subset is visible', async () => {
    tickets.view.mockResolvedValue(makeTicketView(['COMPLETED', 'REJECTED', 'REJECTED']));
    requests.findByIds.mockResolvedValue([makeRecord('req-1'), makeRecord('req-2'), makeRecord('req-3')]);
    readAccess.visibleItemIds.mockResolvedValue(new Set(['req-1']));

    const ticket = await service.get(actor, '11111111-1111-4111-8111-111111111111');

    expect(ticket.status).toBe('DONE');
    expect(ticket.items.map((item) => item.requestId)).toEqual(['req-1']);
  });
});
