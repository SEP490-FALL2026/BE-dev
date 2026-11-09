import {
  checkDecider,
  checkRelease,
  executionPointOf,
  proposalIsStale,
  renewalDeciderOf,
  renewalWaitingReason,
  seatsToRelease,
} from './renewal-decision.policy';

describe('the decider of a renewal (QĐ-94d(2), QĐ-96g)', () => {
  it('is the head of the owner department, and nobody in their place', () => {
    expect(renewalDeciderOf('H1', 'IT1')).toEqual({ employeeId: 'H1', role: 'OWNER_DEPARTMENT_HEAD' });
  });

  it('is nobody when the head proposed the case: no substitute takes the place', () => {
    expect(renewalDeciderOf('H1', 'H1')).toEqual({ employeeId: null, role: 'OWNER_DEPARTMENT_HEAD' });
  });

  it('is nobody while the owner department has no head', () => {
    expect(renewalDeciderOf(null, 'IT1')).toEqual({ employeeId: null, role: 'OWNER_DEPARTMENT_HEAD' });
  });

  it('is what a case waits for: a head of the owner department, while it has none and the case waits to be confirmed', () => {
    expect(renewalWaitingReason('PROPOSED', null)).toBe('NO_HEAD');
    expect(renewalWaitingReason('PROPOSED', 'H1')).toBeNull();
    expect(renewalWaitingReason('DECIDED', null)).toBeNull();
    expect(renewalWaitingReason('OUTCOME_RECORDED', null)).toBeNull();
  });

  it('refuses anyone but the decider, never lets the proposer decide, and only a case that waits (SoD-3, US-11-02 AC-6)', () => {
    const base = { deciderEmployeeId: 'H1', proposerEmployeeId: 'IT1', waitingForDecision: true };
    expect(checkDecider({ ...base, actorEmployeeId: 'H1' })).toBeNull();
    for (const actor of ['IT1', 'F1', 'S1', 'C1', 'B1']) {
      expect(checkDecider({ ...base, actorEmployeeId: actor })).toBe('NOT_DECIDER');
    }
    expect(checkDecider({ ...base, actorEmployeeId: 'H1', proposerEmployeeId: 'H1' })).toBe('NOT_DECIDER');
    expect(checkDecider({ ...base, actorEmployeeId: 'H1', deciderEmployeeId: null })).toBe('NOT_DECIDER');
    expect(checkDecider({ ...base, actorEmployeeId: 'H1', waitingForDecision: false })).toBe('NOT_AWAITING_DECISION');
  });
});

describe('the execution point of a decision (QĐ-62k(i), US-11-02 AC-10, AC-19)', () => {
  const base = { baseDate: '2026-12-01', allowsMidTermReduction: false };

  it('is as planned up to the milestone and never voided after it', () => {
    expect(executionPointOf({ ...base, decidedOn: '2026-11-20' })).toEqual({
      afterDeadline: false,
      point: 'AS_PLANNED',
    });
    expect(executionPointOf({ ...base, decidedOn: '2026-12-01' })).toEqual({
      afterDeadline: false,
      point: 'AS_PLANNED',
    });
    expect(executionPointOf({ ...base, decidedOn: '2026-12-05' })).toEqual({
      afterDeadline: true,
      point: 'NEXT_RENEWAL',
    });
    expect(executionPointOf({ ...base, decidedOn: '2026-12-05', allowsMidTermReduction: true })).toEqual({
      afterDeadline: true,
      point: 'MID_TERM',
    });
  });
});

describe('the seats chosen when reducing below the seats in use (QĐ-66x, US-11-02 AC-13, AC-20)', () => {
  const offered = new Set(['a', 'b', 'c', 'd', 'e']);

  it('needs exactly the excess, all different, all offered', () => {
    expect(seatsToRelease('REDUCE', 88, 92)).toBe(4);
    expect(seatsToRelease('REDUCE', 88, 80)).toBe(0);
    expect(seatsToRelease('RENEW', null, 92)).toBe(0);
    expect(checkRelease({ required: 2, selected: ['a', 'b'], offered })).toBeNull();
    expect(checkRelease({ required: 2, selected: ['a'], offered })).toBe('EXCESS_SELECTION_INVALID');
    expect(checkRelease({ required: 2, selected: ['a', 'a'], offered })).toBe('EXCESS_SELECTION_INVALID');
    expect(checkRelease({ required: 2, selected: ['a', 'z'], offered })).toBe('EXCESS_SELECTION_INVALID');
    expect(checkRelease({ required: 0, selected: [], offered })).toBeNull();
    expect(checkRelease({ required: 0, selected: ['a'], offered })).toBe('EXCESS_SELECTION_INVALID');
  });

  it('is out of date at the confirmation when the seats still held are not exactly the excess of that day', () => {
    expect(proposalIsStale({ required: 1, stillHeld: 1 })).toBe(false);
    expect(proposalIsStale({ required: 1, stillHeld: 0 })).toBe(true);
    expect(proposalIsStale({ required: 2, stillHeld: 1 })).toBe(true);
    expect(proposalIsStale({ required: 0, stillHeld: 0 })).toBe(false);
  });
});
