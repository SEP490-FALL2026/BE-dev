import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  AssignmentNotFoundError,
  AssignmentNotOpenError,
  RevocationRefusedError,
  SeatTargetNotFoundError,
} from '../../licensing/public/licensing.errors';
import {
  GhostSeatNotDeciderError,
  GhostSeatNotFoundError,
  GhostSeatNotReclaimableError,
  GhostSeatPeriodInvalidError,
  GhostSeatRuleRunBusyError,
  GhostSeatSeatNotRevocableError,
} from './board.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/**
 * Maps what the board of recommendations can raise to its HTTP answers. A seat the gate of the revocation refuses is one error for
 * the client (`GHOST_SEAT.SEAT_NOT_REVOCABLE`, with the reason of the gate), whatever the gate's own class.
 */
export function toGhostSeatApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof GhostSeatNotFoundError)
    return refuse(HttpStatus.NOT_FOUND, 'GHOST_SEAT.NOT_FOUND', error.message);
  if (error instanceof GhostSeatNotDeciderError) {
    return refuse(HttpStatus.FORBIDDEN, 'GHOST_SEAT.NOT_DECIDER', error.message);
  }
  if (error instanceof GhostSeatNotReclaimableError) {
    return refuse(HttpStatus.CONFLICT, 'GHOST_SEAT.NOT_RECLAIMABLE', error.message);
  }
  if (error instanceof GhostSeatSeatNotRevocableError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'GHOST_SEAT.SEAT_NOT_REVOCABLE',
      message: error.message,
      details: { problem: error.problem },
    });
  }
  if (error instanceof RevocationRefusedError) {
    return toGhostSeatApiException(new GhostSeatSeatNotRevocableError(error.problem));
  }
  if (
    error instanceof AssignmentNotFoundError ||
    error instanceof AssignmentNotOpenError ||
    error instanceof SeatTargetNotFoundError
  ) {
    return toGhostSeatApiException(new GhostSeatSeatNotRevocableError('SEAT_NOT_OPEN'));
  }
  if (error instanceof GhostSeatRuleRunBusyError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'GHOST_SEAT.RULE_RUN_BUSY',
      message: error.message,
      details: { ruleSet: error.ruleSet, completedRunIds: [...error.completedRunIds] },
    });
  }
  if (error instanceof GhostSeatPeriodInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'GHOST_SEAT.PERIOD_INVALID', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toGhostSeatApiException(error));

export const GHOST_SEAT_ERROR_EXAMPLES = {
  NOT_FOUND: example(new GhostSeatNotFoundError()),
  NOT_RECLAIMABLE: example(new GhostSeatNotReclaimableError()),
  NOT_DECIDER: example(new GhostSeatNotDeciderError()),
  SEAT_NOT_REVOCABLE: example(new GhostSeatSeatNotRevocableError('ASSIGNMENT_IS_SERVICE_ACCOUNT')),
  PERIOD_INVALID: example(new GhostSeatPeriodInvalidError()),
  RULE_RUN_BUSY: example(new GhostSeatRuleRunBusyError('G1_G2')),
} as const;
