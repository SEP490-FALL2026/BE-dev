export type UsageIdentityProblem =
  | 'UNMATCHED_NOT_FOUND'
  | 'MAPPING_NOT_FOUND'
  | 'EMPLOYEE_NOT_FOUND'
  | 'ALREADY_MAPPED'
  | 'ALREADY_HANDLED'
  | 'MAPPING_ENDED';

/** An identifier of a vendor cannot be tied, dismissed or released: `problem` says why. */
export class UsageIdentityRefusedError extends Error {
  constructor(readonly problem: UsageIdentityProblem) {
    super(`The usage identity cannot be changed: ${problem}.`);
    this.name = 'UsageIdentityRefusedError';
  }
}
