import { Injectable } from '@nestjs/common';
import { budgetYearLockKey } from '../public/budget-year-lock-key.policy';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/**
 * The lock that serialises everything which reads or writes the budget of one Cost Center and one fiscal year:
 * the commitment held for a request, the decision of a version, the sending of a version, the successor of a proposal and the
 * closure of the year. It is held until the transaction ends.
 *
 * The order of the locks of this context is fixed: the proposal rows, then the version rows of the Cost Center and year (by id),
 * then this lock, and the years of one transaction earliest first. The transactions of a request take the row of the request
 * first and this lock after it. A transaction takes no proposal or version row after this lock that it did not take before it.
 *
 * An adjustment of the budget of the year (`AD-1`, `D11`) is the one thing that spans the whole year, since what is not allocated is a total over every Cost Center: it takes the row of the
 * cycle (`budget_cycles ... FOR UPDATE`) BEFORE any lock of this kind, then the lock of each Cost Center it names with the lower id first, so that two adjustments (and a version sent) take
 * turns, and two transfers between the same two Cost Centers never wait for each other in a circle (`BudgetAdjustmentLockService`).
 */
@Injectable()
export class BudgetYearLockRepo {
  /** Takes the lock of each year, the earliest first, whatever the order they are given in. */
  async lock(tx: DbTx, costCenterId: string, years: readonly number[]): Promise<void> {
    for (const year of [...new Set(years)].sort((a, b) => a - b)) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${budgetYearLockKey(costCenterId, year)}, 0))`;
    }
  }
}
