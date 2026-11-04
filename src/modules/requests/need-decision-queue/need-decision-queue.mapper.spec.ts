import { needQueueItemOf, type NeedQueueLookups } from './need-decision-queue.mapper';
import type { NeedQueueRow } from './need-decision-queue.repo';

const person = (id: string) => ({ employeeId: id, employeeCode: `C-${id}`, fullName: `Name ${id}` });
const PAID = {
  version: 1,
  branch: 'PAID_IN_CATALOG',
  chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
  slaWorkingDays: 2,
};

const row = (over: { routingRow?: number; lines?: number; request?: Record<string, unknown> } = {}): NeedQueueRow =>
  ({
    id: 'step-1',
    requestId: 'req-1',
    createdAt: new Date('2026-10-01T02:00:00Z'),
    assignedAt: new Date('2026-10-02T02:00:00Z'),
    slaWorkingDays: 2,
    routingRow: over.routingRow ?? 1,
    samePersonAsSpend: false,
    _count: { lines: over.lines ?? 0 },
    request: {
      type: 'GRANT',
      planId: 'plan-1',
      departmentId: 'dep-1',
      requesterEmployeeId: 'emp-1',
      businessReason: 'The project needs a wiki',
      termMonths: 6,
      pricingStatus: 'PRICED',
      amountMinor: 123456n,
      amountCurrency: 'VND',
      policy: PAID,
      proposal: null,
      renewal: null,
      beneficiaries: [{ employeeId: 'emp-2' }],
      _count: { beneficiaries: 1 },
      ...over.request,
    },
  }) as unknown as NeedQueueRow;

const lookups = (extra: Partial<NeedQueueLookups> = {}): NeedQueueLookups => ({
  people: new Map([
    ['emp-1', person('emp-1')],
    ['emp-2', person('emp-2')],
  ]),
  plans: [{ planId: 'plan-1', planName: 'Team', applicationName: 'Wiki' }] as unknown as NeedQueueLookups['plans'],
  departments: [
    { id: 'dep-1', code: 'P-DES', name: 'Design', active: true, costCenterActive: true },
  ] as NeedQueueLookups['departments'],
  units: new Map([['VND', 0]]),
  due: new Map([['step-1', '2026-10-05']]),
  ...extra,
});

describe('a row of the queue of the need steps', () => {
  it('shows what the request is, how long the step may wait and what the head decides, with its own price and nothing of a budget', () => {
    const item = needQueueItemOf(row(), lookups());

    expect(item).toEqual({
      requestId: 'req-1',
      stepId: 'step-1',
      stepKind: 'NEED',
      deciderRole: 'MANAGER',
      type: 'GRANT',
      openedAt: '2026-10-01T02:00:00.000Z',
      assignedAt: '2026-10-02T02:00:00.000Z',
      slaWorkingDays: 2,
      dueOn: '2026-10-05',
      plan: { planId: 'plan-1', planName: 'Team', applicationName: 'Wiki' },
      softwareName: null,
      requester: person('emp-1'),
      beneficiary: person('emp-2'),
      lineCount: 1,
      department: { id: 'dep-1', code: 'P-DES', name: 'Design' },
      businessReasonExcerpt: 'The project needs a wiki',
      termMonths: 6,
      termConfirmationRequired: false,
      pricing: { status: 'PRICED', amount: { amount: '123456', currency: 'VND' } },
      planLineRequired: true,
      samePersonAsSpend: false,
    });
    expect(JSON.stringify(item)).not.toMatch(/remaining|committed|spent|held|primaryCode|toolset|standard/i);
  });

  it.each([
    [1, 'MANAGER'],
    [2, 'SPENDING_APPROVER'],
    [5, 'MANAGER'],
    [9, 'MANAGER'],
  ])('names the role of the holder from the row %i of the routing table: %s', (routingRow, role) => {
    expect(needQueueItemOf(row({ routingRow }), lookups()).deciderRole).toBe(role);
  });

  it('names no decider role for a row that gives the step to nobody (3, 4, 8): the queue does not carry such a step', () => {
    for (const routingRow of [3, 4, 8]) {
      expect(() => needQueueItemOf(row({ routingRow }), lookups())).toThrow(
        `The routing row ${routingRow} gives the step to nobody`,
      );
    }
  });

  it('asks the spending approver for no line of the plan, and the head of free software neither', () => {
    expect(needQueueItemOf(row({ routingRow: 2 }), lookups()).planLineRequired).toBe(false);
    const free = { policy: { ...PAID, chain: ['NEED', 'IT_EXECUTION'] }, amountMinor: null, amountCurrency: null };
    expect(needQueueItemOf(row({ request: free }), lookups()).planLineRequired).toBe(false);
  });

  it('has no one person it is for when it is a group, and counts the people still waiting on this step', () => {
    const group = { type: 'GROUP_GRANT', beneficiaries: [{ employeeId: 'emp-2' }], _count: { beneficiaries: 5 } };

    expect(needQueueItemOf(row({ lines: 3, request: group }), lookups())).toMatchObject({
      type: 'GROUP_GRANT',
      beneficiary: null,
      lineCount: 3,
    });
  });

  it('has no amount when the price is missing, and no plan for software that is not in the catalog yet', () => {
    const item = needQueueItemOf(
      row({
        request: {
          pricingStatus: 'MISSING',
          amountMinor: null,
          amountCurrency: null,
          planId: null,
          proposal: { softwareName: 'Lạ' },
        },
      }),
      lookups(),
    );

    expect(item).toMatchObject({ pricing: { status: 'MISSING', amount: null }, plan: null, softwareName: 'Lạ' });
  });

  it('asks the confirmation of a term over twelve months, and reads a renewal by the months the right runs on in all', () => {
    expect(needQueueItemOf(row({ request: { termMonths: 18 } }), lookups()).termConfirmationRequired).toBe(true);
    const renewal = { type: 'RENEWAL', termMonths: 3, renewal: { consecutiveMonths: 24 } };

    expect(needQueueItemOf(row({ request: renewal }), lookups())).toMatchObject({
      termMonths: 3,
      termConfirmationRequired: true,
    });
  });

  it('writes the amount in the minor units of its currency', () => {
    const dollars = row({ request: { amountMinor: 12345n, amountCurrency: 'USD' } });

    expect(needQueueItemOf(dollars, lookups({ units: new Map([['USD', 2]]) })).pricing.amount).toEqual({
      amount: '123.45',
      currency: 'USD',
    });
  });

  it('cuts a long reason to an excerpt', () => {
    const item = needQueueItemOf(row({ request: { businessReason: 'x'.repeat(500) } }), lookups());

    expect(item.businessReasonExcerpt).toHaveLength(201);
    expect(item.businessReasonExcerpt.endsWith('…')).toBe(true);
  });

  it('keeps a step that was never given a time without one', () => {
    const unassigned = { ...row(), assignedAt: null } as unknown as NeedQueueRow;

    expect(needQueueItemOf(unassigned, lookups()).assignedAt).toBeNull();
  });

  it.each([
    ['the requester is not found', { people: new Map() }],
    ['the person it is for is not found', { people: new Map([['emp-1', person('emp-1')]]) }],
    ['the department is not found', { departments: [] }],
    ['the deadline was not counted', { due: new Map() }],
  ])('refuses a step that points at a record that is missing: %s', (_label, missing) => {
    expect(() => needQueueItemOf(row(), lookups(missing as Partial<NeedQueueLookups>))).toThrow('missing record');
  });
});
