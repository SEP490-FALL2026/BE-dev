import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  CollectorAllowlistApplicationNotEligibleError,
  CollectorAllowlistApplicationNotFoundError,
  CollectorAllowlistUnchangedError,
} from './allowlist.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the allowlist routes to their HTTP answers; a database that cannot answer is a 503. */
export function toAllowlistApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof CollectorAllowlistApplicationNotFoundError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'COLLECTOR_ALLOWLIST.APPLICATION_NOT_FOUND', error.message);
  }
  if (error instanceof CollectorAllowlistApplicationNotEligibleError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'COLLECTOR_ALLOWLIST.APPLICATION_NOT_ELIGIBLE', error.message);
  }
  if (error instanceof CollectorAllowlistUnchangedError) {
    return refuse(HttpStatus.CONFLICT, 'COLLECTOR_ALLOWLIST.UNCHANGED', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toAllowlistApiException(error));

export const ALLOWLIST_ERROR_EXAMPLES = {
  APPLICATION_NOT_FOUND: example(new CollectorAllowlistApplicationNotFoundError()),
  APPLICATION_NOT_ELIGIBLE: example(new CollectorAllowlistApplicationNotEligibleError()),
  UNCHANGED: example(new CollectorAllowlistUnchangedError()),
} as const;
