export type UsageSourceProblem =
  | 'NOT_FOUND'
  | 'APPLICATION_NOT_FOUND'
  | 'APPLICATION_INTERNAL'
  | 'APPLICATION_RETIRED'
  | 'COMMUNICATION_APP'
  | 'TEMPLATE_INVALID'
  | 'TEMPLATE_CAPABILITY_MISMATCH'
  | 'NAME_TAKEN'
  | 'IN_USE';

/** A source cannot be declared, read or changed: `problem` says why and `details` what to look at (never a value of the report). */
export class UsageSourceRefusedError extends Error {
  constructor(
    readonly problem: UsageSourceProblem,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`The usage source cannot be used: ${problem}.`);
    this.name = 'UsageSourceRefusedError';
  }
}
