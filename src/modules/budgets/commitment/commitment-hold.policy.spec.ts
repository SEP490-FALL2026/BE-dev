import { checkHoldable } from './commitment-hold.policy';

describe('BR-MF1-07d, FR-5.8: what a commitment may hold', () => {
  const one = [{ year: 2026, amountMinor: 14_000n }];

  it('BR-MF1-07d: holds exactly one year, the current one, above nothing', () => {
    expect(checkHoldable({ items: one, currentYear: 2026 })).toBeNull();
  });

  it('INV-16: refuses two years, and none', () => {
    expect(checkHoldable({ items: [...one, { year: 2027, amountMinor: 1n }], currentYear: 2026 })).toBe(
      'MORE_THAN_ONE_YEAR',
    );
    expect(checkHoldable({ items: [], currentYear: 2026 })).toBe('MORE_THAN_ONE_YEAR');
  });

  it('FR-5.8a: refuses a year that is not the current one, the one before and the one after', () => {
    expect(checkHoldable({ items: [{ year: 2027, amountMinor: 1n }], currentYear: 2026 })).toBe('NOT_CURRENT_YEAR');
    expect(checkHoldable({ items: [{ year: 2025, amountMinor: 1n }], currentYear: 2026 })).toBe('NOT_CURRENT_YEAR');
  });

  it('INV-16: refuses an amount that is not above nothing', () => {
    expect(checkHoldable({ items: [{ year: 2026, amountMinor: 0n }], currentYear: 2026 })).toBe('NOT_POSITIVE');
    expect(checkHoldable({ items: [{ year: 2026, amountMinor: -5n }], currentYear: 2026 })).toBe('NOT_POSITIVE');
  });

  it('QĐ-106a: a request approved on 05/01 of the next year is held for that year (the year is the one of the day of the decision)', () => {
    expect(checkHoldable({ items: [{ year: 2027, amountMinor: 3n }], currentYear: 2027 })).toBeNull();
  });
});
