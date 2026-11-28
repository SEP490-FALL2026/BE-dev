import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AccessRequestNotFoundError,
  AccessRequestWithdrawalRefusedError,
} from '../access-request/access-request.errors';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestTicketNotFoundError, RequestTicketNotRequesterError } from '../request-ticket/request-ticket.errors';
import { TicketWithdrawalService } from './ticket-withdrawal.service';

const TICKET_ID = '00000000-0000-4000-8000-000000000100';
const REQ_1 = '00000000-0000-4000-8000-000000000001';
const REQ_2 = '00000000-0000-4000-8000-000000000002';
const REQ_3 = '00000000-0000-4000-8000-000000000003';
const REQUESTER_ID = 'emp-requester';
const HEAD_ID = 'emp-head';
const OUTSIDER_ID = 'emp-outsider';

const actorOf = (employeeId: string, roles: string[] = ['EMPLOYEE']): AuthenticatedPrincipal => ({
  subject: `sub-${employeeId}`,
  appUserId: `user-${employeeId}`,
  sessionId: 'sess-1',
  employeeId,
  directRoles: roles,
  roles,
});

const recordOf = (id: string, over: Partial<AccessRequestRecord> = {}): AccessRequestRecord =>
  ({
    id,
    organizationId: 'org-1',
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'PENDING',
    planId: 'plan-1',
    requesterEmployeeId: REQUESTER_ID,
    beneficiaryEmployeeIds: [REQUESTER_ID],
    departmentId: 'dept-1',
    costCenterId: 'cc-1',
    businessReason: 'Work',
    termMonths: 6,
    needStep: {
      id: `step-${id}`,
      state: 'PENDING',
      assigneeEmployeeId: HEAD_ID,
      routingRow: 1,
      waitingReason: null,
      samePersonAsSpend: false,
      slaWorkingDays: 3,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      assignedAt: new Date('2026-06-01T00:00:00.000Z'),
      decidedAt: null,
    },
    needSteps: [
      {
        id: `step-${id}`,
        state: 'PENDING',
        assigneeEmployeeId: HEAD_ID,
        routingRow: 1,
        waitingReason: null,
        samePersonAsSpend: false,
        slaWorkingDays: 3,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        assignedAt: new Date('2026-06-01T00:00:00.000Z'),
        decidedAt: null,
        decision: null,
      },
    ],
    needDecision: null,
    withdrawal: null,
    cancellation: null,
    serviceAccount: null,
    renewal: null,
    lines: [],
    ticket: { id: TICKET_ID, position: 1, itemCount: 1 },
    ...over,
  }) as unknown as AccessRequestRecord;

function buildService(options: {
  ticketRequesterId?: string;
  items?: { requestId: string; position: number }[];
  records?: AccessRequestRecord[];
  latestById?: Record<string, AccessRequestRecord>;
  visibleError?: Error;
  withdraw?: jest.Mock;
}) {
  const byId = new Map<string, AccessRequestRecord>((options.records ?? []).map((r) => [r.id, r]));
  for (const [id, rec] of Object.entries(options.latestById ?? {})) byId.set(id, rec);
  const requests = { findById: jest.fn((id: string) => Promise.resolve(byId.get(id) ?? null)) };
  const readAccess = {
    visibleTicket: options.visibleError
      ? jest.fn().mockRejectedValue(options.visibleError)
      : jest.fn().mockResolvedValue({
          ticket: { id: TICKET_ID, requesterEmployeeId: options.ticketRequesterId ?? REQUESTER_ID },
          items: [...(options.items ?? [])].sort((a, b) => a.position - b.position),
          records: options.records ?? [],
          visibleIds: new Set((options.items ?? []).map((i) => i.requestId)),
        }),
  };
  const withdrawals = { withdraw: options.withdraw ?? jest.fn() };
  const service = new TicketWithdrawalService(readAccess as never, requests as never, withdrawals as never);
  return { service, requests, readAccess, withdrawals };
}

// W4-08
describe('TicketWithdrawalService', () => {
  it('throws RequestTicketNotFoundError when ticket has no items or caller cannot view any item', async () => {
    const { service, withdrawals } = buildService({ visibleError: new RequestTicketNotFoundError() });
    await expect(service.withdraw(actorOf(OUTSIDER_ID), TICKET_ID, {})).rejects.toThrow(RequestTicketNotFoundError);
    expect(withdrawals.withdraw).not.toHaveBeenCalled();
  });

  it('checks requester against request_tickets.requesterEmployeeId rather than records[0]', async () => {
    const { service, withdrawals } = buildService({
      ticketRequesterId: REQUESTER_ID,
      items: [{ requestId: REQ_1, position: 1 }],
      records: [recordOf(REQ_1, { requesterEmployeeId: HEAD_ID })],
    });

    await expect(service.withdraw(actorOf(HEAD_ID, ['MANAGER']), TICKET_ID, {})).rejects.toThrow(
      RequestTicketNotRequesterError,
    );
    expect(withdrawals.withdraw).not.toHaveBeenCalled();
  });

  it('throws RequestTicketNotRequesterError (403) when spending approver (C1) can view an item', async () => {
    const { service, withdrawals } = buildService({
      items: [{ requestId: REQ_1, position: 1 }],
      records: [recordOf(REQ_1, { state: 'AWAITING_SPEND_DECISION' })],
    });

    await expect(service.withdraw(actorOf('emp-c1', ['SPENDING_APPROVER']), TICKET_ID, {})).rejects.toThrow(
      RequestTicketNotRequesterError,
    );
    expect(withdrawals.withdraw).not.toHaveBeenCalled();
  });

  it('withdraws items in ascending ticket position order', async () => {
    const withdraw = jest.fn().mockResolvedValue(recordOf(REQ_1, { state: 'WITHDRAWN' }));
    const { service } = buildService({
      items: [
        { requestId: REQ_3, position: 3 },
        { requestId: REQ_1, position: 1 },
        { requestId: REQ_2, position: 2 },
      ],
      withdraw,
    });
    const actor = actorOf(REQUESTER_ID);

    const results = await service.withdraw(actor, TICKET_ID, { reason: 'No longer needed' });

    expect(withdraw).toHaveBeenNthCalledWith(1, actor, REQ_1, { reason: 'No longer needed' });
    expect(withdraw).toHaveBeenNthCalledWith(2, actor, REQ_2, { reason: 'No longer needed' });
    expect(withdraw).toHaveBeenNthCalledWith(3, actor, REQ_3, { reason: 'No longer needed' });
    expect(results).toEqual([
      { requestId: REQ_1, outcome: 'WITHDRAWN', reason: null },
      { requestId: REQ_2, outcome: 'WITHDRAWN', reason: null },
      { requestId: REQ_3, outcome: 'WITHDRAWN', reason: null },
    ]);
  });

  it('runs WithdrawalService per item and re-reads ALREADY_ENDED to return WITHDRAWN ALREADY_WITHDRAWN (§7.8 G)', async () => {
    const withdraw = jest
      .fn()
      .mockRejectedValueOnce(new AccessRequestWithdrawalRefusedError('ALREADY_ENDED'))
      .mockResolvedValueOnce(recordOf(REQ_2, { state: 'WITHDRAWN' }));
    const withdrawnByCaller = recordOf(REQ_1, {
      state: 'WITHDRAWN',
      withdrawal: {
        requestedAt: new Date('2026-06-01T08:00:00.000Z'),
        requestedByEmployeeId: REQUESTER_ID,
        reason: 'First withdraw',
        withdrawnAt: new Date('2026-06-01T08:00:00.000Z'),
      },
    });
    const { service, requests } = buildService({
      items: [
        { requestId: REQ_1, position: 1 },
        { requestId: REQ_2, position: 2 },
      ],
      records: [recordOf(REQ_1), recordOf(REQ_2)],
      latestById: { [REQ_1]: withdrawnByCaller },
      withdraw,
    });

    const results = await service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {});

    expect(withdraw).toHaveBeenCalledTimes(2);
    expect(requests.findById).toHaveBeenCalledWith(REQ_1);
    expect(results).toEqual([
      { requestId: REQ_1, outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' },
      { requestId: REQ_2, outcome: 'WITHDRAWN', reason: null },
    ]);
  });

  it.each([
    ['WITHDRAWAL_AFTER_DECISION', 'WITHDRAWAL_AFTER_DECISION'],
    ['ALREADY_ENDED', 'ALREADY_ENDED'],
    ['WITHDRAWAL_PENDING', 'WITHDRAWAL_PENDING'],
    ['GRANT_RUNNING', 'GRANT_RUNNING'],
    ['GRANT_COMPLETED', 'GRANT_COMPLETED'],
    ['REASON_REQUIRED', 'WITHDRAWAL_AFTER_DECISION'],
    ['NOT_REQUESTER', 'NOT_IN_TICKET'],
  ] as const)('maps AccessRequestWithdrawalRefusedError(%s) to SKIPPED %s', async (refusal, expectedReason) => {
    const withdraw = jest
      .fn()
      .mockRejectedValueOnce(new AccessRequestWithdrawalRefusedError(refusal))
      .mockResolvedValueOnce(recordOf(REQ_2, { state: 'WITHDRAWN' }));
    const { service } = buildService({
      items: [
        { requestId: REQ_1, position: 1 },
        { requestId: REQ_2, position: 2 },
      ],
      records: [recordOf(REQ_1), recordOf(REQ_2)],
      withdraw,
    });

    const results = await service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {});

    expect(results).toEqual([
      { requestId: REQ_1, outcome: 'SKIPPED', reason: expectedReason },
      { requestId: REQ_2, outcome: 'WITHDRAWN', reason: null },
    ]);
  });

  it('handles tickets where all items have ended (REJECTED / WITHDRAWN by caller / WITHDRAWN by other)', async () => {
    const withdraw = jest.fn().mockRejectedValue(new AccessRequestWithdrawalRefusedError('ALREADY_ENDED'));
    const { service } = buildService({
      items: [
        { requestId: REQ_1, position: 1 },
        { requestId: REQ_2, position: 2 },
        { requestId: REQ_3, position: 3 },
      ],
      records: [
        recordOf(REQ_1, { state: 'REJECTED' }),
        recordOf(REQ_2, {
          state: 'WITHDRAWN',
          withdrawal: {
            requestedAt: new Date('2026-06-01T08:00:00.000Z'),
            requestedByEmployeeId: REQUESTER_ID,
            reason: null,
            withdrawnAt: new Date('2026-06-01T08:00:00.000Z'),
          },
        }),
        recordOf(REQ_3, {
          state: 'WITHDRAWN',
          withdrawal: {
            requestedAt: new Date('2026-06-01T08:00:00.000Z'),
            requestedByEmployeeId: HEAD_ID,
            reason: 'Head withdrew from queue',
            withdrawnAt: new Date('2026-06-01T08:00:00.000Z'),
          },
        }),
      ],
      withdraw,
    });

    const results = await service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {});

    expect(withdraw).toHaveBeenCalledTimes(3);
    expect(results).toEqual([
      { requestId: REQ_1, outcome: 'SKIPPED', reason: 'ALREADY_ENDED' },
      { requestId: REQ_2, outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' },
      { requestId: REQ_3, outcome: 'SKIPPED', reason: 'ALREADY_ENDED' },
    ]);
  });

  it('maps TransientDatabaseError to RETRYABLE TRANSIENT_FAILURE and continues remaining items', async () => {
    const withdraw = jest
      .fn()
      .mockRejectedValueOnce(new TransientDatabaseError('40P01', new Error('deadlock')))
      .mockResolvedValueOnce(recordOf(REQ_2, { state: 'WITHDRAWN' }));
    const { service } = buildService({
      items: [
        { requestId: REQ_1, position: 1 },
        { requestId: REQ_2, position: 2 },
      ],
      records: [recordOf(REQ_1), recordOf(REQ_2)],
      withdraw,
    });

    const results = await service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {});

    expect(results).toEqual([
      { requestId: REQ_1, outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' },
      { requestId: REQ_2, outcome: 'WITHDRAWN', reason: null },
    ]);
  });

  it('maps AccessRequestNotFoundError during withdrawal to SKIPPED NOT_IN_TICKET', async () => {
    const withdraw = jest.fn().mockRejectedValueOnce(new AccessRequestNotFoundError());
    const { service } = buildService({ items: [{ requestId: REQ_1, position: 1 }], withdraw });
    const results = await service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {});
    expect(results).toEqual([{ requestId: REQ_1, outcome: 'SKIPPED', reason: 'NOT_IN_TICKET' }]);
  });

  it('rethrows unexpected non-transient errors', async () => {
    const withdraw = jest.fn().mockRejectedValueOnce(new Error('unexpected failure'));
    const { service } = buildService({ items: [{ requestId: REQ_1, position: 1 }], withdraw });
    await expect(service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {})).rejects.toThrow('unexpected failure');
  });
});
