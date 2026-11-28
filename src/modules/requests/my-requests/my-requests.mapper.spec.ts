import { toMyRequestSummary, toSummary, type MyRequestLookups } from './my-requests.mapper';
import type { MyRequestRow } from './my-requests.types';

const row = (id = 'req-1'): MyRequestRow => ({
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
  needStepId: 'step-1',
  needStep: { state: 'PENDING', assigneeEmployeeId: 'head-1', waitingReason: null },
  withdrawal: null,
});

const lookups = (): MyRequestLookups => ({
  people: new Map([
    ['emp-1', { employeeId: 'emp-1', employeeCode: 'E-1', fullName: 'An' }],
    ['head-1', { employeeId: 'head-1', employeeCode: 'H-1', fullName: 'Binh' }],
  ]),
  plans: new Map([
    ['plan-1', { planId: 'plan-1', planName: 'Business', applicationId: 'app-1', applicationName: 'Figma' }],
  ]),
  softwareNames: new Map(),
  facts: {
    checks: new Map(),
    openSpendApproval: new Set(),
    spendRefusals: new Map(),
    needRefusals: new Map(),
    assessmentRefusals: new Map(),
  },
});

describe('my-requests mapper', () => {
  it('maps a standalone request with ticketRef: null and a ticket item with TicketRef', () => {
    const standalone = toMyRequestSummary(row('req-1'), 'emp-1', lookups(), null, null);
    const ticketItem = toMyRequestSummary(row('req-2'), 'emp-1', lookups(), null, {
      id: 'ticket-1',
      position: 2,
      itemCount: 3,
    });

    expect(standalone.ticketRef).toBeNull();
    expect(standalone.involvement).toBe('SENT');
    expect(ticketItem.ticketRef).toEqual({ id: 'ticket-1', position: 2, itemCount: 3 });
  });

  it('keeps toSummary without ticketRef for shared history callers', () => {
    const core = toSummary(row('req-1'), 'emp-1', lookups());

    expect(core).not.toHaveProperty('ticketRef');
  });
});
