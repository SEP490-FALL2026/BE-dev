import {
  approvalDetailOf,
  approvalSummaryOf,
  detailPeopleIds,
  detailPlanIds,
  type DetailFacts,
  type QueueLookups,
} from './spend-approval.mapper';

type Row = Parameters<typeof approvalSummaryOf>[0];

const person = (id: string) =>
  ({ id, code: `C-${id}`, fullName: `Name ${id}` }) as unknown as ReturnType<DetailFacts['person']>;

const row = (request: Record<string, unknown> = {}): Row =>
  ({
    id: 'step-1',
    requestId: 'req-1',
    createdAt: new Date('2026-10-01T02:00:00Z'),
    slaWorkingDays: 2,
    samePersonAsSpend: false,
    noIndependentReview: true,
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
      ...request,
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
  ...extra,
});

describe('a row of the queue of the spending approver (US-06-01 AC-1)', () => {
  it('shows what the request is and what it costs, the amount in the units of its currency, and the batch it was sent in', () => {
    expect(approvalSummaryOf(row(), lookups())).toMatchObject({
      requestId: 'req-1',
      stepId: 'step-1',
      stepKind: 'SPEND_APPROVAL',
      openedAt: '2026-10-01T02:00:00.000Z',
      dueOn: '2026-10-05',
      plan: { planId: 'plan-1', planName: 'Team', applicationName: 'Tool' },
      softwareName: null,
      lineCount: 1,
      costCenter: { id: 'cc-1', code: 'CC-01' },
      amount: { amount: '123456', currency: 'VND' },
      primaryCode: null,
      noIndependentReview: true,
      batchId: 'batch-1',
    });
  });

  it('has no one person it is for when it is a group, no amount when it is not priced yet, and no plan for a proposal', () => {
    const summary = approvalSummaryOf(
      row({
        type: 'GROUP_GRANT',
        amountMinor: null,
        amountCurrency: null,
        planId: null,
        proposal: { softwareName: 'Lạ' },
      }),
      lookups({ batches: new Map() }),
    );

    expect(summary).toMatchObject({ beneficiary: null, amount: null, plan: null, softwareName: 'Lạ', batchId: null });
  });

  it.each([
    ['the requester is not found', { people: new Map() }],
    ['the person it is for is not found', { people: new Map([['emp-1', person('emp-1')]]) }],
    ['the Cost Center is not found', { centers: [] }],
    ['the deadline was not counted', { due: new Map() }],
  ])('refuses a step that points at a record that is missing: %s', (_label, missing) => {
    expect(() => approvalSummaryOf(row(), lookups(missing as Partial<QueueLookups>))).toThrow(
      /missing record|no deadline/,
    );
  });
});

describe('the spend step of one request and what surrounds it (US-06-01 AC-3, AC-9, AC-10, AC-14)', () => {
  const facts = (extra: Record<string, unknown> = {}): DetailFacts =>
    ({
      requestId: 'req-1',
      step: {
        id: 'step-1',
        state: 'PENDING',
        waitingReason: null,
        assigneeEmployeeId: 'emp-3',
        createdAt: new Date('2026-10-01T02:00:00Z'),
        decidedAt: null,
        slaWorkingDays: 2,
        samePersonAsSpend: false,
        noIndependentReview: false,
      },
      request: {
        state: 'AWAITING_SPEND_DECISION',
        type: 'GRANT',
        planId: 'plan-1',
        requesterEmployeeId: 'emp-1',
        beneficiaryEmployeeIds: ['emp-2'],
        businessReason: 'Cho dự án',
        termMonths: 6,
        pricing: { expectedSpendOn: '2026-11-01', budgetYear: 2026 },
        offPlan: false,
        planLine: null,
        needDecision: { decidedByEmployeeId: 'emp-4', decidedAt: new Date('2026-10-02T00:00:00Z'), reason: null },
      },
      decision: null,
      assessment: null,
      softwareName: null,
      plans: [
        { planId: 'plan-1', planName: 'Team', applicationName: 'Tool' },
        { planId: 'plan-2', planName: 'Free', applicationName: 'Other' },
      ],
      person,
      center: { id: 'cc-1', code: 'CC-01' },
      cost: null,
      latestBudgetInformation: null,
      ...extra,
    }) as unknown as DetailFacts;

  it('shows the step with who holds it, the request with its plan, the need that was confirmed, and nothing yet decided', () => {
    const wire = approvalDetailOf(facts());

    expect(wire.step).toMatchObject({ id: 'step-1', state: 'PENDING', decidedAt: null, assignee: person('emp-3') });
    expect(wire.request).toMatchObject({
      state: 'AWAITING_SPEND_DECISION',
      plan: { planId: 'plan-1', planName: 'Team', applicationName: 'Tool' },
      beneficiary: person('emp-2'),
      lineCount: 1,
      costCenter: { id: 'cc-1', code: 'CC-01' },
      planLineAttached: false,
    });
    expect(wire.need).toEqual({ decidedBy: person('emp-4'), decidedAt: '2026-10-02T00:00:00.000Z', reason: null });
    expect([wire.assessment, wire.decision]).toEqual([null, null]);
  });

  it('shows the assessment with the equivalent tool, and what was decided with who decided it', () => {
    const wire = approvalDetailOf(
      facts({
        assessment: {
          classification: 'EXTERNAL',
          controlLevel: 'FULL',
          controlRiskNote: null,
          dataSensitivity: 'LOW',
          equivalentPlanId: 'plan-2',
        },
        decision: {
          decision: 'APPROVED',
          reason: null,
          overrideReason: null,
          decidedByEmployeeId: 'emp-3',
          decidedAt: new Date('2026-10-03T00:00:00Z'),
          bySubstitute: false,
        },
      }),
    );

    expect(wire.assessment).toMatchObject({ equivalentTool: { planId: 'plan-2', planName: 'Free' } });
    expect(wire.decision).toMatchObject({ decision: 'APPROVED', decidedBy: person('emp-3'), bySubstitute: false });
  });

  it('has no assignee for a step nobody holds, and no one person it is for when it is a group', () => {
    const wire = approvalDetailOf(
      facts({
        step: { ...facts().step, assigneeEmployeeId: null },
        request: { ...facts().request, type: 'GROUP_GRANT' },
      }),
    );

    expect(wire.step.assignee).toBeNull();
    expect(wire.request.beneficiary).toBeNull();
  });
});

describe('what is looked up for the detail of one request (US-06-01 AC-3, AC-9)', () => {
  it('reads the plan of the request and the equivalent tool of its assessment, and nothing for a proposal without either', () => {
    expect(detailPlanIds({ planId: 'plan-1' }, { equivalentPlanId: 'plan-2' })).toEqual(['plan-1', 'plan-2']);
    expect(detailPlanIds({ planId: null }, { equivalentPlanId: 'plan-2' })).toEqual(['plan-2']);
    expect(detailPlanIds({ planId: 'plan-1' }, null)).toEqual(['plan-1']);
    expect(detailPlanIds({ planId: null }, { equivalentPlanId: null })).toEqual([]);
  });

  it('names the people of the step: who holds it, who sent it, who it is for, who confirmed the need and who decided the spend', () => {
    const request = {
      type: 'GRANT',
      requesterEmployeeId: 'emp-1',
      beneficiaryEmployeeIds: ['emp-2'],
      needDecision: { decidedByEmployeeId: 'emp-4' },
    };

    expect(detailPeopleIds({ assigneeEmployeeId: 'emp-3' }, request, { decidedByEmployeeId: 'emp-5' })).toEqual([
      'emp-3',
      'emp-1',
      'emp-2',
      'emp-4',
      'emp-5',
    ]);
    expect(
      detailPeopleIds({ assigneeEmployeeId: null }, { ...request, type: 'GROUP_GRANT', needDecision: null }, null),
    ).toEqual([null, 'emp-1', null, null, null]);
  });
});
