export type SaasIssueProblem =
  /** The report does not exist, or the caller may not see it: the two are not told apart. */
  | 'NOT_FOUND'
  /** The assignment is not a personal right of the caller (or does not exist): its existence is not told. */
  | 'ASSIGNMENT_NOT_YOURS'
  /** The right of the caller has ended or never took a seat, so there is nothing to report on. */
  | 'ASSIGNMENT_NOT_OPEN'
  /** No IT Admin can take the report. */
  | 'NO_IT_ADMIN'
  | 'INVALID_TRANSITION'
  | 'RESOLUTION_REQUIRED'
  | 'MESSAGE_REQUIRED'
  | 'DUPLICATE_TARGET_INVALID'
  | 'REASON_REQUIRED'
  | 'REOPEN_WINDOW_ENDED'
  | 'NOT_RESOLVED'
  /** The report is closed or a duplicate: nothing more is added to it. */
  | 'CLOSED'
  | 'OCCURRED_IN_FUTURE'
  /** A person who is not an IT Admin asked for the reports of others. */
  | 'SCOPE_FORBIDDEN'
  /** A grant task named as linked work does not exist. */
  | 'LINKED_WORK_INVALID';

/** A report of an error in a SaaS right was refused; nothing is written. `reason` says what to put right. */
export class SaasIssueError extends Error {
  constructor(
    readonly problem: SaasIssueProblem,
    readonly reason?: string,
  ) {
    super(`The SaaS issue was refused: ${problem}${reason ? ` (${reason})` : ''}.`);
    this.name = 'SaasIssueError';
  }
}
