import { approvalSummaryOf, type DetailFacts, type QueueLookups } from './spend-approval.mapper';

type Row = Parameters<typeof approvalSummaryOf>[0];

const person = (id: string) =>
  ({ id, code: `C-${id}`, fullName: `Name ${id}` }) as unknown as ReturnType<DetailFacts['person']>;

const row = (): Row =>
  ({
    id: 'step-1',
    requestId: 'req-1',
    createdAt: new Date('2026-10-01T02:00:00Z'),
    slaWorkingDays: 2,
    samePersonAsSpend: false,
    request: {
      type: 'GRANT',
      planId: 'plan-1',
      requesterEmployeeId: 'emp-1',
      beneficiaries: [{ employeeId: 'emp-2' }],
      costCenterId: 'cc-1',
      proposal: null,
      _count: { beneficiaries: 1 },
      amountMinor: 123456n,
      amountCurrency: 'VND',
      offPlan: false,
      routingMode: 'VIA_HEAD',
      oneStepReason: null,
    },
  }) as unknown as Row;

const lookups = (extra: Partial<QueueLookups> = {}): QueueLookups => ({
  checks: new Map(),
  batches: new Map([['req-1', 'batch-1']]),
  plans: [{ planId: 'plan-1', planName: 'Team', applicationName: 'Tool' }] as unknown as QueueLookups['plans'],
  people: new Map([
    ['emp-1', person('emp-1')],
    ['emp-2', person('emp-2')],
  ]),
  units: new Map([['VND', 0]]),
  centers: [{ id: 'cc-1', code: 'CC-01' }] as unknown as QueueLookups['centers'],
  due: new Map([['step-1', '2026-10-05']]),
  nextYear: new Map(),
  ticketRefs: new Map(),
  ...extra,
});

describe('spend-approval queue mapper ticketRef', () => {
  it('maps ticketRef as null for standalone requests and TicketRef for ticket items', () => {
    const standalone = approvalSummaryOf(row(), lookups());
    const ticketItem = approvalSummaryOf(
      row(),
      lookups({ ticketRefs: new Map([['req-1', { id: 'ticket-1', position: 3, itemCount: 5 }]]) }),
    );

    expect(standalone.ticketRef).toBeNull();
    expect(ticketItem.ticketRef).toEqual({ id: 'ticket-1', position: 3, itemCount: 5 });
  });
});
