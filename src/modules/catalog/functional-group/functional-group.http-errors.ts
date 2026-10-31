import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  FunctionalGroupNameInvalidError,
  FunctionalGroupNameTakenError,
  FunctionalGroupNotFoundError,
  FunctionalGroupUpdateEmptyError,
} from './functional-group.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the functional group routes to their HTTP answers; anything unknown goes on unchanged. */
export function toFunctionalGroupApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof FunctionalGroupNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'FUNCTIONAL_GROUP.NOT_FOUND', error.message);
  }
  if (error instanceof FunctionalGroupNameTakenError) {
    return refuse(HttpStatus.CONFLICT, 'FUNCTIONAL_GROUP.NAME_TAKEN', error.message);
  }
  if (error instanceof FunctionalGroupNameInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'FUNCTIONAL_GROUP.NAME_INVALID', error.message);
  }
  if (error instanceof FunctionalGroupUpdateEmptyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'FUNCTIONAL_GROUP.UPDATE_EMPTY', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toFunctionalGroupApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const FUNCTIONAL_GROUP_ERROR_EXAMPLES = {
  NOT_FOUND: example(new FunctionalGroupNotFoundError()),
  NAME_TAKEN: example(new FunctionalGroupNameTakenError()),
  NAME_INVALID: example(new FunctionalGroupNameInvalidError()),
  UPDATE_EMPTY: example(new FunctionalGroupUpdateEmptyError()),
} as const;
