import type { MoneyView } from '../budget/budget-facts.service';
import type { BudgetViewNumbers } from './budget-view-numbers.service';

/** Shared arithmetic of mine, table and summary; a missing budget never becomes a zero budget. */
export function budgetNumbers(
  budget: { baseMinor: bigint | null; reserveMinor: bigint | null; totalMinor: bigint | null },
  numbers: BudgetViewNumbers,
  money: (minor: bigint) => MoneyView,
) {
  const used = numbers.committed + numbers.spent + numbers.pendingSpend;
  const remainingBase = budget.baseMinor === null ? null : budget.baseMinor - used;
  const remaining = budget.totalMinor === null ? null : budget.totalMinor - used;
  return {
    base: budget.baseMinor === null ? null : money(budget.baseMinor),
    reserve: budget.reserveMinor === null ? null : money(budget.reserveMinor),
    total: budget.totalMinor === null ? null : money(budget.totalMinor),
    committed: money(numbers.committed),
    spent: money(numbers.spent),
    pendingSpend: money(numbers.pendingSpend),
    remainingBase: remainingBase === null ? null : money(remainingBase),
    remainingWithReserve: remaining === null ? null : money(remaining),
    overBudget: remaining !== null && remaining < 0n,
  };
}
