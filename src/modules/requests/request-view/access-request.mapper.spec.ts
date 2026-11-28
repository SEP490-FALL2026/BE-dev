import type { AccessRequestView } from './access-request-query.service';
import { toWire } from './access-request.mapper';

const TS = new Date('2026-06-01T08:00:00.000Z');
const REPLY_TS = new Date('2026-06-02T09:15:00.000Z');

function makeView(overrides: Partial<AccessRequestView> = {}): AccessRequestView {
  const person = {
    employeeId: '22222222-2222-4222-8222-222222222222',
    employeeCode: 'EMP-01',
    fullName: 'Nguyen Van A',
  };

  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'AWAITING_SPEND_DECISION',
    routing: { mode: 'VIA_HEAD', oneStepReason: null },
    plan: {
      planId: '33333333-3333-4333-8333-333333333333',
      planName: 'Miro Business',
      applicationId: '44444444-4444-4444-8444-444444444444',
      applicationName: 'Miro',
    },
    proposal: null,
    department: { id: '55555555-5555-4555-8555-555555555555', code: 'P-DES', name: 'Design' },
    costCenter: { id: '66666666-6666-4666-8666-666666666666', code: 'CC-DES' },
    requester: person,
    beneficiary: person,
    lineCount: 1,
    businessReason: 'Need license',
    termMonths: 4,
    expectedEndDate: null,
    spend: null,
    budgetYear: 2026,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      amount: { amount: '2000000', currency: 'VND' },
      unitPrice: { amount: '500000', currency: 'VND' },
      billingCycle: 'MONTHLY',
      kind: 'RECURRING',
      months: 4,
      monthlyPrice: { amount: '500000', currency: 'VND' },
      nextYearAmount: null,
    },
    cost: null,
    policy: { version: 2, hasSpendStep: true, slaWorkingDays: 3 },
    submittedAt: TS,
    ticketRef: null,
    latestReply: null,
    withdrawal: null,
    cancellation: null,
    serviceAccount: null,
    limitExemption: null,
    renewal: null,
    needStep: {
      id: '77777777-7777-4777-8777-777777777777',
      state: 'APPROVED',
      routingRow: 1,
      waitingReason: null,
      slaWorkingDays: 3,
      createdAt: TS,
      assignedAt: TS,
      decidedAt: TS,
      assignee: person,
    },
    needDecision: null,
    ...overrides,
  };
}

describe('access-request.mapper (toWire)', () => {
  it('maps standalone request with ticketRef: null and latestReply: null', () => {
    const wire = toWire(makeView());

    expect(wire.ticketRef).toBeNull();
    expect(wire.latestReply).toBeNull();
    expect(wire.submittedAt).toBe('2026-06-01T08:00:00.000Z');
  });

  it('maps ticketRef and serializes latestReply.createdAt to ISO string when present', () => {
    const ticketRef = { id: '88888888-8888-4888-8888-888888888888', position: 2, itemCount: 3 };
    const wire = toWire(
      makeView({
        ticketRef,
        latestReply: {
          kind: 'REQUESTER_RESUBMISSION',
          note: 'dùng cho dự án X, 3 tháng',
          author: { id: '22222222-2222-4222-8222-222222222222', name: 'Nguyen Van A' },
          createdAt: REPLY_TS,
        },
      }),
    );

    expect(wire.ticketRef).toEqual(ticketRef);
    expect(wire.latestReply).toEqual({
      kind: 'REQUESTER_RESUBMISSION',
      note: 'dùng cho dự án X, 3 tháng',
      author: { id: '22222222-2222-4222-8222-222222222222', name: 'Nguyen Van A' },
      createdAt: '2026-06-02T09:15:00.000Z',
    });
  });
});
