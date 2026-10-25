import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  CostCenterCodeTakenError,
  CostCenterInUseError,
  CostCenterKindNotSupportedError,
  CostCenterNameInvalidError,
  CostCenterNameReservedError,
  CostCenterNotFoundError,
} from '../cost-center/cost-center.errors';
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
} from '../department/department.errors';
import {
  EmployeeAnotherItAdminNeededError,
  EmployeeRowInvalidError,
  EmployeeUpdateEmptyError,
} from '../employee/employee.errors';
import { EmployeeNotFoundError } from '../organization.errors';
import {
  JobTitleNameRequiredError,
  JobTitleNameTakenError,
  JobTitleNameTooLongError,
  JobTitleNotFoundError,
} from '../job-title/job-title.errors';
import { PROJECT_INVALID_REASONS, ProjectInvalidError, ProjectNotFoundError } from '../project/project.errors';

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
  if (error instanceof EmployeeNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'EMPLOYEE.NOT_FOUND', error.message);
  if (error instanceof EmployeeUpdateEmptyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'EMPLOYEE.UPDATE_EMPTY', error.message);
  }
  if (error instanceof EmployeeAnotherItAdminNeededError) {
    return refuse(HttpStatus.FORBIDDEN, 'EMPLOYEE.ANOTHER_IT_ADMIN_NEEDED', error.message);
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
      serviceAccounts: error.serviceAccounts,
      totalServiceAccounts: error.totalServiceAccounts,
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

const example = (error: Error) => errorExampleOf(toOrganizationApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const ORGANIZATION_ERROR_EXAMPLES = {
  EMPLOYEE_ROW_INVALID: example(new EmployeeRowInvalidError([{ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' }])),
  /** The same code when an official field is corrected: the reasons name the fields that route changes. */
  EMPLOYEE_UPDATE_ROW_INVALID: example(new EmployeeRowInvalidError([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }])),
  EMPLOYEE_NOT_FOUND: example(new EmployeeNotFoundError('<employee-id>')),
  EMPLOYEE_UPDATE_EMPTY: example(new EmployeeUpdateEmptyError()),
  EMPLOYEE_ANOTHER_IT_ADMIN_NEEDED: example(new EmployeeAnotherItAdminNeededError()),
  JOB_TITLE_NOT_FOUND: example(new JobTitleNotFoundError()),
  JOB_TITLE_NAME_REQUIRED: example(new JobTitleNameRequiredError()),
  JOB_TITLE_NAME_TOO_LONG: example(new JobTitleNameTooLongError()),
  JOB_TITLE_NAME_TAKEN: example(
    new JobTitleNameTakenError({ id: '<job-title-id>', name: 'Designer', status: 'ACTIVE' }),
  ),
  COST_CENTER_NOT_FOUND: example(new CostCenterNotFoundError()),
  COST_CENTER_CODE_TAKEN: example(new CostCenterCodeTakenError('CC-01')),
  COST_CENTER_KIND_NOT_SUPPORTED: example(new CostCenterKindNotSupportedError()),
  COST_CENTER_NAME_RESERVED: example(new CostCenterNameReservedError()),
  COST_CENTER_NAME_INVALID: example(new CostCenterNameInvalidError()),
  COST_CENTER_IN_USE: example(
    new CostCenterInUseError(
      { id: '<department-id>', code: 'D01', name: '<department-name>' },
      [{ employeeCode: 'E001', fullName: '<full-name>' }],
      1,
    ),
  ),
  DEPARTMENT_NOT_FOUND: example(new DepartmentNotFoundError()),
  DEPARTMENT_OUT_OF_SCOPE: example(new DepartmentOutOfScopeError()),
  DEPARTMENT_CODE_TAKEN: example(new DepartmentCodeTakenError('D01')),
  DEPARTMENT_COST_CENTER_TAKEN: example(new DepartmentCostCenterError('TAKEN')),
  DEPARTMENT_COST_CENTER_NOT_FOUND: example(new DepartmentCostCenterError('NOT_FOUND')),
  DEPARTMENT_COST_CENTER_INACTIVE: example(new DepartmentCostCenterError('INACTIVE')),
  DEPARTMENT_NAME_INVALID: example(new DepartmentNameInvalidError()),
  DEPARTMENT_IT_ADMIN_INVALID: example(new DepartmentItAdminInvalidError()),
  DEPARTMENT_UPDATE_EMPTY: example(new DepartmentUpdateEmptyError()),
  DEPARTMENT_IN_USE: example(new DepartmentInUseError([{ employeeCode: 'E001', fullName: '<full-name>' }], 1)),
  DEPARTMENT_HEAD_DATE_IN_PAST: example(new HeadAssignmentError('DATE_IN_PAST')),
  DEPARTMENT_HEAD_EMPLOYEE_NOT_FOUND: example(new HeadAssignmentError('EMPLOYEE_NOT_FOUND')),
  DEPARTMENT_HEAD_EMPLOYEE_NOT_ACTIVE: example(new HeadAssignmentError('EMPLOYEE_NOT_ACTIVE')),
  DEPARTMENT_HEAD_SUPER_ADMIN_CANNOT_HEAD: example(new HeadAssignmentError('SUPER_ADMIN_CANNOT_HEAD')),
  DEPARTMENT_HEAD_NOT_A_MEMBER_ON_DATE: example(new HeadAssignmentError('NOT_A_MEMBER_ON_DATE')),
  DEPARTMENT_HEAD_HEADS_ANOTHER_DEPARTMENT: example(new HeadAssignmentError('HEADS_ANOTHER_DEPARTMENT')),
  PROJECT_NOT_FOUND: example(new ProjectNotFoundError()),
  // The reasons come from the error's own list: the placement reason DEPARTMENT_NOT_FOUND is written there, not here.
  PROJECT_INVALID_NAME: example(new ProjectInvalidError(PROJECT_INVALID_REASONS[0])),
  PROJECT_INVALID_DESCRIPTION: example(new ProjectInvalidError(PROJECT_INVALID_REASONS[1])),
  PROJECT_INVALID_DEPARTMENT_NOT_FOUND: example(new ProjectInvalidError(PROJECT_INVALID_REASONS[2])),
} as const;
