import {
  approvalDetailOf,
  approvalSummaryOf,
  budgetSnapshotOf,
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
      outcome: null,
      batchId: 'batch-1',
      routing: { mode: 'VIA_HEAD', oneStepReason: null },
    });
  });

  it('BR-MF1-02 shows one-step routing without the retired same-person flag', () => {
    const wire = approvalSummaryOf(
      row({ routingMode: 'ONE_STEP', oneStepReason: 'REQUESTER_IS_HEAD' }),
      lookups({ batches: new Map() }),
    );
    expect(wire).toMatchObject({ routing: { mode: 'ONE_STEP', oneStepReason: 'REQUESTER_IS_HEAD' }, batchId: null });
    expect(wire).not.toHaveProperty('samePersonAsSpend');
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
      budgetSnapshot: null,
      annualVendorAmount: null,
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
    });
    expect(wire.need).toEqual({ decidedBy: person('emp-4'), decidedAt: '2026-10-02T00:00:00.000Z', reason: null });
    expect([wire.assessment, wire.decision]).toEqual([null, null]);
  });

  it('BR-MF1-02 one-step detail has no need decision and no retired flags', () => {
    const original = facts();
    const wire = approvalDetailOf({
      ...original,
      request: {
        ...original.request,
        routing: { mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' },
        needDecision: null,
      },
    });
    expect(wire.routing).toEqual({ mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' });
    expect(wire.need).toBeNull();
    expect(wire.step).not.toHaveProperty('samePersonAsSpend');
    expect(wire.step).not.toHaveProperty('noIndependentReview');
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
          decidedByEmployeeId: 'emp-3',
          decidedAt: new Date('2026-10-03T00:00:00Z'),
        },
      }),
    );

    expect(wire.assessment).toMatchObject({ equivalentTool: { planId: 'plan-2', planName: 'Free' } });
    expect(wire.decision).toMatchObject({ decision: 'APPROVED', decidedBy: person('emp-3') });
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

describe('BR-MF1-07b: the budget snapshot of the spending approver', () => {
  const money = (minor: bigint) => ({ amount: minor.toString(), currency: 'VND' });
  const year = {
    year: 2026,
    costMinor: 30n,
    code: 'BUDGET_OK' as const,
    versionId: 'v-1',
    budgetMinor: 110n,
    baseMinor: 100n,
    reserveMinor: 10n,
    heldMinor: 20n,
    spentMinor: 40n,
    remainingMinor: 35n,
    remainingBaseMinor: 25n,
    remainingWithReserveMinor: 35n,
    shareBasisPoints: 8571,
    pendingMinor: 15n,
  };

  it('BR-MF1-07b: shows the base, the reserve, what is spent, held and waiting, what is left at the two levels, and how far over the base', () => {
    const snapshot = budgetSnapshotOf({
      year,
      outcome: 'USES_RESERVE',
      blockReasons: [],
      overBaseByMinor: 5n,
      overByMinor: null,
      decisionCheckId: null,
      computedAt: new Date('2026-10-05T01:00:00Z'),
      confirmation: {
        reason: 'Dự án gấp',
        confirmedByEmployeeId: 'emp-2',
        confirmedAt: new Date('2026-10-04T01:00:00Z'),
      },
      money,
      person,
    });

    expect(snapshot).toMatchObject({
      year: 2026,
      base: money(100n),
      reserve: money(10n),
      spent: money(40n),
      committed: money(20n),
      pending: money(15n),
      remainingBase: money(25n),
      remainingWithReserve: money(35n),
      outcome: 'USES_RESERVE',
      overBaseBy: money(5n),
      overBy: null,
      decisionSnapshotCheckId: null,
      reserveConfirmation: {
        reason: 'Dự án gấp',
        confirmedBy: person('emp-2'),
        confirmedAt: '2026-10-04T01:00:00.000Z',
      },
    });
  });

  it('BR-MF1-07b: a year with no approved version has no figure of a budget, which is not a budget of 0', () => {
    const snapshot = budgetSnapshotOf({
      year: {
        ...year,
        code: 'NO_ACTIVE_BUDGET',
        versionId: null,
        budgetMinor: null,
        baseMinor: null,
        reserveMinor: null,
        heldMinor: null,
        spentMinor: null,
        remainingMinor: null,
        remainingBaseMinor: null,
        remainingWithReserveMinor: null,
        shareBasisPoints: null,
      },
      outcome: 'BLOCKED',
      blockReasons: ['NO_APPROVED_BUDGET'],
      overBaseByMinor: null,
      overByMinor: null,
      decisionCheckId: 'check-1',
      computedAt: new Date('2026-10-05T01:00:00Z'),
      confirmation: null,
      money,
      person,
    });

    expect(snapshot).toMatchObject({
      base: null,
      remainingBase: null,
      blockedReasons: ['NO_APPROVED_BUDGET'],
      reserveConfirmation: null,
      decisionSnapshotCheckId: 'check-1',
    });
  });
});
