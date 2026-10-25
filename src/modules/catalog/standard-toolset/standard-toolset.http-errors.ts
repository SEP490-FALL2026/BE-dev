import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  ToolsetDepartmentInactiveError,
  ToolsetDepartmentNotFoundError,
  ToolsetJobTitleInactiveError,
  ToolsetJobTitleNotFoundError,
  ToolsetOutOfScopeError,
  ToolsetPlanDuplicateError,
  ToolsetPlansNotFoundError,
  ToolsetReasonRequiredError,
  ToolsetTooManyPlansError,
} from './standard-toolset.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;

/** Maps the errors of the standard toolset routes to their HTTP answers; a database that cannot answer is a 503. */
export function toToolsetApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof ToolsetDepartmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEPARTMENT.NOT_FOUND', error.message);
  }
  if (error instanceof ToolsetJobTitleNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'JOB_TITLE.NOT_FOUND', error.message);
  }
  if (error instanceof ToolsetOutOfScopeError) {
    return refuse(HttpStatus.FORBIDDEN, 'DEPARTMENT.OUT_OF_SCOPE', error.message);
  }
  if (error instanceof ToolsetReasonRequiredError) {
    return refuse(UNPROCESSABLE, 'STANDARD_TOOLSET.REASON_REQUIRED', error.message);
  }
  if (error instanceof ToolsetPlansNotFoundError) {
    return refuse(UNPROCESSABLE, 'STANDARD_TOOLSET.PLAN_NOT_FOUND', error.message, { planIds: error.planIds });
  }
  if (error instanceof ToolsetPlanDuplicateError) {
    return refuse(UNPROCESSABLE, 'STANDARD_TOOLSET.PLAN_DUPLICATE', error.message, { planId: error.planId });
  }
  if (error instanceof ToolsetTooManyPlansError) {
    return refuse(UNPROCESSABLE, 'STANDARD_TOOLSET.TOO_MANY_PLANS', error.message);
  }
  if (error instanceof ToolsetJobTitleInactiveError) {
    return refuse(UNPROCESSABLE, 'STANDARD_TOOLSET.JOB_TITLE_INACTIVE', error.message);
  }
  if (error instanceof ToolsetDepartmentInactiveError) {
    return refuse(UNPROCESSABLE, 'STANDARD_TOOLSET.DEPARTMENT_INACTIVE', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toToolsetApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const STANDARD_TOOLSET_ERROR_EXAMPLES = {
  DEPARTMENT_NOT_FOUND: example(new ToolsetDepartmentNotFoundError()),
  JOB_TITLE_NOT_FOUND: example(new ToolsetJobTitleNotFoundError()),
  OUT_OF_SCOPE: example(new ToolsetOutOfScopeError()),
  REASON_REQUIRED: example(new ToolsetReasonRequiredError()),
  PLAN_NOT_FOUND: example(new ToolsetPlansNotFoundError(['<plan-id>'])),
  PLAN_DUPLICATE: example(new ToolsetPlanDuplicateError('<plan-id>')),
  TOO_MANY_PLANS: example(new ToolsetTooManyPlansError()),
  JOB_TITLE_INACTIVE: example(new ToolsetJobTitleInactiveError()),
  DEPARTMENT_INACTIVE: example(new ToolsetDepartmentInactiveError()),
} as const;
