import { HttpStatus } from '@nestjs/common';
import { isCheckViolation } from '../../../../infrastructure/database/unique-violation';
import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../../infrastructure/http/openapi-error-examples';
import {
  SeatLedgerBelowOccupancyError,
  SeatLedgerClosedError,
  SeatLedgerEffectiveInClosedMonthError,
  SubscriptionLineClosedError,
  SubscriptionLineNotFoundError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLineStaleError,
} from '../subscription-line.errors';
import {
  SeatLedgerInvalidRefundTargetError,
  SeatLedgerMidTermReductionNotAllowedError,
  SeatLedgerReductionExceedsPurchaseError,
} from './subscription-line-correction.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps subscription-line seat correction and mid-term reduction errors to HTTP exceptions. */
export function toSeatCorrectionApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof SubscriptionLineNotResponsibleError) {
    return refuse(HttpStatus.FORBIDDEN, 'SUBSCRIPTION_LINE.NOT_RESPONSIBLE', error.message);
  }
  if (error instanceof SubscriptionLineNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'SUBSCRIPTION_LINE.NOT_FOUND', error.message);
  }
  if (error instanceof SubscriptionLineStaleError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION_LINE.STALE', error.message, {
      currentUpdatedAt: error.currentUpdatedAt.toISOString(),
    });
  }
  if (error instanceof SubscriptionLineClosedError || error instanceof SeatLedgerClosedError) {
    return refuse(HttpStatus.CONFLICT, 'SUBSCRIPTION_LINE.CLOSED', new SubscriptionLineClosedError().message);
  }
  if (error instanceof SeatLedgerBelowOccupancyError || isCheckViolation(error, 'seat_changes_below_occupancy')) {
    return refuse(HttpStatus.CONFLICT, 'SEAT_LEDGER.BELOW_OCCUPANCY', new SeatLedgerBelowOccupancyError().message);
  }
  if (error instanceof SeatLedgerEffectiveInClosedMonthError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH', error.message, {
      earliestOn: error.earliestOn,
    });
  }
  if (error instanceof SeatLedgerMidTermReductionNotAllowedError) {
    return refuse(HttpStatus.CONFLICT, 'SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED', error.message);
  }
  if (error instanceof SeatLedgerReductionExceedsPurchaseError) {
    return refuse(HttpStatus.CONFLICT, 'SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE', error.message, {
      remaining: error.remaining,
      requested: error.requested,
    });
  }
  if (error instanceof SeatLedgerInvalidRefundTargetError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', error.message, {
      issues: [{ code: 'custom', path: 'refundedSeatChangeId' }],
    });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toSeatCorrectionApiException(error));

/** OpenAPI examples for `POST /subscription-lines/:id/seat-corrections` and `seat-reductions`. */
export const SEAT_CORRECTION_ERROR_EXAMPLES = {
  NOT_RESPONSIBLE: example(new SubscriptionLineNotResponsibleError()),
  NOT_FOUND: example(new SubscriptionLineNotFoundError()),
  STALE: example(new SubscriptionLineStaleError(new Date('2026-01-01T00:00:00.000Z'))),
  CLOSED: example(new SubscriptionLineClosedError()),
  BELOW_OCCUPANCY: example(new SeatLedgerBelowOccupancyError()),
  EFFECTIVE_IN_CLOSED_MONTH: example(new SeatLedgerEffectiveInClosedMonthError('2026-12-01')),
  MID_TERM_REDUCTION_NOT_ALLOWED: example(new SeatLedgerMidTermReductionNotAllowedError()),
  REDUCTION_EXCEEDS_PURCHASE: example(new SeatLedgerReductionExceedsPurchaseError(2, 3)),
} as const;
