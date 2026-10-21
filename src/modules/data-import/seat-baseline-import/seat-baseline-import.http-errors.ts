import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import {
  SeatBaselineClosedError,
  SeatPlanNotSupportedError,
  SeatQuantityUnknownError,
  SeatApplicationRetiredError,
  SeatSubscriptionDraftError,
  SeatTargetInvalidError,
  SeatTargetNotFoundError,
} from '../../licensing/licensing.errors';
import {
  SeatImportAlreadyConfirmedError,
  SeatImportFileInvalidError,
  SeatImportFileMissingColumnsError,
  SeatImportFileUnreadableError,
  SeatImportNotFoundError,
  SeatImportPreviewOutdatedError,
  SeatImportPreviewStaleError,
  SeatImportStateError,
} from './seat-baseline-import.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;
const CONFLICT = HttpStatus.CONFLICT;

/**
 * Maps the errors of the seat baseline import routes to their HTTP answers: the file as a whole, the state of the import,
 * and the target and the closed baseline, which licensing reports. A database that cannot answer is a 503; anything else
 * is returned unchanged for the global filter.
 */
export function toSeatImportApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof SeatImportFileInvalidError) {
    return refuse(UNPROCESSABLE, `SEAT_BASELINE_IMPORT.${error.problem}`, error.message, error.details);
  }
  if (error instanceof SeatImportFileUnreadableError) {
    return refuse(UNPROCESSABLE, 'SEAT_BASELINE_IMPORT.FILE_UNREADABLE', error.message, {
      reason: error.reason,
      ...(error.line === undefined ? {} : { line: error.line }),
    });
  }
  if (error instanceof SeatImportFileMissingColumnsError) {
    return refuse(UNPROCESSABLE, 'SEAT_BASELINE_IMPORT.FILE_MISSING_COLUMNS', error.message, {
      missing: error.missing,
    });
  }
  if (error instanceof SeatImportNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SEAT_BASELINE_IMPORT.NOT_FOUND', error.message);
  }
  if (error instanceof SeatImportStateError) {
    return refuse(CONFLICT, `SEAT_BASELINE_IMPORT.${error.problem}`, error.message);
  }
  if (error instanceof SeatImportPreviewOutdatedError) {
    return refuse(CONFLICT, 'SEAT_BASELINE_IMPORT.PREVIEW_OUTDATED', error.message, {
      currentVersion: error.currentVersion,
    });
  }
  if (error instanceof SeatImportPreviewStaleError) {
    return refuse(CONFLICT, 'SEAT_BASELINE_IMPORT.PREVIEW_STALE', error.message, { changedLines: error.changedLines });
  }
  if (error instanceof SeatImportAlreadyConfirmedError) {
    return refuse(CONFLICT, 'SEAT_BASELINE_IMPORT.ALREADY_CONFIRMED', error.message, { result: error.result });
  }

  if (error instanceof SeatBaselineClosedError) return refuse(CONFLICT, 'SEAT_BASELINE.CLOSED', error.message);
  if (error instanceof SeatQuantityUnknownError)
    return refuse(CONFLICT, 'SEAT_BASELINE.QUANTITY_UNKNOWN', error.message);
  if (error instanceof SeatApplicationRetiredError) {
    return refuse(HttpStatus.CONFLICT, 'SEAT_TARGET.APPLICATION_RETIRED', error.message);
  }
  if (error instanceof SeatSubscriptionDraftError) {
    return refuse(UNPROCESSABLE, 'SEAT_TARGET.SUBSCRIPTION_DRAFT', error.message, { missing: error.missing });
  }
  if (error instanceof SeatTargetNotFoundError) {
    return refuse(
      HttpStatus.NOT_FOUND,
      error.target === 'PLAN' ? 'PLAN.NOT_FOUND' : 'SUBSCRIPTION.NOT_FOUND',
      error.message,
    );
  }
  if (error instanceof SeatTargetInvalidError) {
    return refuse(UNPROCESSABLE, 'SEAT_BASELINE.TARGET_INVALID', error.message, { problem: error.problem });
  }
  if (error instanceof SeatPlanNotSupportedError) {
    return refuse(UNPROCESSABLE, 'SEAT_BASELINE.PLAN_NOT_SUPPORTED', error.message, {
      provisioningType: error.provisioningType,
    });
  }

  return toUnavailableApiException(error) ?? error;
}
