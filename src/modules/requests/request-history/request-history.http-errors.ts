import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import { RequestHistoryRefusedError } from './request-history.errors';

const STATUS: Readonly<Record<RequestHistoryRefusedError['code'], HttpStatus>> = {
  OUT_OF_SCOPE: HttpStatus.FORBIDDEN,
  DEPARTMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
};

/**
 * Maps a refusal of a history of requests to its answer; the errors of the requests themselves (a request that is not read is
 * `ACCESS_REQUEST.NOT_FOUND`) and a database that cannot answer go through the mapper of the requests.
 */
export function toRequestHistoryApiException(error: unknown): unknown {
  if (error instanceof RequestHistoryRefusedError) {
    return new ApiException(STATUS[error.code], {
      code: `ACCESS_REQUEST_HISTORY.${error.code}`,
      message: error.message,
    });
  }

  return toAccessRequestApiException(error);
}

const example = (error: Error) => errorExampleOf(toRequestHistoryApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const REQUEST_HISTORY_ERROR_EXAMPLES = {
  OUT_OF_SCOPE: example(new RequestHistoryRefusedError('OUT_OF_SCOPE')),
  DEPARTMENT_NOT_FOUND: example(new RequestHistoryRefusedError('DEPARTMENT_NOT_FOUND')),
} as const;
