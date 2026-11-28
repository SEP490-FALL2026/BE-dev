import { HttpStatus } from '@nestjs/common';
import {
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { ORGANIZATION_ERROR_EXAMPLES, refuse, toOrganizationApiException } from '../organization.http-errors';
import {
  UnplacedWorkDesignationAlreadyActiveError,
  UnplacedWorkDesignationAlreadyEndedError,
  UnplacedWorkDesignationEmployeePlacedError,
  UnplacedWorkDesignationForbiddenError,
  UnplacedWorkDesignationNotFoundError,
  UnplacedWorkDesignationNotUsableError,
} from './unplaced-work-designation.errors';

/** Maps unplaced-work designation domain errors to their HTTP responses, falling back to `toOrganizationApiException`. */
export function toUnplacedWorkDesignationApiException(error: unknown): unknown {
  if (error instanceof UnplacedWorkDesignationForbiddenError) {
    return new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);
  }
  if (error instanceof UnplacedWorkDesignationNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'UNPLACED_WORK_DESIGNATION.NOT_FOUND', error.message);
  }
  if (error instanceof UnplacedWorkDesignationEmployeePlacedError) {
    return refuse(HttpStatus.CONFLICT, 'UNPLACED_WORK_DESIGNATION.EMPLOYEE_PLACED', error.message);
  }
  if (error instanceof UnplacedWorkDesignationAlreadyActiveError) {
    return refuse(HttpStatus.CONFLICT, 'UNPLACED_WORK_DESIGNATION.ALREADY_ACTIVE', error.message);
  }
  if (error instanceof UnplacedWorkDesignationAlreadyEndedError) {
    return refuse(HttpStatus.CONFLICT, 'UNPLACED_WORK_DESIGNATION.ALREADY_ENDED', error.message);
  }
  if (error instanceof UnplacedWorkDesignationNotUsableError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'UNPLACED_WORK_DESIGNATION.NOT_USABLE_IT_ADMIN', error.message);
  }

  return toOrganizationApiException(error);
}

const example = (error: Error) => errorExampleOf(toUnplacedWorkDesignationApiException(error));

export const UNPLACED_WORK_DESIGNATION_ERROR_EXAMPLES = {
  EMPLOYEE_NOT_FOUND: ORGANIZATION_ERROR_EXAMPLES.EMPLOYEE_NOT_FOUND,
  NOT_FOUND: example(new UnplacedWorkDesignationNotFoundError()),
  EMPLOYEE_PLACED: example(new UnplacedWorkDesignationEmployeePlacedError()),
  ALREADY_ACTIVE: example(new UnplacedWorkDesignationAlreadyActiveError()),
  ALREADY_ENDED: example(new UnplacedWorkDesignationAlreadyEndedError()),
  NOT_USABLE_IT_ADMIN: example(new UnplacedWorkDesignationNotUsableError()),
} as const;

export const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

export const SUPER_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the Super Admin appoints or ends unplaced-work IT Admin designations.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

export const READ_ROLES_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the Super Admin and the IT Admin may list unplaced-work IT Admin designations.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

export const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
