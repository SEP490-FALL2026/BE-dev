import { checkOutcome } from './renewal-outcome.policy';

describe('checkOutcome (US-11-03 AC-15, AC-18, US-11-05 AC-11, AC-12)', () => {
  const base = {
    outcome: 'AS_DECIDED' as const,
    decidedChoice: 'REDUCE' as const,
    decidedQuantity: 88,
    purchasedQuantity: 100,
    nextQuantity: 88,
  };

  it('passes when an outcome as decided matches the decided seats or keeps the bought seats for a renewal', () => {
    expect(checkOutcome(base)).toBeNull();
    expect(checkOutcome({ ...base, decidedChoice: 'RENEW', decidedQuantity: null, nextQuantity: 100 })).toBeNull();
    expect(checkOutcome({ ...base, decidedChoice: 'CANCEL', decidedQuantity: null, nextQuantity: null })).toBeNull();
  });

  it('refuses an outcome as decided with the wrong number of seats, no period or a period after a cancellation', () => {
    expect(checkOutcome({ ...base, nextQuantity: 90 })).toBe('OUTCOME_MISMATCH');
    expect(checkOutcome({ ...base, nextQuantity: null })).toBe('OUTCOME_MISMATCH');
    expect(checkOutcome({ ...base, decidedChoice: 'CANCEL', decidedQuantity: null, nextQuantity: 100 })).toBe(
      'OUTCOME_MISMATCH',
    );
  });

  it('lets any number through when the outcome is not as decided', () => {
    expect(
      checkOutcome({ ...base, outcome: 'DIFFERENT', decidedChoice: 'REDUCE', decidedQuantity: 88, nextQuantity: 100 }),
    ).toBeNull();
  });
});
