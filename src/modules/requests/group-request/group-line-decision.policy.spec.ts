import {
  checkLineNeedDecider,
  compareLines,
  needLineState,
  refusalsWithoutReason,
  spendLineState,
  stepOutcomeOf,
  stepRefusalReason,
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
