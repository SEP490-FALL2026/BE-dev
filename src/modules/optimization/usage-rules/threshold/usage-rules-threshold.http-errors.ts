import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../../infrastructure/http/openapi-error-examples';
import {
  GhostSeatThresholdApplicationInternalError,
  GhostSeatThresholdApplicationNotFoundError,
  GhostSeatThresholdOrderError,
} from './usage-rules-threshold.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps what the thresholds of an application can raise to its HTTP answers. */
export function toThresholdApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof GhostSeatThresholdOrderError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'GHOST_SEAT.THRESHOLD_ORDER', error.message);
  }
  if (error instanceof GhostSeatThresholdApplicationInternalError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'GHOST_SEAT.APPLICATION_INTERNAL', error.message);
  }
  if (error instanceof GhostSeatThresholdApplicationNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'GHOST_SEAT.APPLICATION_NOT_FOUND', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toThresholdApiException(error));

export const THRESHOLD_ERROR_EXAMPLES = {
  THRESHOLD_ORDER: example(new GhostSeatThresholdOrderError()),
  APPLICATION_INTERNAL: example(new GhostSeatThresholdApplicationInternalError()),
  APPLICATION_NOT_FOUND: example(new GhostSeatThresholdApplicationNotFoundError()),
} as const;
