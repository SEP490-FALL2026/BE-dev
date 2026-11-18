import type { SeatColumn } from './seat-baseline-import.types';

export type SeatFileProblem = 'FILE_REQUIRED' | 'FILE_NOT_TEXT' | 'FILE_EMPTY' | 'FILE_TOO_MANY_ROWS';

/** The file cannot be used as a whole: nothing was kept. */
export class SeatImportFileInvalidError extends Error {
  constructor(
    readonly problem: SeatFileProblem,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`The seat file cannot be imported: ${problem}.`);
    this.name = 'SeatImportFileInvalidError';
  }
}

export class SeatImportFileUnreadableError extends Error {
  constructor(
    readonly reason: string,
    readonly line: number | undefined,
  ) {
    super(`The seat file cannot be read as a table: ${reason}.`);
    this.name = 'SeatImportFileUnreadableError';
  }
}

export class SeatImportFileMissingColumnsError extends Error {
  constructor(readonly missing: SeatColumn[]) {
    super(`The seat file lacks required columns: ${missing.join(', ')}.`);
    this.name = 'SeatImportFileMissingColumnsError';
  }
}

export class SeatImportNotFoundError extends Error {
  constructor() {
    super('Seat baseline import not found.');
    this.name = 'SeatImportNotFoundError';
  }
}

export type SeatImportStateProblem = 'CANCELLED' | 'EXPIRED' | 'NOT_PREVIEW';

/** The import is no longer in a state where it can be confirmed or cancelled. */
export class SeatImportStateError extends Error {
  constructor(readonly problem: SeatImportStateProblem) {
    super(`The seat baseline import cannot be used: ${problem}.`);
    this.name = 'SeatImportStateError';
  }
}

/** The confirmation names a preview that is not the current one. */
export class SeatImportPreviewOutdatedError extends Error {
  constructor(readonly currentVersion: number) {
    super('The preview that was confirmed is not the current one.');
    this.name = 'SeatImportPreviewOutdatedError';
  }
}

/** What the preview said no longer matches the data. Nothing was written. */
export class SeatImportPreviewStaleError extends Error {
  constructor(readonly changedLines: number[]) {
    super('The data changed since the preview; upload the file again.');
    this.name = 'SeatImportPreviewStaleError';
  }
}

/** Another request already wrote this import. */
export class SeatImportAlreadyConfirmedError extends Error {
  constructor(readonly result: unknown) {
    super('This seat baseline import has already been written.');
    this.name = 'SeatImportAlreadyConfirmedError';
  }
}
