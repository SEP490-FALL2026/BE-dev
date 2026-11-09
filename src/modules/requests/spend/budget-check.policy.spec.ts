import { checkBudget, codesOf, wireRouteOf, type YearBudget, type YearSlice } from './budget-check.policy';

/** Base 100, reserve 10, spent 40, held 20 and 15 waiting to be decided: 25 left of the base and 35 with the reserve. */
const budget = (over: Partial<YearBudget> = {}): YearBudget => ({
  versionId: 'v-1',
  baseMinor: 100n,
  reserveMinor: 10n,
  heldMinor: 20n,
  spentMinor: 40n,
  ...over,
});

const check = (costMinor: bigint, slice: Partial<YearSlice> = {}, priceExpired = false) =>
  checkBudget({
    slice: { year: 2026, costMinor, budget: budget(), pendingMinor: 15n, ...slice },
    priceExpired,
  });

describe('the check of the budget of a request (BR-MF1-06e..g)', () => {
  describe('BR-MF1-06g: three outcomes on the base and the reserve of the approved version', () => {
    it.each([
      [25n, 'WITHIN_BASE', null],
      [26n, 'USES_RESERVE', 1n],
      [35n, 'USES_RESERVE', 10n],
    ] as const)('a cost of %s is %s, over the base by %s', (cost, outcome, overBase) => {
      const result = check(cost);

      expect(result.outcome).toBe(outcome);
      expect(result.overBaseByMinor).toBe(overBase);
      expect(result.blockReasons).toEqual([]);
      expect(result.route).toBe('SPEND_APPROVAL');
    });

    it('BR-MF1-06g: one more than what is left with the reserve is blocked, over the reserve by 1', () => {
      const result = check(36n);

      expect(result).toMatchObject({
        outcome: 'BLOCKED',
        blockReasons: ['OVER_RESERVE'],
        overBaseByMinor: 11n,
        overByMinor: 1n,
        route: 'BLOCKED',
      });
    });

    it('BR-MF1-06e: the two levels of what is left count what is spent, held and waiting, and the reserve is added for the second', () => {
      const [year] = check(1n).years;

      expect(year).toMatchObject({
        baseMinor: 100n,
        reserveMinor: 10n,
        spentMinor: 40n,
        heldMinor: 20n,
        pendingMinor: 15n,
        remainingBaseMinor: 25n,
        remainingWithReserveMinor: 35n,
        code: 'BUDGET_OK',
      });
    });
  });

  describe('BR-MF1-06g(3)(ii): the Cost Center has no approved version of the year', () => {
    it('is blocked with NO_APPROVED_BUDGET and has no figure of a budget (that is not a budget of 0)', () => {
      const result = check(1n, { budget: null });

      expect(result).toMatchObject({ outcome: 'BLOCKED', blockReasons: ['NO_APPROVED_BUDGET'], overByMinor: null });
      expect(result.years[0]).toMatchObject({
        code: 'NO_ACTIVE_BUDGET',
        baseMinor: null,
        remainingBaseMinor: null,
        pendingMinor: 15n,
      });
    });
  });

  describe('BR-MF1-06g(3)(iv), US-06-12 AC-9: the quote is no longer valid', () => {
    it('is blocked with PRICE_EXPIRED even when the money is there', () => {
      expect(check(10n, {}, true)).toMatchObject({ outcome: 'BLOCKED', blockReasons: ['PRICE_EXPIRED'] });
    });

    it('keeps every reason, the data first: the quote, then the budget', () => {
      expect(check(36n, {}, true).blockReasons).toEqual(['PRICE_EXPIRED', 'OVER_RESERVE']);
      expect(check(1n, { budget: null }, true).blockReasons).toEqual(['PRICE_EXPIRED', 'NO_APPROVED_BUDGET']);
    });
  });

  describe('BR-MF1-07f: what is left may be negative', () => {
    it('is blocked for a request of 1 when what is left with the reserve is already negative', () => {
      expect(check(1n, { budget: budget({ heldMinor: 60n }) })).toMatchObject({
        outcome: 'BLOCKED',
        blockReasons: ['OVER_RESERVE'],
      });
    });
  });

  describe('A5-2 (QĐ-109b): a request that costs nothing this year', () => {
    it('is within the base whatever is left, even when it is negative: nothing is deducted and it still reaches the approver', () => {
      const result = check(0n, { budget: budget({ heldMinor: 90n }) });

      expect(result).toMatchObject({
        outcome: 'WITHIN_BASE',
        blockReasons: [],
        overBaseByMinor: null,
        overByMinor: null,
      });
      expect(result.years[0].remainingWithReserveMinor).toBe(-35n);
      expect(result.route).toBe('SPEND_APPROVAL');
    });

    it('is still blocked when the year has no approved version, or the quote is no longer valid', () => {
      expect(check(0n, { budget: null }).blockReasons).toEqual(['NO_APPROVED_BUDGET']);
      expect(check(0n, {}, true).blockReasons).toEqual(['PRICE_EXPIRED']);
    });
  });

  describe('the codes a check carries', () => {
    it('gives the data first, then the code of the year', () => {
      expect(codesOf(check(36n, {}, true))).toEqual(['STALE_COST_EVIDENCE', 'INSUFFICIENT_BUDGET']);
      expect(codesOf(check(1n))).toEqual(['BUDGET_OK']);
    });
  });
});

describe('the route of a check on the wire: the review by Finance is gone (AUDIT §3)', () => {
  it('tells a check made before that went to Finance as the spend approval it led to, or as blocked', () => {
    expect(wireRouteOf('FINANCE_REVIEW', 'WITHIN_BASE')).toBe('SPEND_APPROVAL');
    expect(wireRouteOf('FINANCE_REVIEW', 'USES_RESERVE')).toBe('SPEND_APPROVAL');
    expect(wireRouteOf('FINANCE_REVIEW', 'BLOCKED')).toBe('BLOCKED');
  });

  it('keeps the two routes of today as they are', () => {
    expect(wireRouteOf('BLOCKED', 'BLOCKED')).toBe('BLOCKED');
    expect(wireRouteOf('SPEND_APPROVAL', 'USES_RESERVE')).toBe('SPEND_APPROVAL');
  });
});
