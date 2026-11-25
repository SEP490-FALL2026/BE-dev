import { HttpStatus } from '@nestjs/common';
import { isCheckViolation } from '../../../../infrastructure/database/unique-violation';
import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../../infrastructure/http/openapi-error-examples';
import { SeatLedgerBelowOccupancyError, SeatLedgerEffectiveInClosedMonthError } from '../subscription-line.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps seat-ledger domain errors to HTTP exceptions. */
export function toSeatLedgerApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof SeatLedgerBelowOccupancyError || isCheckViolation(error, 'seat_changes_below_occupancy')) {
    return refuse(HttpStatus.CONFLICT, 'SEAT_LEDGER.BELOW_OCCUPANCY', new SeatLedgerBelowOccupancyError().message);
  }
  if (error instanceof SeatLedgerEffectiveInClosedMonthError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH', error.message, {
      earliestOn: error.earliestOn,
    });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toSeatLedgerApiException(error));

/** OpenAPI examples produced by the seat-ledger HTTP mapper. */
export const SEAT_LEDGER_ERROR_EXAMPLES = {
  BELOW_OCCUPANCY: example(new SeatLedgerBelowOccupancyError()),
  EFFECTIVE_IN_CLOSED_MONTH: example(new SeatLedgerEffectiveInClosedMonthError('2026-12-01')),
} as const;
