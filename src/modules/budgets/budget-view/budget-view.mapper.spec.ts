import { budgetNumbers } from './budget-view.mapper';

const money = (minor: bigint) => ({ amount: String(minor), currency: 'VND' });
const budget = { baseMinor: 100n, reserveMinor: 20n, totalMinor: 120n };

describe('BR-MF4-05 department budget numbers', () => {
  it('deducts held, spent and pending exactly once from both remaining amounts', () => {
    expect(
      budgetNumbers(budget, { committed: 30n, spent: 20n, pendingSpend: 10n, priorPeriodAdjustment: 0n }, money),
    ).toMatchObject({
      remainingBase: money(40n),
      remainingWithReserve: money(60n),
      overBudget: false,
    });
  });

  it('keeps negative remaining amounts and flags only below zero', () => {
    const figures = { committed: 30n, spent: 90n, pendingSpend: 0n, priorPeriodAdjustment: 0n };
    expect(budgetNumbers(budget, figures, money)).toMatchObject({ remainingWithReserve: money(0n), overBudget: false });
    expect(budgetNumbers(budget, { ...figures, pendingSpend: 1n }, money)).toMatchObject({
      remainingWithReserve: money(-1n),
      overBudget: true,
    });
  });

  it('preserves held commitments without inventing a budget when none is approved', () => {
    expect(
      budgetNumbers(
        { baseMinor: null, reserveMinor: null, totalMinor: null },
        {
          committed: 30n,
          spent: 10n,
          pendingSpend: 0n,
          priorPeriodAdjustment: 0n,
        },
        money,
      ),
    ).toMatchObject({
      base: null,
      reserve: null,
      total: null,
      committed: money(30n),
      remainingBase: null,
      remainingWithReserve: null,
      overBudget: false,
    });
  });
});
