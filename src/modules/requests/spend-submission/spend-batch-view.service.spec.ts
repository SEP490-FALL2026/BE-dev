import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RequestReplyRepo } from '../request-reply/request-reply.repo';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { SpendBatchRepo } from '../spend/spend-batch.repo';
import type { SpendRequestRepo } from '../spend/spend-request.repo';
import type { SpendWireViewService } from '../spend/spend-wire-view.service';
import { SpendBatchViewService } from './spend-batch-view.service';
import { SpendReplyFactsService } from './spend-reply-facts.service';

const BATCH = '0a1b2c3d-0000-4000-8000-0000000000b1';
const HEAD = 'head-employee';

const principal = (employeeId: string, roles: string[]): AuthenticatedPrincipal => ({
  subject: employeeId,
  appUserId: employeeId,
  sessionId: 's',
  employeeId,
  directRoles: roles,
  roles,
});

function build(
  heldBy: string[],
  items: {
    requestId: string;
    position: number;
    outcome: string;
    stopReason: string | null;
    leftReason: string | null;
    leftAt: Date | null;
  }[] = [],
  ticketRefs: Map<string, { id: string; position: number; itemCount: number }> = new Map(),
) {
  const record = {
    id: BATCH,
    organizationId: 'org',
    departmentId: 'dep',
    submittedByEmployeeId: HEAD,
    submittedAt: new Date('2026-11-05T02:00:00.000Z'),
    itemCount: 2,
  };
  const findById = jest.fn().mockResolvedValue(record);
  const heldByMock = jest.fn().mockResolvedValue(heldBy);
  const pageItems = jest.fn().mockResolvedValue({ items, total: items.length });
  const refsOf = jest.fn().mockResolvedValue(ticketRefs);
  const service = new SpendBatchViewService(
    { findById, heldBy: heldByMock, pageItems } as unknown as SpendBatchRepo,
    {
      statesOf: jest.fn().mockResolvedValue(new Map(items.map((item) => [item.requestId, 'AWAITING_SPEND_DECISION']))),
    } as unknown as SpendRequestRepo,
    { getDepartmentBrief: jest.fn().mockResolvedValue({ id: 'dep', code: 'ENG' }) } as unknown as OrganizationReadApi,
    {
      people: jest
        .fn()
        .mockResolvedValue(new Map([[HEAD, { employeeId: HEAD, employeeCode: 'NV-1', fullName: 'An Nguyen' }]])),
    } as unknown as SpendWireViewService,
    new SpendReplyFactsService(
      { refsOf } as unknown as RequestTicketRepo,
      { returnFactsOf: jest.fn() } as unknown as RequestReplyRepo,
    ),
  );

  return { service, heldBy: heldByMock, pageItems, refsOf };
}

describe('SpendBatchViewService: who reads a batch', () => {
  it('lets Finance read a batch it did not send and holds no step of, with every item', async () => {
    const { service, heldBy, pageItems } = build([]);
    const finance = principal('finance-employee', ['FINANCE']);

    await expect(service.get(finance, BATCH)).resolves.toMatchObject({ id: BATCH, itemCount: 2 });
    await service.items(finance, BATCH, { page: 1, pageSize: 20 });

    // No narrowing to the requests a reader holds: Finance reads them all.
    expect(pageItems).toHaveBeenCalledWith(BATCH, 0, 20, undefined);
    expect(heldBy).not.toHaveBeenCalled();
  });

  it('lets the head who sent it read all of it', async () => {
    const { service, pageItems } = build([]);

    await service.items(principal(HEAD, ['MANAGER']), BATCH, { page: 1, pageSize: 20 });

    expect(pageItems).toHaveBeenCalledWith(BATCH, 0, 20, undefined);
  });

  it('lets a person who holds a spend step of the batch read the requests they hold', async () => {
    const { service, pageItems } = build(['request-1']);

    await service.items(principal('approver', ['SPENDING_APPROVER']), BATCH, { page: 1, pageSize: 20 });

    expect(pageItems).toHaveBeenCalledWith(BATCH, 0, 20, ['request-1']);
  });

  it.each([['MANAGER'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN']])(
    'answers %s who has no part in the batch as if it did not exist',
    async (role) => {
      const { service } = build([]);
      const stranger = principal('stranger', [role]);

      await expect(service.get(stranger, BATCH)).rejects.toThrow();
      await expect(service.items(stranger, BATCH, { page: 1, pageSize: 20 })).rejects.toThrow();
    },
  );

  it('adds ticketRef for ticket items via one refsOf call and sets null for standalone requests (§7.4)', async () => {
    const ticketRef = { id: '0a1b2c3d-0000-4000-8000-000000000t01', position: 2, itemCount: 3 };
    const { service, refsOf } = build(
      [],
      [
        {
          requestId: 'req-1',
          position: 1,
          outcome: 'SENT_TO_APPROVER',
          stopReason: null,
          leftReason: null,
          leftAt: null,
        },
        {
          requestId: 'req-2',
          position: 2,
          outcome: 'SENT_TO_APPROVER',
          stopReason: null,
          leftReason: null,
          leftAt: null,
        },
      ],
      new Map([['req-1', ticketRef]]),
    );

    const result = await service.items(principal('finance-employee', ['FINANCE']), BATCH, { page: 1, pageSize: 20 });

    expect(refsOf).toHaveBeenCalledTimes(1);
    expect(refsOf).toHaveBeenCalledWith(['req-1', 'req-2']);
    expect(result.items[0]).toMatchObject({ requestId: 'req-1', ticketRef });
    expect(result.items[1]).toMatchObject({ requestId: 'req-2', ticketRef: null });
  });
});
