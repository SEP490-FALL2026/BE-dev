import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  GhostSeatAlreadyReturnedError,
  GhostSeatDecisionNotFoundError,
  GhostSeatDecisionRefusedError,
  GhostSeatNotReturnableError,
  GhostSeatTaskInProgressError,
  type DecisionItemCode,
} from './decision.errors';

const STATUS_OF: Readonly<Record<DecisionItemCode, HttpStatus>> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_DECIDER: HttpStatus.FORBIDDEN,
  PAUSED: HttpStatus.CONFLICT,
  NOT_DECIDABLE: HttpStatus.CONFLICT,
  SEAT_NOT_REVOCABLE: HttpStatus.CONFLICT,
  EXEMPTION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  EXEMPTION_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
};

const MESSAGE_OF: Readonly<Record<DecisionItemCode, string>> = {
  NOT_FOUND: 'The recommendation does not exist.',
  NOT_DECIDER: 'Only the head of the department that was asked can decide on this recommendation.',
  PAUSED: 'The recommendation is paused while its holder is in a transfer.',
  NOT_DECIDABLE: 'The recommendation is not waiting for a decision.',
  SEAT_NOT_REVOCABLE: 'The seat cannot be revoked.',
  EXEMPTION_REQUIRED: 'An exemption needs the day it lasts to.',
  EXEMPTION_TOO_LONG: 'An exemption lasts after today and at most 12 months.',
};

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps what the queue of the heads can raise to its HTTP answers; a batch names each recommendation that is wrong in `details.items`. */
export function toDecisionApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof GhostSeatDecisionRefusedError) {
    const first = error.items[0].code;

    return new ApiException(STATUS_OF[first], {
      code: `GHOST_SEAT.${first}`,
      message: MESSAGE_OF[first],
      details: { items: error.items.map((item) => ({ recommendationId: item.recommendationId, code: item.code })) },
    });
  }
  if (error instanceof GhostSeatDecisionNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'GHOST_SEAT.NOT_FOUND', error.message);
  }
  if (error instanceof GhostSeatNotReturnableError) {
    return refuse(HttpStatus.CONFLICT, 'GHOST_SEAT.NOT_RETURNABLE', error.message);
  }
  if (error instanceof GhostSeatAlreadyReturnedError) {
    return refuse(HttpStatus.CONFLICT, 'GHOST_SEAT.ALREADY_RETURNED', error.message);
  }
  if (error instanceof GhostSeatTaskInProgressError) {
    return refuse(HttpStatus.CONFLICT, 'GHOST_SEAT.TASK_IN_PROGRESS', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toDecisionApiException(error));

export const DECISION_ERROR_EXAMPLES = {
  NOT_FOUND: example(new GhostSeatDecisionNotFoundError()),
  NOT_DECIDER: example(
    new GhostSeatDecisionRefusedError([{ recommendationId: 'recommendation-id', code: 'NOT_DECIDER' }]),
  ),
  PAUSED: example(new GhostSeatDecisionRefusedError([{ recommendationId: 'recommendation-id', code: 'PAUSED' }])),
  EXEMPTION_TOO_LONG: example(
    new GhostSeatDecisionRefusedError([{ recommendationId: 'recommendation-id', code: 'EXEMPTION_TOO_LONG' }]),
  ),
  NOT_RETURNABLE: example(new GhostSeatNotReturnableError()),
  ALREADY_RETURNED: example(new GhostSeatAlreadyReturnedError()),
  TASK_IN_PROGRESS: example(new GhostSeatTaskInProgressError()),
} as const;
