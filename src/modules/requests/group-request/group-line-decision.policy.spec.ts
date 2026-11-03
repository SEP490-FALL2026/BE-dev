import {
  checkLineNeedDecider,
  compareLines,
  needLineState,
  needRecordOf,
  needStepOf,
  lineSpendDecidedDetail,
  groupSpendDecidedDetail,
  refusalsWithoutReason,
  spendLineState,
  stepOutcomeOf,
  stepRefusalReason,
  verdictsOf,
  type LineDeciderFacts,
} from './group-line-decision.policy';

const facts: LineDeciderFacts = {
  actorEmployeeId: 'h1',
  requesterEmployeeId: 'e1',
  stepEmployeeIds: ['e1', 'e2', 'e3'],
  assigneeEmployeeId: 'h1',
  stepState: 'PENDING',
  termMonths: 6,
  approves: true,
  confirmed: false,
};

describe('who decides the lines of a step (US-05-17 AC-3, AC-16, US-05-04 AC-14)', () => {
  it('lets the person the step is given to decide it', () => {
    expect(checkLineNeedDecider(facts)).toBeNull();
  });

  it('lets a head named among the people of another step decide this one', () => {
    expect(checkLineNeedDecider({ ...facts, stepEmployeeIds: ['e2', 'e3'], requesterEmployeeId: 'e1' })).toBeNull();
  });

  it.each([
    ['the person who asked', { actorEmployeeId: 'e1', assigneeEmployeeId: 'e1' }, 'OWN_REQUEST'],
    ['a person of the lines of the step', { actorEmployeeId: 'e2', assigneeEmployeeId: 'e2' }, 'OWN_REQUEST'],
    ['somebody the step is not given to', { actorEmployeeId: 'x1' }, 'NOT_THE_ASSIGNEE'],
    ['anybody while the step waits for a holder', { assigneeEmployeeId: null }, 'NOT_THE_ASSIGNEE'],
    ['a step that was decided', { stepState: 'APPROVED' as const }, 'STEP_NOT_PENDING'],
    ['a long term nobody confirmed', { termMonths: 13 }, 'TERM_CONFIRMATION_REQUIRED'],
  ])('refuses %s', (_name, change, refusal) => {
    expect(checkLineNeedDecider({ ...facts, ...change })).toBe(refusal);
  });

  it('asks the confirmation of a long term only of a decision that approves somebody', () => {
    expect(checkLineNeedDecider({ ...facts, termMonths: 13, approves: false })).toBeNull();
    expect(checkLineNeedDecider({ ...facts, termMonths: 13, confirmed: true })).toBeNull();
  });
});

describe('that a decision covers the lines of the step and no others (US-05-17 AC-4)', () => {
  it('accepts every line named once, in any order', () => {
    expect(compareLines(['a', 'b', 'c'], ['c', 'a', 'b'])).toBeNull();
  });

  it('names the lines left out and the people added', () => {
    expect(compareLines(['a', 'b', 'c'], ['a'])).toEqual({ missing: ['b', 'c'], extra: [] });
    expect(compareLines(['a', 'b'], ['a', 'b', 'z'])).toEqual({ missing: [], extra: ['z'] });
    expect(compareLines(['a', 'b'], ['a', 'z'])).toEqual({ missing: ['b'], extra: ['z'] });
  });

  it('counts a line named twice as one too many', () => {
    expect(compareLines(['a', 'b'], ['a', 'b', 'a'])).toEqual({ missing: [], extra: ['a'] });
  });
});

describe('what a decision leads to', () => {
  const verdicts = [
    { employeeId: 'a', decision: 'APPROVE' as const },
    { employeeId: 'b', decision: 'REJECT' as const, reason: 'No longer needed' },
    { employeeId: 'c', decision: 'REJECT' as const, reason: '  ' },
    { employeeId: 'd', decision: 'REJECT' as const },
  ];

  it('names the people refused without a reason, blank ones included', () => {
    expect(refusalsWithoutReason(verdicts)).toEqual(['c', 'd']);
    expect(refusalsWithoutReason(verdicts.slice(0, 2))).toEqual([]);
  });

  it('approves the step when anybody goes on and refuses it when nobody does', () => {
    expect(stepOutcomeOf(verdicts)).toBe('APPROVED');
    expect(stepOutcomeOf(verdicts.slice(1))).toBe('REJECTED');
  });

  it('moves a line to the state its verdict leads to, at each stage', () => {
    expect(needLineState('APPROVE')).toBe('NEED_CONFIRMED');
    expect(needLineState('REJECT')).toBe('NEED_REJECTED');
    expect(spendLineState('APPROVE')).toBe('APPROVED');
    expect(spendLineState('REJECT')).toBe('SPEND_REJECTED');
  });

  it('keeps what was said of each refused person on the record of a step that refuses everybody', () => {
    expect(
      stepRefusalReason([
        { employeeId: 'a', decision: 'REJECT', reason: ' Too costly ' },
        { employeeId: 'b', decision: 'REJECT', reason: 'Not needed' },
      ]),
    ).toBe('Too costly; Not needed');
  });
});

describe('the step a person decides, and what they decided, in a request for a group (US-05-17)', () => {
  const step = (id: string, assigneeEmployeeId: string | null, state: string) => ({ id, assigneeEmployeeId, state });
  const steps = [step('s1', 'a', 'APPROVED'), step('s2', 'a', 'PENDING'), step('s3', 'b', 'PENDING')];

  it.each([
    ['the pending step they hold, before a decided one', 'a', 's2'],
    ['the step of their own line, when they hold none', 'c', 's3'],
    ['the first step, when they hold none and are in no line', 'd', 's1'],
  ])('is %s (needStepOf)', (_label, employeeId, expected) => {
    const lines = [{ employeeId: 'c', needStepId: 's3' }];

    expect(needStepOf(steps, lines, employeeId).id).toBe(expected);
  });

  it('is the first step they hold when none of theirs is pending (needStepOf)', () => {
    expect(needStepOf([step('s1', 'a', 'APPROVED'), step('s2', 'a', 'REJECTED')], [], 'a').id).toBe('s1');
  });

  it('answers the lines still waiting, in their order, with the verdict given for each (verdictsOf)', () => {
    const given = [
      { employeeId: 'p2', decision: 'REJECT' as const, reason: 'Không cần' },
      { employeeId: 'p1', decision: 'APPROVE' as const },
    ];

    expect(verdictsOf([{ employeeId: 'p1' }, { employeeId: 'p2' }], given)).toEqual([given[1], given[0]]);
  });

  it('records an approval with the confirmation of a long term, trimmed, and no reason (needRecordOf)', () => {
    const verdicts = [
      { employeeId: 'p1', decision: 'APPROVE' as const },
      { employeeId: 'p2', decision: 'REJECT' as const, reason: ' Không cần ' },
    ];

    expect(needRecordOf(verdicts, ' Cần 18 tháng ')).toEqual({
      decision: 'APPROVED',
      reason: null,
      termConfirmationReason: 'Cần 18 tháng',
    });
    expect(needRecordOf(verdicts, '  ').termConfirmationReason).toBeNull();
    expect(needRecordOf(verdicts, undefined).termConfirmationReason).toBeNull();
  });

  it('records a refusal of everybody with what was said of each, and no confirmation (needRecordOf)', () => {
    const verdicts = [
      { employeeId: 'p1', decision: 'REJECT' as const, reason: 'A' },
      { employeeId: 'p2', decision: 'REJECT' as const, reason: 'B' },
    ];

    expect(needRecordOf(verdicts, 'Cần 18 tháng')).toEqual({
      decision: 'REJECTED',
      reason: 'A; B',
      termConfirmationReason: null,
    });
  });
});

describe('what the audit says of a spend decision taken on the people of a group (US-05-17 AC-9, US-06-01 AC-15)', () => {
  const request = { id: 'req-1', requesterEmployeeId: 'sender' };
  const verdicts = [
    { employeeId: 'p1', decision: 'APPROVE' as const },
    { employeeId: 'p2', decision: 'REJECT' as const, reason: ' Hết ngân sách ' },
  ];

  it('says of each person whether they were approved, the reason of a refusal trimmed, and by whom', () => {
    expect(
      lineSpendDecidedDetail(request, 'step-1', verdicts[1], {
        actorEmployeeId: 'approver',
        deciderRole: 'SPENDING_APPROVER',
      }),
    ).toEqual({
      requestId: 'req-1',
      stepId: 'step-1',
      beneficiaryEmployeeId: 'p2',
      decision: 'REJECTED',
      decidedByEmployeeId: 'approver',
      deciderRole: 'SPENDING_APPROVER',
      reason: 'Hết ngân sách',
      requesterEmployeeId: 'sender',
    });
    expect(
      lineSpendDecidedDetail(request, 'step-1', verdicts[0], {
        actorEmployeeId: 'approver',
        deciderRole: 'SPENDING_APPROVER',
      }),
    ).toMatchObject({ decision: 'APPROVED', reason: null });
  });

  it('says of the whole decision what was checked, whether it was overridden and for which years, who was approved and who refused', () => {
    expect(
      groupSpendDecidedDetail(
        request,
        { id: 'step-1', samePersonAsSpend: false, noIndependentReview: true },
        {
          verdicts,
          checkId: 'check-1',
          override: { reason: 'Cần gấp', years: [2026, 2027] },
          decision: 'APPROVED',
          deciderRole: 'SPENDING_APPROVER',
        },
      ),
    ).toEqual({
      requestId: 'req-1',
      checkId: 'check-1',
      decision: 'APPROVED',
      deciderRole: 'SPENDING_APPROVER',
      override: true,
      overrideYears: '2026,2027',
      samePersonAsSpend: false,
      noIndependentReview: true,
      requestState: 'AWAITING_EXECUTION',
      lineCount: 2,
      approvedEmployeeIds: ['p1'],
      rejectedEmployeeIds: ['p2'],
    });
  });

  it('goes to REJECTED when nobody is approved, with no override', () => {
    expect(
      groupSpendDecidedDetail(
        request,
        { id: 'step-1', samePersonAsSpend: true, noIndependentReview: false },
        {
          verdicts: [verdicts[1]],
          checkId: null,
          override: null,
          decision: 'REJECTED',
          deciderRole: 'SPENDING_APPROVER',
        },
      ),
    ).toMatchObject({ requestState: 'REJECTED', override: false, overrideYears: '', checkId: null });
  });
});
