import type { MoneyView } from '../budget/budget-facts.service';
import type { BudgetViewNumbers } from './budget-view-numbers.service';

interface VersionBudget {
  baseMinor: bigint | null;
  reserveMinor: bigint | null;
  totalMinor: bigint | null;
  /** What the approved adjustments added to (positive) or took from (negative) the base of the version (`AD-1`). */
  adjustmentMinor?: bigint | null;
}

const orNull = <T>(value: bigint | null, make: (minor: bigint) => T): T | null => (value === null ? null : make(value));

/** The figures of the budget with the adjustments in them, or null for a Cost Center that has no budget of the year (`QĐ-111bh`): the base moves, the reserve does not. */
function effectiveOf(budget: VersionBudget) {
  if (budget.baseMinor === null || budget.reserveMinor === null || budget.totalMinor === null) return null;
  const adjustment = budget.adjustmentMinor ?? 0n;

  return {
    baseMinor: budget.baseMinor + adjustment,
    reserveMinor: budget.reserveMinor,
    totalMinor: budget.totalMinor + adjustment,
    adjustmentMinor: adjustment,
  };
}

/**
 * Shared arithmetic of mine, table and summary; a missing budget never becomes a zero budget. What is left is worked out on the EFFECTIVE budget (`AD-1`, `QĐ-111bh`): the
 * base of the version with the adjustments approved for it, the reserve as it is; `base`, `reserve` and `total` stay the figures of the version.
 */
export type BudgetViewNumbersInput = Omit<BudgetViewNumbers, 'runningUncommitted'> & {
  runningUncommitted?: bigint;
};

export function budgetNumbers(
  budget: VersionBudget,
  numbers: BudgetViewNumbersInput,
  money: (minor: bigint) => MoneyView,
) {
  const runningUncommitted = numbers.runningUncommitted ?? 0n;
  const used = numbers.committed + numbers.spent + numbers.pendingSpend + runningUncommitted;
  const effective = effectiveOf(budget);
  const remaining = effective === null ? null : effective.totalMinor - used;

  return {
    base: orNull(budget.baseMinor, money),
    reserve: orNull(budget.reserveMinor, money),
    total: orNull(budget.totalMinor, money),
    effectiveBudget:
      effective === null
        ? null
        : {
            base: money(effective.baseMinor),
            reserve: money(effective.reserveMinor),
            total: money(effective.totalMinor),
            adjustment: money(effective.adjustmentMinor),
          },
    committed: money(numbers.committed),
    spent: money(numbers.spent),
    pendingSpend: money(numbers.pendingSpend),
    runningUncommitted: money(runningUncommitted),
    remainingBase: effective === null ? null : money(effective.baseMinor - used),
    remainingWithReserve: orNull(remaining, money),
    overBudget: remaining !== null && remaining < 0n,
  };
}
