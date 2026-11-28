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
import { DepartmentNotFoundError } from '../department/department.errors';
import { refuse, toOrganizationApiException } from '../organization.http-errors';
import {
  DepartmentItSubstituteAlreadyActiveError,
  DepartmentItSubstituteAlreadyEndedError,
  DepartmentItSubstituteDepartmentInactiveError,
  DepartmentItSubstituteForbiddenError,
  DepartmentItSubstituteIsInChargeError,
  DepartmentItSubstituteNotFoundError,
  DepartmentItSubstituteNotUsableError,
} from './department-it-substitute.errors';

/** Maps department IT substitute domain errors to their HTTP responses, falling back to `toOrganizationApiException`. */
export function toDepartmentItSubstituteApiException(error: unknown): unknown {
  if (error instanceof DepartmentItSubstituteForbiddenError) {
    return new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);
  }
  if (error instanceof DepartmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEPARTMENT.NOT_FOUND', error.message);
  }
  if (error instanceof DepartmentItSubstituteNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEPARTMENT_IT_SUBSTITUTE.NOT_FOUND', error.message);
  }
  if (error instanceof DepartmentItSubstituteAlreadyActiveError) {
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT_IT_SUBSTITUTE.ALREADY_ACTIVE', error.message);
  }
  if (error instanceof DepartmentItSubstituteIsInChargeError) {
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT_IT_SUBSTITUTE.IS_IN_CHARGE', error.message);
  }
  if (error instanceof DepartmentItSubstituteDepartmentInactiveError) {
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT_IT_SUBSTITUTE.DEPARTMENT_INACTIVE', error.message);
  }
  if (error instanceof DepartmentItSubstituteAlreadyEndedError) {
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT_IT_SUBSTITUTE.ALREADY_ENDED', error.message);
  }
  if (error instanceof DepartmentItSubstituteNotUsableError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEPARTMENT_IT_SUBSTITUTE.NOT_USABLE_IT_ADMIN', error.message);
  }

  return toOrganizationApiException(error);
}

const example = (error: Error) => errorExampleOf(toDepartmentItSubstituteApiException(error));

export const DEPARTMENT_IT_SUBSTITUTE_ERROR_EXAMPLES = {
  DEPARTMENT_NOT_FOUND: example(new DepartmentNotFoundError()),
  NOT_FOUND: example(new DepartmentItSubstituteNotFoundError()),
  ALREADY_ACTIVE: example(new DepartmentItSubstituteAlreadyActiveError()),
  IS_IN_CHARGE: example(new DepartmentItSubstituteIsInChargeError()),
  DEPARTMENT_INACTIVE: example(new DepartmentItSubstituteDepartmentInactiveError()),
  ALREADY_ENDED: example(new DepartmentItSubstituteAlreadyEndedError()),
  NOT_USABLE_IT_ADMIN: example(new DepartmentItSubstituteNotUsableError()),
} as const;

export const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

export const SUPER_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the Super Admin appoints or ends temporary department IT Admin substitutes.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

export const READ_ROLES_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the Super Admin and the IT Admin may list department IT Admin substitutes.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

export const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
