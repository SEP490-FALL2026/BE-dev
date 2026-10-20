import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
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

function refuse(status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/** The HTTP answer of the people import routes for an error: the business errors by code, 503 for a database outage. */
export function toImportApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
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
