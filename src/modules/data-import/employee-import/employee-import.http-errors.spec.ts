import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import {
  ImportAlreadyConfirmedError,
  ImportDuplicateFileError,
  ImportFileInvalidError,
  ImportFileMissingColumnsError,
  ImportFileUnreadableError,
  ImportNotFoundError,
  ImportPreviewOutdatedError,
  ImportPreviewStaleError,
  ImportStateError,
} from './employee-import.errors';
import { toImportApiException } from './employee-import.http-errors';

/** What the client receives for an error: the status and the error body, read from the exception itself. */
function answerOf(error: unknown): { status: number; body: unknown } {
  const mapped = toImportApiException(error);
  if (!(mapped instanceof ApiException)) throw new Error('expected an ApiException');

  return { status: mapped.getStatus(), body: mapped.getResponse() };
}

describe('the HTTP answer of each people-import error (US-02-01, US-02-02)', () => {
  it.each<[string, unknown, number, unknown]>([
    [
      'no file',
      new ImportFileInvalidError('FILE_REQUIRED'),
      422,
      { code: 'IMPORT.FILE_REQUIRED', message: 'The file cannot be imported: FILE_REQUIRED.', details: {} },
    ],
    [
      'not text',
      new ImportFileInvalidError('FILE_NOT_TEXT'),
      422,
      { code: 'IMPORT.FILE_NOT_TEXT', message: 'The file cannot be imported: FILE_NOT_TEXT.', details: {} },
    ],
    [
      'empty',
      new ImportFileInvalidError('FILE_EMPTY'),
      422,
      { code: 'IMPORT.FILE_EMPTY', message: 'The file cannot be imported: FILE_EMPTY.', details: {} },
    ],
    [
      'too many rows',
      new ImportFileInvalidError('FILE_TOO_MANY_ROWS', { maxRows: 1000 }),
      422,
      {
        code: 'IMPORT.FILE_TOO_MANY_ROWS',
        message: 'The file cannot be imported: FILE_TOO_MANY_ROWS.',
        details: { maxRows: 1000 },
      },
    ],
    [
      'unreadable at a line',
      new ImportFileUnreadableError('UNTERMINATED_QUOTE', 3),
      422,
      {
        code: 'IMPORT.FILE_UNREADABLE',
        message: 'The file cannot be read as a table: UNTERMINATED_QUOTE.',
        details: { reason: 'UNTERMINATED_QUOTE', line: 3 },
      },
    ],
    [
      'unreadable without a line',
      new ImportFileUnreadableError('UNTERMINATED_QUOTE', undefined),
      422,
      {
        code: 'IMPORT.FILE_UNREADABLE',
        message: 'The file cannot be read as a table: UNTERMINATED_QUOTE.',
        details: { reason: 'UNTERMINATED_QUOTE' },
      },
    ],
    [
      'unreadable at line 0 (falsy: the line is left out)',
      new ImportFileUnreadableError('UNTERMINATED_QUOTE', 0),
      422,
      {
        code: 'IMPORT.FILE_UNREADABLE',
        message: 'The file cannot be read as a table: UNTERMINATED_QUOTE.',
        details: { reason: 'UNTERMINATED_QUOTE' },
      },
    ],
    [
      'missing columns',
      new ImportFileMissingColumnsError(['department_code', 'hire_date']),
      422,
      {
        code: 'IMPORT.FILE_MISSING_COLUMNS',
        message: 'The file lacks required columns: department_code, hire_date.',
        details: { missing: ['department_code', 'hire_date'] },
      },
    ],
    ['not found', new ImportNotFoundError(), 404, { code: 'IMPORT.NOT_FOUND', message: 'Import not found.' }],
    [
      'cancelled',
      new ImportStateError('CANCELLED'),
      409,
      { code: 'IMPORT.CANCELLED', message: 'The import cannot be used: CANCELLED.' },
    ],
    [
      'expired',
      new ImportStateError('EXPIRED'),
      409,
      { code: 'IMPORT.EXPIRED', message: 'The import cannot be used: EXPIRED.' },
    ],
    [
      'not a preview',
      new ImportStateError('NOT_PREVIEW'),
      409,
      { code: 'IMPORT.NOT_PREVIEW', message: 'The import cannot be used: NOT_PREVIEW.' },
    ],
    [
      'outdated preview',
      new ImportPreviewOutdatedError(4),
      409,
      {
        code: 'IMPORT.PREVIEW_OUTDATED',
        message: 'The preview that was confirmed is not the current one.',
        details: { currentVersion: 4 },
      },
    ],
    [
      'stale preview',
      new ImportPreviewStaleError([2, 7]),
      409,
      {
        code: 'IMPORT.PREVIEW_STALE',
        message: 'The data changed since the preview; look at the preview again.',
        details: { changedLines: [2, 7] },
      },
    ],
    [
      'duplicate file not acknowledged',
      new ImportDuplicateFileError({
        importId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
        fileName: 'first.csv',
        confirmedAt: new Date('2026-10-01T02:03:04.005Z'),
      }),
      409,
      {
        code: 'IMPORT.DUPLICATE_FILE_NOT_ACKNOWLEDGED',
        message: 'This file was already imported.',
        details: {
          previous: {
            importId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
            fileName: 'first.csv',
            confirmedAt: '2026-10-01T02:03:04.005Z',
          },
        },
      },
    ],
    [
      'already confirmed',
      new ImportAlreadyConfirmedError({ created: 1, errors: 0 }),
      409,
      {
        code: 'IMPORT.ALREADY_CONFIRMED',
        message: 'This import has already been written.',
        details: { result: { created: 1, errors: 0 } },
      },
    ],
  ])('answers %s', (_name, error, status, body) => {
    expect(answerOf(error)).toEqual({ status, body });
  });

  it('keeps the exact key order of an error body: code, message, then details', () => {
    expect(Object.keys(answerOf(new ImportPreviewStaleError([2])).body as object)).toEqual([
      'code',
      'message',
      'details',
    ]);
    expect(Object.keys(answerOf(new ImportNotFoundError()).body as object)).toEqual(['code', 'message']);
  });

  it('passes an ApiException through unchanged (a refusal made by the controller itself)', () => {
    const ready = new ApiException(HttpStatus.CONFLICT, { code: 'X.Y', message: 'already mapped' });

    expect(toImportApiException(ready)).toBe(ready);
  });

  it('turns a database that cannot answer into 503 SERVICE_UNAVAILABLE', () => {
    expect(answerOf(new TransientDatabaseError('40001', new Error('serialization failure')))).toEqual({
      status: 503,
      body: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Retry shortly.' },
    });
  });

  it('leaves an error it does not know as it is, so it is reported as an internal error', () => {
    const unknown = new Error('a defect');
    const notAnError = { reason: 'thrown object' };

    expect(toImportApiException(unknown)).toBe(unknown);
    expect(toImportApiException(notAnError)).toBe(notAnError);
    expect(toImportApiException('text')).toBe('text');
  });
});
