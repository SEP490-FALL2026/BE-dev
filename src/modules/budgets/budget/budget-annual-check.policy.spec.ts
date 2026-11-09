import { annualCheck, versionLineOverCeiling } from './budget.policy';

describe('the annual check of the versions of a year (R-I06, QĐ-103i)', () => {
  const version = (costCenterId: string, number: number, total: bigint, currency = 'VND') => ({
    id: `${costCenterId}-${number}`,
    costCenterId,
    number,
    baseMinor: total - 10n,
    reserveMinor: 10n,
    currency,
  });
  const base = { cycleCurrency: 'VND', availableMinor: 100n };

  it('adds up the newest counted version of each Cost Center and the one being sent', () => {
    const counted = [version('a', 1, 30n), version('a', 2, 40n), version('b', 1, 20n)];

    expect(annualCheck({ ...base, counted, sending: version('c', 1, 40n) })).toEqual({ kind: 'OK', totalMinor: 100n });
  });

  it('puts the version being sent in the place of the counted one of its own Cost Center', () => {
    const counted = [version('a', 3, 90n), version('b', 1, 10n)];

    expect(annualCheck({ ...base, counted, sending: version('a', 4, 50n) })).toEqual({ kind: 'OK', totalMinor: 60n });
  });

  it('says by how much the versions go over, and how little is enough to be over', () => {
    expect(annualCheck({ ...base, counted: [version('a', 1, 60n)], sending: version('b', 1, 41n) })).toEqual({
      kind: 'OVER',
      gapMinor: 1n,
    });
  });

  it('names a version that is not in the currency of the cycle instead of adding it up', () => {
    expect(annualCheck({ ...base, counted: [version('a', 1, 10n, 'USD')], sending: version('b', 1, 10n) })).toEqual({
      kind: 'CURRENCY',
      currency: 'USD',
    });
  });
});

describe('G5-05 the over-the-ceiling flag a version line shows (AC-20, QĐ-109c)', () => {
  const line = (
    patch: Partial<{ lineType: 'RENEW' | 'CHANGE' | 'NEW' | 'CANCEL'; adjustmentReason: string | null }> = {},
  ) => ({
    lineType: 'NEW' as const,
    adjustmentReason: null,
    ...patch,
  });

  it('is the B3 flag of the proposal line while the version line is that line as it was', () => {
    expect(versionLineOverCeiling(line(), 30_000_000n)).toBe(30_000_000n);
    expect(versionLineOverCeiling(line(), null)).toBeNull();
  });

  it('is none once Finance changed the line (an adjustment reason) or made it a Cancel line', () => {
    expect(versionLineOverCeiling(line({ adjustmentReason: 'Cut to 0' }), 30_000_000n)).toBeNull();
    expect(versionLineOverCeiling(line({ lineType: 'CANCEL', adjustmentReason: 'Dropped' }), 30_000_000n)).toBeNull();
    expect(versionLineOverCeiling(line({ lineType: 'CANCEL' }), 30_000_000n)).toBeNull();
  });
});
