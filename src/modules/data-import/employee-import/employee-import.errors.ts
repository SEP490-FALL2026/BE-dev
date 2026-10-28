import { EmployeeColumn } from './employee-import-rows';

/**
 * The caller is not the Super Admin: people are imported by the Super Admin alone, on an HR basis (`QĐ-87a`), decided in the service
 * whatever the route let through (`F13`).
 */
export class ImportForbiddenError extends Error {
  constructor() {
    super('Only the Super Admin imports people.');
    this.name = 'ImportForbiddenError';
  }
}

export type FileProblem = 'FILE_REQUIRED' | 'FILE_NOT_TEXT' | 'FILE_EMPTY' | 'FILE_TOO_MANY_ROWS';

/** The file cannot be used as a whole (US-02-02 AC-2): nothing was kept. */
export class ImportFileInvalidError extends Error {
  constructor(
    readonly problem: FileProblem,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`The file cannot be imported: ${problem}.`);
    this.name = 'ImportFileInvalidError';
  }
}

export class ImportFileUnreadableError extends Error {
  constructor(
    readonly reason: string,
    readonly line: number | undefined,
  ) {
    super(`The file cannot be read as a table: ${reason}.`);
    this.name = 'ImportFileUnreadableError';
  }
}

export class ImportFileMissingColumnsError extends Error {
  constructor(readonly missing: EmployeeColumn[]) {
    super(`The file lacks required columns: ${missing.join(', ')}.`);
    this.name = 'ImportFileMissingColumnsError';
  }
}

export class ImportNotFoundError extends Error {
  constructor() {
    super('Import not found.');
    this.name = 'ImportNotFoundError';
  }
}

export type ImportStateProblem = 'CANCELLED' | 'EXPIRED' | 'NOT_PREVIEW';

/** The import is no longer in a state where it can be confirmed, refreshed or cancelled. */
export class ImportStateError extends Error {
  constructor(readonly problem: ImportStateProblem) {
    super(`The import cannot be used: ${problem}.`);
    this.name = 'ImportStateError';
  }
}

/** The confirmation names a preview that is not the current one (US-02-01 AC-10). */
export class ImportPreviewOutdatedError extends Error {
  constructor(readonly currentVersion: number) {
    super('The preview that was confirmed is not the current one.');
    this.name = 'ImportPreviewOutdatedError';
  }
}

/** What the preview said no longer matches the data (US-02-01 AC-9). Nothing was written. */
export class ImportPreviewStaleError extends Error {
  constructor(readonly changedLines: number[]) {
    super('The data changed since the preview; look at the preview again.');
    this.name = 'ImportPreviewStaleError';
  }
}

/** The same file was imported before; writing it again takes a deliberate yes (US-02-01 AC-4). */
export class ImportDuplicateFileError extends Error {
  constructor(readonly previous: { importId: string; confirmedAt: Date; fileName: string }) {
    super('This file was already imported.');
    this.name = 'ImportDuplicateFileError';
  }
}

/** Another request already wrote this import (US-02-01 AC-8, AC-10). */
export class ImportAlreadyConfirmedError extends Error {
  constructor(readonly result: unknown) {
    super('This import has already been written.');
    this.name = 'ImportAlreadyConfirmedError';
  }
}
