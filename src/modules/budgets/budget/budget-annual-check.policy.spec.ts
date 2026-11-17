import { annualCheck } from './budget.policy';

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
