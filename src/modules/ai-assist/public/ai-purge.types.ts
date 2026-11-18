/** What the operator typed, parsed: the last day (`YYYY-MM-DD`, UTC) whose contents are in scope, and whether to delete. */
export interface AiPurgeCommand {
  through: string;
  apply: boolean;
  /** Who runs the command (a reference); required to apply, where it becomes the operator reference of the Audit Trail event. */
  operator: string | null;
}

/** What the command answers: how many contents were (or, for a dry run, would be) deleted, never what they hold. */
export interface AiPurgeResult {
  mode: 'DRY_RUN' | 'APPLIED';
  through: string;
  contentCount: number;
}
