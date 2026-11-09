import {
  baselineVersionRefusal,
  estimatedCost,
  monthlyUnitPrice,
  monthsRunning,
  inOrderOf,
  listedDepartments,
  shouldSuggestRenewal,
  subscriptionCost,
  willRenew,
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

  describe('a subscription that runs today is renewed unless it was ordered to end (Q-162, F-068, F-098)', () => {
    const today = '2026-11-09';
    const running = { startDate: '2026-01-01', endDate: null };

    it.each([
      ['ends on 31 December', '2026-12-31'],
      ['ends at the end of January of the year after', '2027-01-31'],
      ['has no end date', null],
      ['ends within the year', '2027-06-30'],
    ])('is renewed when it %s', (_name, endDate) => {
      expect(willRenew(today, { ...running, endDate }, false)).toBe(true);
      expect(shouldSuggestRenewal(2027, today, { ...running, endDate }, false)).toBe(true);
    });

    it('is not renewed when it was ordered to end, nor proposed for renewal', () => {
      expect(willRenew(today, running, true)).toBe(false);
      expect(shouldSuggestRenewal(2027, today, { ...running, endDate: '2027-06-30' }, true)).toBe(false);
    });

    it('goes by the day it renews when it has no end date, and is not renewed once it is over', () => {
      expect(willRenew(today, { ...running, renewalDate: '2027-01-01' }, false)).toBe(true);
      expect(willRenew(today, { ...running, renewalDate: '2026-10-01' }, false)).toBe(false);
      expect(willRenew('2027-02-01', { ...running, endDate: '2026-12-31' }, false)).toBe(false);
    });

    it('does not count a subscription that has not started, but proposes it when it ends within the year', () => {
      const later = { startDate: '2027-03-01', endDate: '2027-12-31' };

      expect(willRenew(today, later, false)).toBe(false);
      expect(shouldSuggestRenewal(2027, today, later, false)).toBe(true);
      expect(shouldSuggestRenewal(2027, today, { ...later, endDate: '2028-01-01' }, false)).toBe(false);
    });
  });
});

describe('the cost of one subscription over a year (R-I03)', () => {
  const annual = {
    unitPriceReportingMinor: 1200n,
    billingCycle: 'ANNUAL',
    startDate: '2026-01-01',
    endDate: '2027-06-30',
  };

  it('puts the monthly price, the months and the estimate together, for the seats held and not the seats bought (F-066)', () => {
    // It runs and nobody ordered it to end: twelve months (Q-162), whatever its end date says.
    expect(subscriptionCost(2027, '2026-11-09', 6, annual)).toEqual({
      monthlyMinor: 100n,
      months: 12,
      costMinor: 7200n,
    });
    expect(subscriptionCost(2027, '2026-11-09', 0, annual)).toEqual({ monthlyMinor: 100n, months: 12, costMinor: 0n });
  });

  it('counts only the months that remain for one that was ordered to end (Q-162)', () => {
    expect(subscriptionCost(2027, '2026-11-09', 6, annual, true)).toEqual({
      monthlyMinor: 100n,
      months: 6,
      costMinor: 3600n,
    });
  });

  it('counts nothing for a term that is over when it is read', () => {
    expect(subscriptionCost(2027, '2027-02-01', 6, { ...annual, endDate: '2026-12-31' })).toEqual({
      monthlyMinor: 100n,
      months: 0,
      costMinor: 0n,
    });
  });

  it('has no estimate when the price is not known', () => {
    expect(subscriptionCost(2027, '2026-11-09', 6, { ...annual, unitPriceReportingMinor: null }).costMinor).toBeNull();
  });
});

describe('when a version may be built from the baseline (QĐ-100h, R-I05)', () => {
  const ready = {
    cyclePublishedOnce: true,
    inCycle: true,
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
    ['the department is not in the cycle', { inCycle: false }, 'DEPARTMENT_NOT_IN_CYCLE'],
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
    expect(baselineVersionRefusal({ ...ready, inCycle: false, today: '2026-12-01' })).toBe('DEPARTMENT_NOT_IN_CYCLE');
    expect(baselineVersionRefusal({ ...ready, headsToday: true, openProposal: true })).toBe('HAS_HEAD');
  });
});

describe('the departments a read lists', () => {
  const ids = Array.from({ length: 600 }, (_, index) => String(index).padStart(3, '0'));

  it('lists the first 500 by id, and the one that was asked for when it is among them', () => {
    expect(listedDepartments(ids, undefined)).toHaveLength(500);
    expect(listedDepartments(ids, undefined)[499]).toBe('499');
    expect(listedDepartments(ids, '123')).toEqual(['123']);
    expect(listedDepartments(ids, '550')).toEqual(['550']);
    expect(listedDepartments(ids, 'none')).toEqual([]);
  });

  it('puts what a read returned in the order of the ids, whatever order it came in', () => {
    expect(inOrderOf(['b', 'a', 'c'], [{ id: 'c' }, { id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'b' },
      { id: 'a' },
      { id: 'c' },
    ]);
  });
});
