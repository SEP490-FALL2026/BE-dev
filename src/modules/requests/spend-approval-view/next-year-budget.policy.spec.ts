import { nextYearBudgetOf } from './next-year-budget.policy';

const M = 1_000_000n;

describe('QĐ-111al, R-15, R-46: what is left of the budget of the year after for the request the approver reads', () => {
  const figures = (patch: Partial<Parameters<typeof nextYearBudgetOf>[0]> = {}) =>
    nextYearBudgetOf({ year: 2027, approvedMinor: 100n * M, keptByOthersMinor: 60n * M, thisMinor: 25n * M, ...patch });

  it('is the approved budget (base and reserve) less what the other approved requests kept, and what is left once this request is approved', () => {
    expect(figures()).toEqual({
      year: 2027,
      approvedMinor: 100n * M,
      remainingMinor: 40n * M,
      remainingAfterMinor: 15n * M,
      warning: false,
    });
  });

  it('a request that takes exactly what is left leaves nothing and warns of nothing', () => {
    expect(figures({ thisMinor: 40n * M })).toMatchObject({
      remainingMinor: 40n * M,
      remainingAfterMinor: 0n,
      warning: false,
    });
  });

  it('a request that takes more than what is left warns (soft: the approval is still made) and leaves a negative remainder after', () => {
    expect(figures({ thisMinor: 41n * M })).toMatchObject({ remainingAfterMinor: -(1n * M), warning: true });
  });

  it('what the others kept already beyond the budget leaves a negative remainder and a warning for any request that takes something', () => {
    expect(figures({ keptByOthersMinor: 120n * M, thisMinor: 1n })).toMatchObject({
      remainingMinor: -(20n * M),
      remainingAfterMinor: -(20n * M) - 1n,
      warning: true,
    });
  });

  it('a year with no approved budget has no figures and no warning: nothing is judged against a budget that is not there', () => {
    expect(figures({ approvedMinor: null })).toEqual({
      year: 2027,
      approvedMinor: null,
      remainingMinor: null,
      remainingAfterMinor: null,
      warning: false,
    });
  });

  it('a request with nothing of the year after has no figure to read', () => {
    expect(figures({ thisMinor: 0n })).toBeNull();
  });

  it('FIX-B1 F7 (D-10): subtracts next-year runningUncommittedMinor from remaining and remainingAfter', () => {
    expect(figures({ runningUncommittedMinor: 6_000_000n, thisMinor: 35n * M })).toEqual({
      year: 2027,
      approvedMinor: 100n * M,
      remainingMinor: 34n * M,
      remainingAfterMinor: -(1n * M),
      warning: true,
    });
  });
});
