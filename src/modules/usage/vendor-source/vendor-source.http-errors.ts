import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { UsageSourceRefusedError, type UsageSourceProblem } from './vendor-source.errors';

const STATUS: Record<UsageSourceProblem, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  APPLICATION_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  APPLICATION_INTERNAL: HttpStatus.UNPROCESSABLE_ENTITY,
  APPLICATION_RETIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  COMMUNICATION_APP: HttpStatus.UNPROCESSABLE_ENTITY,
  TEMPLATE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  TEMPLATE_CAPABILITY_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  NAME_TAKEN: HttpStatus.CONFLICT,
  IN_USE: HttpStatus.CONFLICT,
};

/** Maps the errors of the usage source routes to their HTTP answers; a database that cannot answer is a 503. */
export function toUsageSourceApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof UsageSourceRefusedError) {
    return new ApiException(STATUS[error.problem], {
      code: `USAGE_SOURCE.${error.problem}`,
      message: error.message,
      ...(Object.keys(error.details).length > 0 ? { details: error.details } : {}),
    });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (problem: UsageSourceProblem, details: Record<string, unknown> = {}) =>
  errorExampleOf(toUsageSourceApiException(new UsageSourceRefusedError(problem, details)));

export const USAGE_SOURCE_ERROR_EXAMPLES = {
  NOT_FOUND: example('NOT_FOUND'),
  APPLICATION_NOT_FOUND: example('APPLICATION_NOT_FOUND'),
  APPLICATION_INTERNAL: example('APPLICATION_INTERNAL'),
  APPLICATION_RETIRED: example('APPLICATION_RETIRED'),
  COMMUNICATION_APP: example('COMMUNICATION_APP'),
  TEMPLATE_INVALID: example('TEMPLATE_INVALID', { reason: 'EVENT_NEEDS_CLASSES' }),
  TEMPLATE_CAPABILITY_MISMATCH: example('TEMPLATE_CAPABILITY_MISMATCH', { reason: 'CAPABILITY_MISMATCH' }),
  NAME_TAKEN: example('NAME_TAKEN'),
  IN_USE: example('IN_USE', { fields: ['identifierType'] }),
} as const;
