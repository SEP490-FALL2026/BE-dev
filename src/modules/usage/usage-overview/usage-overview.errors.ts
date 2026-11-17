import type { RangeProblem } from './usage-overview.types';

export type UsageOverviewProblem = 'RANGE_INVALID' | 'EMPLOYEE_NOT_FOUND' | 'APPLICATION_NOT_FOUND';

/** A read of the usage cannot be answered: `problem` says why, and `reason` how a range is wrong. */
export class UsageOverviewRefusedError extends Error {
  constructor(
    readonly problem: UsageOverviewProblem,
    readonly reason?: RangeProblem,
  ) {
    super(`The usage cannot be read: ${problem}${reason ? ` (${reason})` : ''}.`);
    this.name = 'UsageOverviewRefusedError';
  }
}
