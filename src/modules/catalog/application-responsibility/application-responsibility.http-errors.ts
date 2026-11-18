import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { ApplicationNotFoundError } from '../catalog-entry/application.errors';
import {
  ApplicationResponsibilityForbiddenError,
  ApplicationResponsibleNotItAdminError,
} from './application-responsibility.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the responsibility transfer to their HTTP answers; anything unknown goes on unchanged. */
export function toResponsibilityApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof ApplicationNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'APPLICATION.NOT_FOUND', error.message);
  }
  if (error instanceof ApplicationResponsibilityForbiddenError) {
    return refuse(HttpStatus.FORBIDDEN, 'APPLICATION.RESPONSIBILITY_NOT_YOURS', error.message);
  }
  if (error instanceof ApplicationResponsibleNotItAdminError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'APPLICATION.RESPONSIBLE_NOT_IT_ADMIN', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toResponsibilityApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const RESPONSIBILITY_ERROR_EXAMPLES = {
  NOT_FOUND: example(new ApplicationNotFoundError()),
  RESPONSIBILITY_NOT_YOURS: example(new ApplicationResponsibilityForbiddenError()),
  RESPONSIBLE_NOT_IT_ADMIN: example(new ApplicationResponsibleNotItAdminError()),
} as const;
