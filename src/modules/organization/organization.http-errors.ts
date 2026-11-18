import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../infrastructure/http/openapi-error-examples';
import { EmployeeNotFoundError } from './public/organization.errors';

export function refuse(
  status: HttpStatus,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/**
 * Maps the errors that every route of the organization can meet to their HTTP answers: an ApiException as it is, an unknown
 * employee, and a database that cannot answer (503); anything else is returned unchanged so the global filter reports it as an
 * unexpected error. The answers of the errors of each capability are in its own `<capability>.http-errors.ts`, which falls back to
 * this one; this file imports no capability.
 */
export function toOrganizationApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof EmployeeNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'EMPLOYEE.NOT_FOUND', error.message);

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toOrganizationApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const ORGANIZATION_ERROR_EXAMPLES = {
  EMPLOYEE_NOT_FOUND: example(new EmployeeNotFoundError('<employee-id>')),
} as const;
