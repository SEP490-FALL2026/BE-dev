import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
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
