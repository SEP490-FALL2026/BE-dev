/**
 * The key of the transaction lock that serialises everything which reads or writes the budget of one Cost Center and one
 * fiscal year (F31, spec F and K): the budget check at submission and at decision, the commitment written on approval, the
 * year-end closure, the successor of a proposal, a version decision. Each repo takes it the same way, after the row lock of
 * its own record and in ascending order of year:
 *
 * `SELECT pg_advisory_xact_lock(hashtextextended(${budgetYearLockKey(costCenterId, year)}, 0))`
 *
 * The key is a plain string so two modules that never import each other still contend on exactly the same lock.
 */
export function budgetYearLockKey(costCenterId: string, year: number): string {
  return `budget-year:${costCenterId}:${year}`;
}
