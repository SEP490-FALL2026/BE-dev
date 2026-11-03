import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  ImportAlreadyConfirmedError,
  ImportDuplicateFileError,
  ImportFileInvalidError,
  ImportForbiddenError,
  ImportFileMissingColumnsError,
  ImportFileUnreadableError,
  ImportNotFoundError,
  ImportPreviewOutdatedError,
  ImportPreviewStaleError,
  ImportStateError,
} from './employee-import.errors';
import type { ImportResult } from './employee-import.types';

function refuse(status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/** The HTTP answer of the people import routes for an error: the business errors by code, 503 for a database outage. */
export function toImportApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  // The policy of the service refuses a role the way the guard of the route does, with the same body.
  if (error instanceof ImportForbiddenError) return new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);
  if (error instanceof ImportFileInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `IMPORT.${error.problem}`, error.message, error.details);
  }
  if (error instanceof ImportFileUnreadableError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'IMPORT.FILE_UNREADABLE', error.message, {
      reason: error.reason,
      ...(error.line ? { line: error.line } : {}),
    });
  }
  if (error instanceof ImportFileMissingColumnsError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'IMPORT.FILE_MISSING_COLUMNS', error.message, {
      missing: error.missing,
    });
  }
  if (error instanceof ImportNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'IMPORT.NOT_FOUND', error.message);
  if (error instanceof ImportStateError) {
    return refuse(HttpStatus.CONFLICT, `IMPORT.${error.problem}`, error.message);
  }
  if (error instanceof ImportPreviewOutdatedError) {
    return refuse(HttpStatus.CONFLICT, 'IMPORT.PREVIEW_OUTDATED', error.message, {
      currentVersion: error.currentVersion,
    });
  }
  if (error instanceof ImportPreviewStaleError) {
    return refuse(HttpStatus.CONFLICT, 'IMPORT.PREVIEW_STALE', error.message, { changedLines: error.changedLines });
  }
  if (error instanceof ImportDuplicateFileError) {
    return refuse(HttpStatus.CONFLICT, 'IMPORT.DUPLICATE_FILE_NOT_ACKNOWLEDGED', error.message, {
      previous: {
        importId: error.previous.importId,
        fileName: error.previous.fileName,
        confirmedAt: error.previous.confirmedAt.toISOString(),
      },
    });
  }
  if (error instanceof ImportAlreadyConfirmedError) {
    return refuse(HttpStatus.CONFLICT, 'IMPORT.ALREADY_CONFIRMED', error.message, { result: error.result });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toImportApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const IMPORT_ERROR_EXAMPLES = {
  FILE_REQUIRED: example(new ImportFileInvalidError('FILE_REQUIRED')),
  FILE_FORMAT_UNSUPPORTED: example(new ImportFileInvalidError('FILE_FORMAT_UNSUPPORTED')),
  FILE_EMPTY: example(new ImportFileInvalidError('FILE_EMPTY')),
  FILE_NOT_TEXT: example(new ImportFileInvalidError('FILE_NOT_TEXT')),
  FILE_TOO_MANY_ROWS: example(new ImportFileInvalidError('FILE_TOO_MANY_ROWS', { maxRows: 1000 })),
  FILE_UNREADABLE: example(new ImportFileUnreadableError('STRAY_QUOTE', 2)),
  FILE_MISSING_COLUMNS: example(new ImportFileMissingColumnsError(['department_code'])),
  NOT_FOUND: example(new ImportNotFoundError()),
  CANCELLED: example(new ImportStateError('CANCELLED')),
  EXPIRED: example(new ImportStateError('EXPIRED')),
  NOT_PREVIEW: example(new ImportStateError('NOT_PREVIEW')),
  PREVIEW_OUTDATED: example(new ImportPreviewOutdatedError(2)),
  PREVIEW_STALE: example(new ImportPreviewStaleError([2])),
  DUPLICATE_FILE_NOT_ACKNOWLEDGED: example(
    new ImportDuplicateFileError({
      importId: '<import-id>',
      confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
      fileName: 'employees.csv',
    }),
  ),
  ALREADY_CONFIRMED: example(
    new ImportAlreadyConfirmedError({
      created: 1,
      newUnplaced: 0,
      existingSame: 0,
      existingDifferent: 0,
      errors: 0,
      createdByDepartment: [{ departmentCode: 'D-01', count: 1 }],
      departmentsWithoutHead: [],
    } satisfies ImportResult),
  ),
} as const;
