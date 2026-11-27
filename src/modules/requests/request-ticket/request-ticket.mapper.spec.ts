import { toRecord, type RequestRow } from '../access-request/access-request-record.mapper';
import { toTicketWire } from './request-ticket.mapper';
import type { RequestTicketView } from './request-ticket.types';

const BASE_DATE = new Date('2026-06-01T08:00:00.000Z');
const REPLY_DATE = new Date('2026-06-02T09:30:00.000Z');

function makeView(overrides: Partial<RequestTicketView> = {}): RequestTicketView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    requester: {
      employeeId: '22222222-2222-4222-8222-222222222222',
      employeeCode: 'E001',
      fullName: 'Nguyen Van A',
    },
    department: {
      id: '33333333-3333-4333-8333-333333333333',
      code: 'P-DES',
      name: 'Design',
    },
    submittedAt: BASE_DATE,
    items: [
      {
        position: 3,
        requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
        plan: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', name: 'Notion Plus' },
        state: 'AWAITING_SPEND_DECISION',
        termMonths: 6,
        routingMode: 'VIA_HEAD',
        latestReply: {
          kind: 'REQUESTER_RESUBMISSION',
          note: 'Added project context',
          author: { id: '22222222-2222-4222-8222-222222222222', name: 'Nguyen Van A' },
          createdAt: REPLY_DATE,
        },
      },
      {
        position: 1,
        requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        plan: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', name: 'Figma Org' },
        state: 'COMPLETED',
        termMonths: null,
        routingMode: 'VIA_HEAD',
        latestReply: null,
      },
      {
        position: 2,
        requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        plan: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', name: 'Miro Business' },
        state: 'REJECTED',
        termMonths: 3,
        routingMode: 'ONE_STEP',
        latestReply: null,
      },
    ],
    ...overrides,
  };
}

function makeRequestRow(over: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    organizationId: '00000000-0000-4000-8000-000000000001',
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'PENDING',
    routingMode: 'VIA_HEAD',
    oneStepReason: null,
    oneStepBlockedReason: null,
    limitExemption: null,
    replacesAssignmentId: null,
    planId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    requesterEmployeeId: '22222222-2222-4222-8222-222222222222',
    departmentId: '33333333-3333-4333-8333-333333333333',
    costCenterId: '44444444-4444-4444-8444-444444444444',
    businessReason: 'Need license',
    termMonths: 6,
    pricingStatus: 'PRICED',
    priceMissingReason: null,
    priceKind: 'RECURRING',
    budgetYear: 2026,
    amountMonths: 6,
    amountMinor: 3_000_000n,
    amountCurrency: 'VND',
    unitPriceMinor: 500_000n,
    monthlyPriceMinor: 500_000n,
    billingCycle: 'MONTHLY',
    expectedEndDate: null,
    nextYearAmountMinor: null,
    planLineVersionId: null,
    planLinePosition: null,
    planLineConfirmed: false,
    offPlan: false,
    policy: {
      version: 1,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
      slaWorkingDays: 3,
    },
    submittedAt: BASE_DATE,
    withdrawalRequestedAt: null,
    withdrawnByEmployeeId: null,
    withdrawalReason: null,
    withdrawnAt: null,
    cancelledAt: null,
    cancelledByEmployeeId: null,
    cancelCause: null,
    cancelNote: null,
    serviceAccount: null,
    renewal: null,
    ticketId: null,
    ticketPosition: null,
    ticket: null,
    beneficiaries: [{ employeeId: '22222222-2222-4222-8222-222222222222' }],
    steps: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        state: 'PENDING',
        assigneeEmployeeId: '66666666-6666-4666-8666-666666666666',
        routingRow: 1,
        waitingReason: null,
        samePersonAsSpend: false,
        slaWorkingDays: 3,
        createdAt: BASE_DATE,
        assignedAt: BASE_DATE,
        decidedAt: null,
        approvalRecord: null,
      },
    ],
    lines: [],
    ...over,
  };
}

describe('request-ticket.mapper', () => {
  it('orders items by position ascending and derives IN_PROGRESS / DONE via ticketStatusOf', () => {
    const inProgress = toTicketWire(makeView());

    expect(inProgress.status).toBe('IN_PROGRESS');
    expect(inProgress.submittedAt).toBe('2026-06-01T08:00:00.000Z');
    expect(inProgress.items.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(inProgress.items[2].latestReply).toEqual({
      kind: 'REQUESTER_RESUBMISSION',
      note: 'Added project context',
      author: { id: '22222222-2222-4222-8222-222222222222', name: 'Nguyen Van A' },
      createdAt: '2026-06-02T09:30:00.000Z',
    });

    const doneView = makeView({
      items: makeView().items.map((item) => (item.position === 3 ? { ...item, state: 'REJECTED' } : item)),
    });
    expect(toTicketWire(doneView).status).toBe('DONE');
  });

  it('filters hidden items when visibleRequestIds is given while keeping ticket-wide status (RB-11)', () => {
    const visible = new Set(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1']);
    const wire = toTicketWire(makeView(), visible);

    expect(wire.items).toHaveLength(1);
    expect(wire.items[0].requestId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
    expect(wire.status).toBe('IN_PROGRESS');
  });

  it('maps standalone request to ticket = null and ticket item to TicketRef in access-request-record.mapper (§7.1)', () => {
    const standalone = toRecord(makeRequestRow());
    expect(standalone.ticket).toBeNull();

    const item = toRecord(
      makeRequestRow({
        ticketId: '11111111-1111-4111-8111-111111111111',
        ticketPosition: 2,
        ticket: { _count: { items: 3 } },
      }),
    );
    expect(item.ticket).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      position: 2,
      itemCount: 3,
    });
  });
});
