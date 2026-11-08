import {
  baselineVersionRefusal,
  estimatedCost,
  monthlyUnitPrice,
  monthsRunning,
  shouldSuggestRenewal,
  subscriptionCost,
} from './baseline.policy';

describe('the baseline of the budget (R-I03)', () => {
  describe('the monthly price of a seat', () => {
    it('is the price as it is for a monthly cycle, a twelfth for an annual one and a third for a quarterly one', () => {
      expect(monthlyUnitPrice(1200n, 'MONTHLY')).toBe(1200n);
      expect(monthlyUnitPrice(1200n, 'ANNUAL')).toBe(100n);
      expect(monthlyUnitPrice(900n, 'QUARTERLY')).toBe(300n);
    });

    it('rounds half up to the minor unit', () => {
      expect(monthlyUnitPrice(1206n, 'ANNUAL')).toBe(101n);
      expect(monthlyUnitPrice(1205n, 'ANNUAL')).toBe(100n);
      expect(monthlyUnitPrice(1n, 'ANNUAL')).toBe(0n);
    });

    it('is unknown for a price not known or a cycle that is neither', () => {
      expect(monthlyUnitPrice(null, 'MONTHLY')).toBeNull();
      expect(monthlyUnitPrice(1200n, 'OTHER')).toBeNull();
      expect(monthlyUnitPrice(1200n, null)).toBeNull();
    });
  });

  describe('the months of the year a subscription runs', () => {
    it('is twelve with no end date, and for one that spans the year', () => {
      expect(monthsRunning(2027, null, null)).toBe(12);
      expect(monthsRunning(2027, '2026-03-05', '2028-03-04')).toBe(12);
    });

    it('stops with the month the term ends in, and starts with the month it begins in', () => {
      expect(monthsRunning(2027, '2026-01-01', '2027-06-30')).toBe(6);
      expect(monthsRunning(2027, '2027-10-15', null)).toBe(3);
      expect(monthsRunning(2027, '2027-03-01', '2027-03-31')).toBe(1);
    });

    it('is none for one that ended before the year or starts after it', () => {
      expect(monthsRunning(2027, '2025-01-01', '2026-12-31')).toBe(0);
      expect(monthsRunning(2027, '2028-01-01', null)).toBe(0);
    });
  });

  it('estimates seats × monthly price × months, and nothing when a figure is unknown', () => {
    expect(estimatedCost(10, 100n, 12)).toBe(12000n);
    expect(estimatedCost(10, 100n, 0)).toBe(0n);
    expect(estimatedCost(null, 100n, 12)).toBeNull();
    expect(estimatedCost(10, null, 12)).toBeNull();
  });

  it('suggests a renewal for a term that ends within the year only', () => {
    expect(shouldSuggestRenewal(2027, '2027-12-31')).toBe(true);
    expect(shouldSuggestRenewal(2027, '2028-01-01')).toBe(false);
    expect(shouldSuggestRenewal(2027, '2026-12-31')).toBe(false);
    expect(shouldSuggestRenewal(2027, null)).toBe(false);
  });
});

describe('the cost of one subscription over a year (R-I03)', () => {
  it('puts the monthly price, the months and the estimate together', () => {
    expect(
      subscriptionCost(2027, {
        purchasedQuantity: 10,
        unitPriceReportingMinor: 1200n,
        billingCycle: 'ANNUAL',
        startDate: '2026-01-01',
        endDate: '2027-06-30',
      }),
    ).toEqual({ monthlyMinor: 100n, months: 6, costMinor: 6000n });
  });
});

describe('when a version may be built from the baseline (QĐ-100h, R-I05)', () => {
  const ready = {
    cyclePublishedOnce: true,
    today: '2026-12-20',
    submissionDeadline: '2026-12-15',
    headsToday: false,
    headToCome: false,
    openProposal: false,
  };

  it('is allowed after the deadline for a department nobody heads, nobody is to head and nobody proposed for', () => {
    expect(baselineVersionRefusal(ready)).toBeNull();
  });

  it.each([
    ['the cycle was never published', { cyclePublishedOnce: false }, 'CYCLE_NOT_PUBLISHED'],
    ['it is the day of the deadline', { today: '2026-12-15' }, 'BEFORE_DEADLINE'],
    ['it is before the deadline', { today: '2026-12-01' }, 'BEFORE_DEADLINE'],
    ['somebody heads the department', { headsToday: true }, 'HAS_HEAD'],
    ['somebody is to head it (a successor, or a department of next year)', { headToCome: true }, 'HAS_SUCCESSOR'],
    ['a proposal waits or is being reviewed', { openProposal: true }, 'HAS_PROPOSAL'],
  ] as const)('is refused when %s', (_name, patch, expected) => {
    expect(baselineVersionRefusal({ ...ready, ...patch })).toBe(expected);
  });

  it('names the first thing that is wrong, in the order a person would fix it', () => {
    expect(baselineVersionRefusal({ ...ready, cyclePublishedOnce: false, headsToday: true })).toBe(
      'CYCLE_NOT_PUBLISHED',
    );
    expect(baselineVersionRefusal({ ...ready, headsToday: true, openProposal: true })).toBe('HAS_HEAD');
  });
});
