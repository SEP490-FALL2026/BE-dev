import { HttpStatus } from '@nestjs/common';
import {
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ORGANIZATION_ERROR_EXAMPLES } from '../mappers/organization.http-errors';

/** The answers the routes of a department share, written once for the two controllers of the capability. */
export const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

export const SUPER_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the Super Admin changes department data, on an HR basis. The IT Admin does not.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
export const VALIDATION_ERROR_DESCRIPTION =
  'The request is invalid (VALIDATION_ERROR, among them an HR basis that lacks a part) or a rule of the department refuses it; details name the reason.';
/** The routes where no rule of the department applies: only the request itself can be invalid. */
export const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE],
} as const;
export const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The department does not exist, or an IT Admin is asking about one they are not in charge of or standing in for.',
  examples: [ORGANIZATION_ERROR_EXAMPLES.DEPARTMENT_NOT_FOUND],
} as const;
