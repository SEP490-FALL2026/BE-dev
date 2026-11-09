import { budgetYearLockKey } from './budget-year-lock-key.policy';

describe('budgetYearLockKey', () => {
  it('names the Cost Center and the year, so the same pair always contends on the same lock', () => {
    expect(budgetYearLockKey('c0000000-0000-4000-8000-000000000001', 2026)).toBe(
      'budget-year:c0000000-0000-4000-8000-000000000001:2026',
    );
  });

  it('differs for another year and for another Cost Center', () => {
    const base = budgetYearLockKey('cc-1', 2026);
    expect(budgetYearLockKey('cc-1', 2027)).not.toBe(base);
    expect(budgetYearLockKey('cc-2', 2026)).not.toBe(base);
  });
});
