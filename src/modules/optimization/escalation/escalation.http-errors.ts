import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { GhostSeatEscalationKeyReusedError } from './escalation.errors';

/** Maps what the early push can raise to its HTTP answers; a recommendation that cannot be pushed is a result of the batch, never an error. */
export function toEscalationApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof GhostSeatEscalationKeyReusedError) {
    return new ApiException(HttpStatus.CONFLICT, { code: 'GHOST_SEAT.ESCALATION_KEY_REUSED', message: error.message });
  }

  return toUnavailableApiException(error) ?? error;
}

export const ESCALATION_ERROR_EXAMPLES = {
  KEY_REUSED: errorExampleOf(toEscalationApiException(new GhostSeatEscalationKeyReusedError())),
} as const;
