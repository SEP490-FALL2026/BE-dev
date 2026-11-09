import { checkBudget, codesOf, type YearBudget, type YearSlice } from './budget-check.policy';

const M = 1_000_000n;

const budget = (over: Partial<YearBudget> = {}): YearBudget => ({
  versionId: 'v1',
  totalMinor: 100n * M,
  heldMinor: 20n * M,
  spentMinor: 40n * M,
  ...over,
});
const slice = (costMinor: bigint, over: Partial<YearSlice> = {}): YearSlice => ({
  year: 2026,
  costMinor,
  closed: false,
  budget: budget(),
  pendingMinor: 0n,
  ...over,
});
const check = (slices: YearSlice[], over: { staleCostEvidence?: boolean; planLineOverdue?: boolean } = {}) =>
  checkBudget({ slices, staleCostEvidence: false, planLineOverdue: false, ...over });

describe('the check of the budget of a request (US-06-12)', () => {
  it('is BUDGET_OK under the share and under what is left, and goes to the spending approver (AC-1)', () => {
    const result = check([slice(15n * M)]);

    expect(result.route).toBe('SPEND_APPROVAL');
    expect(result.years[0]).toMatchObject({ code: 'BUDGET_OK', remainingMinor: 40n * M, shareBasisPoints: 3750 });
    expect(codesOf(result)).toEqual(['BUDGET_OK']);
  });

  it('is BUDGET_OK however large the share of what is left, as long as the money is there: no route by size (AC-2, B-M1, QĐ-97c)', () => {
    const result = check([slice(25n * M)]);

    expect(result.years[0].code).toBe('BUDGET_OK');
    expect(result.years[0].shareBasisPoints).toBe(6250);
    expect(result.route).toBe('SPEND_APPROVAL');
    // Up to the last unit that is left.
    expect(check([slice(40n * M)]).years[0].code).toBe('BUDGET_OK');
    expect(check([slice(40n * M + 1n)]).years[0].code).toBe('INSUFFICIENT_BUDGET');
  });

  it('is INSUFFICIENT_BUDGET over what is left, and that is not a hard stop: it goes to Finance (AC-4)', () => {
    const result = check([slice(45n * M)]);

    expect(result.years[0].code).toBe('INSUFFICIENT_BUDGET');
    expect(result.route).toBe('FINANCE_REVIEW');
  });

  it('is INSUFFICIENT_BUDGET when nothing is left or more is held than the budget', () => {
    const over = budget({ heldMinor: 90n * M, spentMinor: 30n * M });

    expect(check([slice(1n, { budget: over })]).years[0]).toMatchObject({
      code: 'INSUFFICIENT_BUDGET',
      remainingMinor: -20n * M,
      shareBasisPoints: null,
    });
  });

  it('says NO_ACTIVE_BUDGET for a year with no budget, which is not a budget of nothing (AC-5)', () => {
    const result = check([slice(10n * M, { budget: null })]);

    expect(result.years[0]).toMatchObject({ code: 'NO_ACTIVE_BUDGET', budgetMinor: null, remainingMinor: null });
    expect(result.route).toBe('FINANCE_REVIEW');
  });

  it('sends a year that has ended nowhere: no step for Finance or the approver (AC-7)', () => {
    const result = check([slice(20n * M, { closed: true, budget: null })]);

    expect(result.route).toBe('BLOCKED');
    expect(result.periodClosed).toBe(true);
    expect(result.years[0]).toMatchObject({ code: null, remainingMinor: null });
    expect(codesOf(result)).toEqual(['CLOSED_OR_EXPIRED_BUDGET_PERIOD']);
  });

  it('sends a quote that has expired nowhere (AC-8)', () => {
    const result = check([slice(15n * M)], { staleCostEvidence: true });

    expect(result.route).toBe('BLOCKED');
    expect(codesOf(result)).toEqual(['STALE_COST_EVIDENCE', 'BUDGET_OK']);
  });

  it('records every code that applies and puts the data first, and still blocks (AC-9)', () => {
    const result = check([slice(45n * M)], { staleCostEvidence: true });

    expect(codesOf(result)).toEqual(['STALE_COST_EVIDENCE', 'INSUFFICIENT_BUDGET']);
    expect(result.route).toBe('BLOCKED');
  });

  it('judges every year on its own slice, never the total against one year (AC-15, AC-16)', () => {
    const y2026 = slice(2_400n, {
      year: 2026,
      budget: budget({ totalMinor: 5_000n, heldMinor: 0n, spentMinor: 0n }),
    });
    const noBudget = slice(2_400n, { year: 2027, budget: null });
    const result = check([y2026, noBudget]);

    expect(result.years.map((year) => year.code)).toEqual(['BUDGET_OK', 'NO_ACTIVE_BUDGET']);
    expect(result.years[0].shareBasisPoints).toBe(4800);
    expect(result.route).toBe('FINANCE_REVIEW');

    const rich = (remaining: bigint) => budget({ totalMinor: remaining, heldMinor: 0n, spentMinor: 0n });
    const split = check([
      slice(2_400n, { year: 2026, budget: rich(4_000n) }),
      slice(2_400n, { year: 2027, budget: rich(30_000n) }),
    ]);

    expect(split.years.map((year) => year.code)).toEqual(['BUDGET_OK', 'BUDGET_OK']);
    expect(split.years.map((year) => year.shareBasisPoints)).toEqual([6000, 800]);
  });

  it('keeps the worst code of the years in front of the others', () => {
    const result = check([
      slice(1n, { year: 2026 }),
      slice(1n, { year: 2027, budget: null }),
      slice(45n * M, { year: 2028 }),
    ]);

    expect(codesOf(result)).toEqual(['NO_ACTIVE_BUDGET', 'INSUFFICIENT_BUDGET', 'BUDGET_OK']);
  });

  it('carries what the others that wait cost into the year, and none into a year that has ended (US-06-01 AC-9)', () => {
    const result = check([
      slice(15n * M, { pendingMinor: 15n * M }),
      slice(1n, { year: 2025, closed: true, budget: null, pendingMinor: 7n }),
    ]);

    expect(result.years.map((year) => year.pendingMinor)).toEqual([15n * M, null]);
  });

  it('is never an approval or a refusal: the only routes are the three that decide who looks next (AC-14)', () => {
    const routes = new Set(
      [
        check([slice(1n)]),
        check([slice(45n * M)]),
        check([slice(1n)], { staleCostEvidence: true }),
        check([slice(1n)], { planLineOverdue: true }),
      ].map((result) => result.route),
    );

    expect([...routes].sort()).toEqual(['BLOCKED', 'FINANCE_REVIEW', 'SPEND_APPROVAL']);
  });
});
