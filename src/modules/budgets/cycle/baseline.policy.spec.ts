import {
  baselineVersionRefusal,
  estimatedCost,
  monthsRunning,
  inOrderOf,
  listedDepartments,
  shouldSuggestRenewal,
  subscriptionCostByPlan,
  willRenew,
} from './baseline.policy';

describe('the baseline of the budget (R-I03)', () => {
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

    it('BR-MF4-04: does not renew when the end date is before today (C4-04: willRenew hết hôm nay)', () => {
      const endedYesterday = { startDate: '2026-01-01', endDate: '2026-11-08', renewalDate: null, hasSuccessor: false };
      expect(willRenew(today, endedYesterday, false)).toBe(false);
      // shouldSuggestRenewal checks if it ends within the year — 11-08 is in 2026
      expect(shouldSuggestRenewal(2026, today, endedYesterday, false)).toBe(true);
      // But year 2025 would not suggest it
      expect(shouldSuggestRenewal(2025, today, endedYesterday, false)).toBe(false);
    });
  });
});

describe('the cost of one subscription over a year (R-I03, W3-02)', () => {
  /** One plan on the period, priced as the period is: what a period with a single plan costs. */
  const subscriptionCost = (
    year: number,
    today: string,
    seats: number,
    subscription: Parameters<typeof subscriptionCostByPlan>[4] & { monthlyPriceMinor: bigint | null },
    terminated = false,
  ) => {
    const monthlyMinor = subscription.monthlyPriceMinor;

    return {
      monthlyMinor,
      ...subscriptionCostByPlan(year, today, new Map([['plan', seats]]), () => monthlyMinor, subscription, terminated),
    };
  };

  const annual = {
    monthlyPriceMinor: 100n,
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

  it('W3-02: 2 idle seats at 375.000/month renewed for a full year cost 9.000.000 without re-dividing or rounding', () => {
    expect(
      subscriptionCost(2027, '2026-11-09', 2, {
        monthlyPriceMinor: 375_000n,
        startDate: '2026-01-01',
        endDate: null,
      }),
    ).toEqual({
      monthlyMinor: 375_000n,
      months: 12,
      costMinor: 9_000_000n,
    });
    // Non-round monthly minor price (83.333) is used directly rather than dividing 1.000.001 / 12 again.
    expect(
      subscriptionCost(2027, '2026-11-09', 1, {
        monthlyPriceMinor: 83_333n,
        startDate: '2026-01-01',
        endDate: null,
      }),
    ).toEqual({
      monthlyMinor: 83_333n,
      months: 12,
      costMinor: 999_996n,
    });
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
    expect(subscriptionCost(2027, '2026-11-09', 6, { ...annual, monthlyPriceMinor: null }).costMinor).toBeNull();
  });

  it('BR-MF4-04: estimates cost with 3 cases (C4-04)', () => {
    // Case 1: renewed 12 months
    expect(subscriptionCost(2027, '2026-11-09', 1, annual)).toEqual({
      monthlyMinor: 100n,
      months: 12,
      costMinor: 1200n,
    });
    // Case 2: ordered to end (months remaining)
    expect(subscriptionCost(2027, '2026-11-09', 2, annual, true)).toEqual({
      monthlyMinor: 100n,
      months: 6, // From Nov 2026 to June 2027 (where annual ends)
      costMinor: 1200n,
    });
    // Case 3: ends today (willRenew = false, 6 months June to Nov)
    const endsToday = {
      ...annual,
      endDate: '2026-11-09',
      startDate: '2026-06-01',
      hasSuccessor: false,
    };
    expect(subscriptionCost(2026, '2026-11-09', 3, endsToday, true)).toEqual({
      monthlyMinor: 100n,
      months: 6, // June to Nov (6 months)
      costMinor: 1800n, // 3 seats × 100 × 6 months
    });
  });
});

describe('when a version may be built from the baseline (QĐ-100h, R-I05)', () => {
  const ready = {
    cycleOpen: true,
    inCycle: true,
    today: '2026-12-20',
    submissionDeadline: '2026-12-15',
    openProposal: false,
  };

  it('is allowed after the deadline for a department nobody proposed for, whoever heads it, or is to head it (QĐ-111bb: a head that did not submit, or a department made after the deadline)', () => {
    expect(baselineVersionRefusal(ready)).toBeNull();
  });

  it.each([
    ['the cycle is not open (a draft)', { cycleOpen: false }, 'CYCLE_NOT_OPEN'],
    ['the department is not in the cycle', { inCycle: false }, 'DEPARTMENT_NOT_IN_CYCLE'],
    ['it is the day of the deadline', { today: '2026-12-15' }, 'BEFORE_DEADLINE'],
    ['it is before the deadline', { today: '2026-12-01' }, 'BEFORE_DEADLINE'],
    ['a proposal waits or is being reviewed', { openProposal: true }, 'HAS_PROPOSAL'],
  ] as const)('is refused when %s', (_name, patch, expected) => {
    expect(baselineVersionRefusal({ ...ready, ...patch })).toBe(expected);
  });

  it('names the first thing that is wrong, in the order a person would fix it', () => {
    expect(baselineVersionRefusal({ ...ready, cycleOpen: false, openProposal: true })).toBe('CYCLE_NOT_OPEN');
    expect(baselineVersionRefusal({ ...ready, inCycle: false, today: '2026-12-01' })).toBe('DEPARTMENT_NOT_IN_CYCLE');
    expect(baselineVersionRefusal({ ...ready, today: '2026-12-01', openProposal: true })).toBe('BEFORE_DEADLINE');
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

describe('the cost of a period with several plans (W3-08, B-1)', () => {
  const period = { startDate: '2026-01-01', endDate: null };
  const prices = new Map<string, bigint | null>([
    ['standard', 500_000n],
    ['premium', 800_000n],
    ['none', null],
  ]);
  const priceOf = (planId: string) => prices.get(planId) ?? null;

  it('charges each seat the price of its own plan: one Standard and one Premium seat run twelve months at 500.000 + 800.000', () => {
    const seats = new Map([
      ['standard', 1],
      ['premium', 1],
    ]);

    expect(subscriptionCostByPlan(2027, '2026-11-09', seats, priceOf, period)).toEqual({
      months: 12,
      costMinor: 15_600_000n,
    });
  });

  it('counts only the months it runs when the company ordered it to end', () => {
    const seats = new Map([['premium', 2]]);

    expect(
      subscriptionCostByPlan(2027, '2026-11-09', seats, priceOf, { ...period, endDate: '2027-03-31' }, true),
    ).toEqual({
      months: 3,
      costMinor: 4_800_000n,
    });
  });

  it('knows no cost when a plan that has seats has no price, however priced the others are', () => {
    const seats = new Map([
      ['standard', 1],
      ['none', 1],
    ]);

    expect(subscriptionCostByPlan(2027, '2026-11-09', seats, priceOf, period).costMinor).toBeNull();
  });
});
