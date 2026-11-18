import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { UsageSourceRefusedError } from '../vendor-source/vendor-source.errors';
import { toUsageSourceApiException } from '../vendor-source/vendor-source.http-errors';
import {
  UsageImportAlreadyConfirmedError,
  UsageImportEventTypeUnmappedError,
  UsageImportFileError,
  UsageImportNotFoundError,
  UsageImportPreviewStaleError,
  UsageImportStateError,
  UsageTrackingNoticeRequiredError,
  type UsageImportFileProblem,
  type UsageImportStateProblem,
} from './vendor-import.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details && Object.keys(details).length > 0 ? { details } : {}) });

/** Maps the errors of the usage import routes to their HTTP answers; the source errors keep their own codes. */
export function toUsageImportApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof UsageSourceRefusedError) return toUsageSourceApiException(error);
  if (error instanceof UsageImportFileError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `USAGE_IMPORT.${error.problem}`, error.message, error.details);
  }
  if (error instanceof UsageImportNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'USAGE_IMPORT.NOT_FOUND', error.message);
  }
  if (error instanceof UsageImportStateError)
    return refuse(HttpStatus.CONFLICT, `USAGE_IMPORT.${error.problem}`, error.message);
  if (error instanceof UsageImportPreviewStaleError) {
    return refuse(HttpStatus.CONFLICT, 'USAGE_IMPORT.PREVIEW_STALE', error.message, {
      currentVersion: error.currentVersion,
      changedLines: error.changedLines,
    });
  }
  if (error instanceof UsageImportAlreadyConfirmedError) {
    return refuse(HttpStatus.CONFLICT, 'USAGE_IMPORT.ALREADY_CONFIRMED', error.message);
  }
  if (error instanceof UsageImportEventTypeUnmappedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'USAGE_IMPORT.EVENT_TYPE_UNMAPPED', error.message, {
      eventTypes: error.eventTypes,
    });
  }
  if (error instanceof UsageTrackingNoticeRequiredError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'USAGE_IMPORT.TRACKING_NOTICE_REQUIRED', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const file = (problem: UsageImportFileProblem, details: Record<string, unknown> = {}) =>
  errorExampleOf(toUsageImportApiException(new UsageImportFileError(problem, details)));
const state = (problem: UsageImportStateProblem) =>
  errorExampleOf(toUsageImportApiException(new UsageImportStateError(problem)));

export const USAGE_IMPORT_ERROR_EXAMPLES = {
  NOT_FOUND: errorExampleOf(toUsageImportApiException(new UsageImportNotFoundError())),
  FILE_REQUIRED: file('FILE_REQUIRED'),
  FILE_EMPTY: file('FILE_EMPTY'),
  FILE_NOT_TEXT: file('FILE_NOT_TEXT'),
  FILE_TOO_MANY_ROWS: file('FILE_TOO_MANY_ROWS', { maxRows: 50000 }),
  FILE_UNREADABLE: file('FILE_UNREADABLE', { reason: 'UNTERMINATED_QUOTE', line: 3 }),
  FILE_MISSING_COLUMNS: file('FILE_MISSING_COLUMNS', { missing: ['email'] }),
  SCHEMA_UNSUPPORTED: file('SCHEMA_UNSUPPORTED', { supported: 'saas-sentry.vendor-usage-report/0.1-proposal' }),
  REPORT_INVALID: file('REPORT_INVALID', { path: 'subjects.0.activity' }),
  SOURCE_MISMATCH: file('SOURCE_MISMATCH'),
  WINDOW_REQUIRED: file('WINDOW_REQUIRED'),
  WINDOW_INVALID: file('WINDOW_INVALID', { reason: 'TOO_LONG', maxDays: 366 }),
  CANCELLED: state('CANCELLED'),
  EXPIRED: state('EXPIRED'),
  NOT_PREVIEW: state('NOT_PREVIEW'),
  NOT_OPEN: state('NOT_OPEN'),
  PREVIEW_STALE: errorExampleOf(toUsageImportApiException(new UsageImportPreviewStaleError(1, [3, 4]))),
  ALREADY_CONFIRMED: errorExampleOf(toUsageImportApiException(new UsageImportAlreadyConfirmedError())),
  EVENT_TYPE_UNMAPPED: errorExampleOf(toUsageImportApiException(new UsageImportEventTypeUnmappedError(['export']))),
  TRACKING_NOTICE_REQUIRED: errorExampleOf(toUsageImportApiException(new UsageTrackingNoticeRequiredError())),
} as const;
