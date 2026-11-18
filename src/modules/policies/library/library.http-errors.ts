import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  PolicyDraftNotFoundError,
  PolicyNotFoundError,
  PolicyNotPublishedError,
  PolicyStepNotFoundError,
  PolicyStepSetFixedError,
  PolicySystemItemUnknownError,
  PolicyVersionNotFoundError,
} from './library.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps the errors of the library routes to their HTTP answers; a database that cannot answer is a 503. */
export function toLibraryApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof PolicyNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'POLICY.NOT_FOUND', error.message);
  if (error instanceof PolicyVersionNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'POLICY.VERSION_NOT_FOUND', error.message);
  }
  if (error instanceof PolicyStepNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'POLICY.STEP_NOT_FOUND', error.message);
  }
  if (error instanceof PolicyDraftNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'POLICY.DRAFT_NOT_FOUND', error.message);
  }
  if (error instanceof PolicyStepSetFixedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'POLICY.STEP_SET_FIXED', error.message, {
      added: error.added,
      removed: error.removed,
    });
  }
  if (error instanceof PolicySystemItemUnknownError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'POLICY.SYSTEM_ITEM_UNKNOWN', error.message, { items: error.items });
  }
  if (error instanceof PolicyNotPublishedError) {
    return refuse(HttpStatus.CONFLICT, 'POLICY.NOT_PUBLISHED', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toLibraryApiException(error));

export const LIBRARY_ERROR_EXAMPLES = {
  NOT_FOUND: example(new PolicyNotFoundError()),
  VERSION_NOT_FOUND: example(new PolicyVersionNotFoundError()),
  STEP_NOT_FOUND: example(new PolicyStepNotFoundError()),
  DRAFT_NOT_FOUND: example(new PolicyDraftNotFoundError()),
  NOT_PUBLISHED: example(new PolicyNotPublishedError()),
  STEP_SET_FIXED: example(new PolicyStepSetFixedError(['1.9'], [])),
  SYSTEM_ITEM_UNKNOWN: example(new PolicySystemItemUnknownError(['1.2-04'])),
} as const;
