import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../infrastructure/http/errors/service-unavailable';
import {
  CostCenterCodeTakenError,
  CostCenterInUseError,
  CostCenterKindNotSupportedError,
  CostCenterNameInvalidError,
  CostCenterNameReservedError,
  CostCenterNotFoundError,
} from './errors/cost-center.errors';
import {
  DepartmentCodeTakenError,
  DepartmentCostCenterError,
  DepartmentInUseError,
  DepartmentInactiveError,
  DepartmentItAdminInvalidError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentOutOfScopeError,
  DepartmentUpdateEmptyError,
  HeadAssignmentError,
  ProjectInvalidError,
  ProjectNotFoundError,
} from './errors/department.errors';
import {
  EmployeeRowInvalidError,
  JobTitleNameRequiredError,
  JobTitleNameTakenError,
  JobTitleNameTooLongError,
  JobTitleNotFoundError,
} from './errors/organization.errors';

function refuse(status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/**
 * Maps the errors of the organization routes to their HTTP answers. A database that cannot answer is a 503;
 * anything else is returned unchanged so the global filter reports it as an unexpected error.
 */
export function toOrganizationApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof EmployeeRowInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'EMPLOYEE.ROW_INVALID', error.message, {
      reasons: error.reasons,
    });
  }
  if (error instanceof JobTitleNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'JOB_TITLE.NOT_FOUND', error.message);
  if (error instanceof JobTitleNameRequiredError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'JOB_TITLE.NAME_REQUIRED', error.message);
  }
  if (error instanceof JobTitleNameTooLongError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'JOB_TITLE.NAME_TOO_LONG', error.message);
  }
  if (error instanceof JobTitleNameTakenError) {
    return refuse(
      HttpStatus.CONFLICT,
      'JOB_TITLE.NAME_TAKEN',
      error.message,
      error.conflict ? { conflict: error.conflict } : undefined,
    );
  }

  if (error instanceof CostCenterNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'COST_CENTER.NOT_FOUND', error.message);
  }
  if (error instanceof CostCenterCodeTakenError) {
    return refuse(HttpStatus.CONFLICT, 'COST_CENTER.CODE_TAKEN', error.message);
  }
  if (error instanceof CostCenterKindNotSupportedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'COST_CENTER.KIND_NOT_SUPPORTED', error.message);
  }
  if (error instanceof CostCenterNameReservedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'COST_CENTER.NAME_RESERVED', error.message);
  }
  if (error instanceof CostCenterNameInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'COST_CENTER.NAME_INVALID', error.message);
  }
  if (error instanceof CostCenterInUseError) {
    return refuse(HttpStatus.CONFLICT, 'COST_CENTER.IN_USE', error.message, {
      department: error.department,
      employees: error.employees,
      totalEmployees: error.totalEmployees,
    });
  }

  if (error instanceof DepartmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEPARTMENT.NOT_FOUND', error.message);
  }
  if (error instanceof DepartmentOutOfScopeError) {
    return refuse(HttpStatus.FORBIDDEN, 'DEPARTMENT.OUT_OF_SCOPE', error.message);
  }
  if (error instanceof DepartmentCodeTakenError) {
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT.CODE_TAKEN', error.message);
  }
  if (error instanceof DepartmentCostCenterError) {
    const status = error.problem === 'TAKEN' ? HttpStatus.CONFLICT : HttpStatus.UNPROCESSABLE_ENTITY;

    return refuse(status, `DEPARTMENT.COST_CENTER_${error.problem}`, error.message);
  }
  if (error instanceof DepartmentNameInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEPARTMENT.NAME_INVALID', error.message);
  }
  if (error instanceof DepartmentItAdminInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEPARTMENT.IT_ADMIN_INVALID', error.message);
  }
  if (error instanceof DepartmentUpdateEmptyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEPARTMENT.UPDATE_EMPTY', error.message);
  }
  if (error instanceof DepartmentInactiveError) {
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT.INACTIVE', error.message);
  }
  if (error instanceof DepartmentInUseError) {
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT.IN_USE', error.message, {
      members: error.members,
      totalMembers: error.totalMembers,
      openWork: [],
    });
  }
  if (error instanceof HeadAssignmentError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `DEPARTMENT.HEAD_${error.problem}`, error.message);
  }
  if (error instanceof ProjectNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'PROJECT.NOT_FOUND', error.message);
  }
  if (error instanceof ProjectInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `PROJECT.INVALID_${error.reason}`, error.message);
  }

  return toUnavailableApiException(error) ?? error;
}
