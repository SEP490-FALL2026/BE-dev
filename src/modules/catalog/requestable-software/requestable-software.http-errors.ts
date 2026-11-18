import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  RequestableApplicationNotFoundError,
  RequestablePlanNotFoundError,
  RequestableSoftwareNoDepartmentError,
} from './requestable-software.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the routes that offer software for a request to their HTTP answers; anything unknown goes on unchanged. */
export function toRequestableSoftwareApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof RequestableApplicationNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'REQUESTABLE_SOFTWARE.APPLICATION_NOT_FOUND', error.message);
  }
  if (error instanceof RequestablePlanNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'REQUESTABLE_SOFTWARE.PLAN_NOT_FOUND', error.message);
  }
  if (error instanceof RequestableSoftwareNoDepartmentError) {
    return refuse(HttpStatus.CONFLICT, 'REQUESTABLE_SOFTWARE.NO_DEPARTMENT', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toRequestableSoftwareApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const REQUESTABLE_SOFTWARE_ERROR_EXAMPLES = {
  APPLICATION_NOT_FOUND: example(new RequestableApplicationNotFoundError()),
  PLAN_NOT_FOUND: example(new RequestablePlanNotFoundError()),
  NO_DEPARTMENT: example(new RequestableSoftwareNoDepartmentError()),
} as const;
