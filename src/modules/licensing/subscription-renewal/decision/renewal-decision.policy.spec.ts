import {
  checkChoice,
  checkDecider,
  checkRelease,
  executionPointOf,
  needsChargeableOwner,
  renewalDeciderOf,
  seatsToRelease,
} from './renewal-decision.policy';

const holders = { spendingApproverEmployeeId: 'C1', conflictSubstituteEmployeeId: 'S1' };

describe('the decider of a renewal (FR-3.13, FR-3.15)', () => {
  it('is the spending approver, or the substitute when the approver proposed the case', () => {
    expect(renewalDeciderOf(holders, 'IT1')).toEqual({ employeeId: 'C1', role: 'SPENDING_APPROVER' });
    expect(renewalDeciderOf(holders, 'C1')).toEqual({ employeeId: 'S1', role: 'CONFLICT_SUBSTITUTE' });
    expect(renewalDeciderOf({ spendingApproverEmployeeId: null, conflictSubstituteEmployeeId: null }, 'IT1')).toEqual({
      employeeId: null,
      role: 'SPENDING_APPROVER',
    });
  });

  it('refuses anyone but the decider, never lets the proposer decide, and only a case that waits (SoD-3, US-11-02 AC-6)', () => {
    const base = { deciderEmployeeId: 'C1', proposerEmployeeId: 'IT1', waitingForDecision: true };
    expect(checkDecider({ ...base, actorEmployeeId: 'C1' })).toBeNull();
    for (const actor of ['IT1', 'F1', 'S1', 'H1', 'B1']) {
      expect(checkDecider({ ...base, actorEmployeeId: actor })).toBe('NOT_DECIDER');
    }
    expect(checkDecider({ ...base, actorEmployeeId: 'C1', proposerEmployeeId: 'C1' })).toBe('NOT_DECIDER');
    expect(checkDecider({ ...base, actorEmployeeId: 'C1', deciderEmployeeId: null })).toBe('NOT_DECIDER');
    expect(checkDecider({ ...base, actorEmployeeId: 'C1', waitingForDecision: false })).toBe('NOT_AWAITING_DECISION');
  });
});

describe('the choice of a renewal', () => {
  const base = { purchasedQuantity: 100, withinCurrentTerm: false, allowsMidTermReduction: false };

  it('lets a reduction name fewer seats than bought and the others none', () => {
    expect(checkChoice({ ...base, choice: 'REDUCE', quantity: 88 })).toBeNull();
    expect(checkChoice({ ...base, choice: 'REDUCE', quantity: 0 })).toBeNull();
    expect(checkChoice({ ...base, choice: 'REDUCE', quantity: 100 })).toBe('QUANTITY_INVALID');
    expect(checkChoice({ ...base, choice: 'REDUCE', quantity: null })).toBe('QUANTITY_INVALID');
    expect(checkChoice({ ...base, choice: 'RENEW', quantity: null })).toBeNull();
    expect(checkChoice({ ...base, choice: 'CANCEL', quantity: 5 })).toBe('QUANTITY_INVALID');
  });

  it('carries a reduction out within the paid period only where the subscription allows it', () => {
    expect(checkChoice({ ...base, choice: 'REDUCE', quantity: 8, withinCurrentTerm: true })).toBe(
      'MID_TERM_NOT_ALLOWED',
    );
    expect(
      checkChoice({ ...base, choice: 'REDUCE', quantity: 8, withinCurrentTerm: true, allowsMidTermReduction: true }),
    ).toBeNull();
    expect(checkChoice({ ...base, choice: 'RENEW', quantity: null, withinCurrentTerm: true })).toBe(
      'MID_TERM_NOT_ALLOWED',
    );
  });
});

describe('the execution point of a decision (QĐ-62k(i), US-11-02 AC-10, AC-19)', () => {
  const base = { baseDate: '2026-12-01', allowsMidTermReduction: false, withinCurrentTerm: false };

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

  it('is mid-term for a reduction asked within the paid period, whenever decided', () => {
    expect(executionPointOf({ ...base, decidedOn: '2026-11-20', withinCurrentTerm: true }).point).toBe('MID_TERM');
  });
});

describe('the finance gate of a decision (QĐ-88a, QĐ-89d, US-11-02 AC-22)', () => {
  it('asks a Cost Center only of what owes more into a new period', () => {
    expect(needsChargeableOwner({ choice: 'RENEW', quantity: null, withinCurrentTerm: false })).toBe(true);
    expect(needsChargeableOwner({ choice: 'REDUCE', quantity: 8, withinCurrentTerm: false })).toBe(true);
    expect(needsChargeableOwner({ choice: 'REDUCE', quantity: 0, withinCurrentTerm: false })).toBe(false);
    expect(needsChargeableOwner({ choice: 'REDUCE', quantity: 8, withinCurrentTerm: true })).toBe(false);
    expect(needsChargeableOwner({ choice: 'CANCEL', quantity: null, withinCurrentTerm: false })).toBe(false);
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
});
