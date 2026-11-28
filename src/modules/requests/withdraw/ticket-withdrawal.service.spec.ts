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
  items?: { requestId: string; position: number }[];
  records?: AccessRequestRecord[];
  visibleIds?: Set<string>;
  withdraw?: jest.Mock;
}) {
  const runner = {
    run: jest.fn((fn: (tx: unknown) => unknown) => fn({ name: 'tx' })),
  };
  const tickets = {
    itemsOf: jest.fn().mockResolvedValue(options.items ?? []),
  };
  const requests = {
    findByIds: jest.fn().mockResolvedValue(options.records ?? []),
  };
  const readAccess = {
    visibleItemIds: jest.fn().mockImplementation((actor: AuthenticatedPrincipal, records: AccessRequestRecord[]) => {
      if (options.visibleIds) return Promise.resolve(options.visibleIds);
      const visible = new Set<string>();
      for (const r of records) {
        if (r.requesterEmployeeId === actor.employeeId || r.needStep?.assigneeEmployeeId === actor.employeeId) {
          visible.add(r.id);
        }
      }
      return Promise.resolve(visible);
    }),
  };
  const withdrawals = {
    withdraw: options.withdraw ?? jest.fn(),
  };

  const service = new TicketWithdrawalService(
    runner as never,
    tickets as never,
    requests as never,
    readAccess as never,
    withdrawals as never,
  );

  return { service, runner, tickets, requests, readAccess, withdrawals };
}

describe('TicketWithdrawalService (W4-08)', () => {
  it('throws RequestTicketNotFoundError when the ticket has no items', async () => {
    const { service, withdrawals } = buildService({ items: [], records: [] });

    await expect(service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {})).rejects.toThrow(RequestTicketNotFoundError);
    expect(withdrawals.withdraw).not.toHaveBeenCalled();
  });

  it('throws RequestTicketNotFoundError when caller cannot view any item (no 403 leak)', async () => {
    const { service, withdrawals } = buildService({
      items: [{ requestId: REQ_1, position: 1 }],
      records: [recordOf(REQ_1)],
    });

    await expect(service.withdraw(actorOf(OUTSIDER_ID), TICKET_ID, {})).rejects.toThrow(RequestTicketNotFoundError);
    expect(withdrawals.withdraw).not.toHaveBeenCalled();
  });

  it('throws RequestTicketNotRequesterError when caller can view an item but is not the requester', async () => {
    const { service, withdrawals } = buildService({
      items: [
        { requestId: REQ_1, position: 1 },
        { requestId: REQ_2, position: 2 },
      ],
      records: [recordOf(REQ_1), recordOf(REQ_2)],
    });

    await expect(service.withdraw(actorOf(HEAD_ID, ['MANAGER']), TICKET_ID, {})).rejects.toThrow(
      RequestTicketNotRequesterError,
    );
    expect(withdrawals.withdraw).not.toHaveBeenCalled();
  });

  it('throws RequestTicketNotRequesterError (403) when spending approver (C1) can view an item via readAccess.visibleItemIds', async () => {
    const { service, withdrawals } = buildService({
      items: [{ requestId: REQ_1, position: 1 }],
      records: [recordOf(REQ_1, { state: 'AWAITING_SPEND_DECISION' })],
      visibleIds: new Set([REQ_1]),
    });

    await expect(service.withdraw(actorOf('emp-c1', ['SPENDING_APPROVER']), TICKET_ID, {})).rejects.toThrow(
      RequestTicketNotRequesterError,
    );
    expect(withdrawals.withdraw).not.toHaveBeenCalled();
  });

  it('withdraws items in ascending ticket position order even when repo returns them unsorted', async () => {
    const withdraw = jest
      .fn()
      .mockResolvedValueOnce(recordOf(REQ_1, { state: 'WITHDRAWN' }))
      .mockResolvedValueOnce(recordOf(REQ_2, { state: 'WITHDRAWN' }))
      .mockResolvedValueOnce(recordOf(REQ_3, { state: 'WITHDRAWN' }));
    const { service } = buildService({
      items: [
        { requestId: REQ_3, position: 3 },
        { requestId: REQ_1, position: 1 },
        { requestId: REQ_2, position: 2 },
      ],
      records: [recordOf(REQ_3), recordOf(REQ_1), recordOf(REQ_2)],
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

  it('returns WITHDRAWN ALREADY_WITHDRAWN without calling WithdrawalService when already withdrawn by caller', async () => {
    const withdraw = jest.fn().mockResolvedValueOnce(recordOf(REQ_2, { state: 'WITHDRAWN' }));
    const { service } = buildService({
      items: [
        { requestId: REQ_1, position: 1 },
        { requestId: REQ_2, position: 2 },
      ],
      records: [
        recordOf(REQ_1, {
          state: 'WITHDRAWN',
          withdrawal: {
            requestedAt: new Date('2026-06-01T08:00:00.000Z'),
            requestedByEmployeeId: REQUESTER_ID,
            reason: 'First withdraw',
            withdrawnAt: new Date('2026-06-01T08:00:00.000Z'),
          },
        }),
        recordOf(REQ_2),
      ],
      withdraw,
    });

    const results = await service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {});

    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(withdraw).toHaveBeenCalledWith(expect.objectContaining({ employeeId: REQUESTER_ID }), REQ_2, {});
    expect(results).toEqual([
      { requestId: REQ_1, outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' },
      { requestId: REQ_2, outcome: 'WITHDRAWN', reason: null },
    ]);
  });

  it.each([
    ['WITHDRAWAL_AFTER_DECISION'],
    ['ALREADY_ENDED'],
    ['WITHDRAWAL_PENDING'],
    ['GRANT_RUNNING'],
    ['GRANT_COMPLETED'],
  ] as const)('maps AccessRequestWithdrawalRefusedError(%s) to SKIPPED with same reason', async (reason) => {
    const withdraw = jest
      .fn()
      .mockRejectedValueOnce(new AccessRequestWithdrawalRefusedError(reason))
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
      { requestId: REQ_1, outcome: 'SKIPPED', reason },
      { requestId: REQ_2, outcome: 'WITHDRAWN', reason: null },
    ]);
  });

  it('handles tickets where all items have ended (ALREADY_ENDED vs ALREADY_WITHDRAWN by caller)', async () => {
    const withdraw = jest
      .fn()
      .mockRejectedValueOnce(new AccessRequestWithdrawalRefusedError('ALREADY_ENDED'))
      .mockRejectedValueOnce(new AccessRequestWithdrawalRefusedError('ALREADY_ENDED'));
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

    expect(withdraw).toHaveBeenCalledTimes(2);
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
    const { service } = buildService({
      items: [{ requestId: REQ_1, position: 1 }],
      records: [recordOf(REQ_1)],
      withdraw,
    });

    const results = await service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {});

    expect(results).toEqual([{ requestId: REQ_1, outcome: 'SKIPPED', reason: 'NOT_IN_TICKET' }]);
  });

  it('rethrows unexpected non-transient errors', async () => {
    const withdraw = jest.fn().mockRejectedValueOnce(new Error('unexpected failure'));
    const { service } = buildService({
      items: [{ requestId: REQ_1, position: 1 }],
      records: [recordOf(REQ_1)],
      withdraw,
    });

    await expect(service.withdraw(actorOf(REQUESTER_ID), TICKET_ID, {})).rejects.toThrow('unexpected failure');
  });
});
