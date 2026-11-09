export type UsageImportFileProblem =
  | 'FILE_REQUIRED'
  | 'FILE_EMPTY'
  | 'FILE_NOT_TEXT'
  | 'FILE_TOO_MANY_ROWS'
  | 'FILE_UNREADABLE'
  | 'FILE_MISSING_COLUMNS'
  | 'SCHEMA_UNSUPPORTED'
  | 'REPORT_INVALID'
  | 'SOURCE_MISMATCH'
  | 'WINDOW_REQUIRED'
  | 'WINDOW_INVALID';

/** The file cannot be used as a whole: nothing was kept. `details` names a column, a limit or a reason, never a value of the report. */
export class UsageImportFileError extends Error {
  constructor(
    readonly problem: UsageImportFileProblem,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`The usage report cannot be imported: ${problem}.`);
    this.name = 'UsageImportFileError';
  }
}

export class UsageImportNotFoundError extends Error {
  constructor() {
    super('Usage import not found.');
    this.name = 'UsageImportNotFoundError';
  }
}

export type UsageImportStateProblem = 'CANCELLED' | 'EXPIRED' | 'NOT_PREVIEW' | 'NOT_OPEN';

/** The import is no longer in a state where it can be confirmed or cancelled. */
export class UsageImportStateError extends Error {
  constructor(readonly problem: UsageImportStateProblem) {
    super(`The usage import cannot be used: ${problem}.`);
    this.name = 'UsageImportStateError';
  }
}

/** The confirmation names a preview that is not the current one, or what the preview said no longer matches the data. */
export class UsageImportPreviewStaleError extends Error {
  constructor(
    readonly currentVersion: number,
    readonly changedLines: number[],
  ) {
    super('The preview that was confirmed is no longer the current one.');
    this.name = 'UsageImportPreviewStaleError';
  }
}

/** Another key already confirmed this import. */
export class UsageImportAlreadyConfirmedError extends Error {
  constructor() {
    super('The usage import was already confirmed.');
    this.name = 'UsageImportAlreadyConfirmedError';
  }
}

/** Types of event the report has and the source has no class for: the IT Admin sorts them first, nothing is guessed. */
export class UsageImportEventTypeUnmappedError extends Error {
  constructor(readonly eventTypes: string[]) {
    super('The report has types of event the source does not classify.');
    this.name = 'UsageImportEventTypeUnmappedError';
  }
}

/** The first report of an application is not written until the people who hold it are told it is tracked (`US-08-05`). */
export class UsageTrackingNoticeRequiredError extends Error {
  constructor() {
    super('The holders of this application must be told its usage is tracked before the first report is written.');
    this.name = 'UsageTrackingNoticeRequiredError';
  }
}
