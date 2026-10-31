import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { refuse, toOrganizationApiException } from '../organization.http-errors';
import {
  PROJECT_INVALID_REASONS,
  ProjectForbiddenError,
  ProjectInvalidError,
  ProjectNotFoundError,
} from './project.errors';

/** Maps the errors of the project routes to their HTTP answers; every other error goes to the mapper of the module. */
export function toProjectApiException(error: unknown): unknown {
  if (error instanceof ProjectForbiddenError) {
    // The policy of a service refuses a role the way the guard of the route does, with the same body.
    return new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);
  }
  if (error instanceof ProjectNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'PROJECT.NOT_FOUND', error.message);
  }
  if (error instanceof ProjectInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `PROJECT.INVALID_${error.reason}`, error.message);
  }

  return toOrganizationApiException(error);
}

const example = (error: Error) => errorExampleOf(toProjectApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const PROJECT_ERROR_EXAMPLES = {
  PROJECT_NOT_FOUND: example(new ProjectNotFoundError()),
  // The reasons come from the error's own list: the placement reason DEPARTMENT_NOT_FOUND is written there, not here.
  PROJECT_INVALID_NAME: example(new ProjectInvalidError(PROJECT_INVALID_REASONS[0])),
  PROJECT_INVALID_DESCRIPTION: example(new ProjectInvalidError(PROJECT_INVALID_REASONS[1])),
  PROJECT_INVALID_DEPARTMENT_NOT_FOUND: example(new ProjectInvalidError(PROJECT_INVALID_REASONS[2])),
} as const;
