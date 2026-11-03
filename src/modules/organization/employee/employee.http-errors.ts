import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { DepartmentInactiveError, DepartmentNotFoundError } from '../department/department.errors';
import { refuse, toOrganizationApiException } from '../organization.http-errors';
import {
  FirstPlacementError,
  EmployeeForbiddenError,
  EmployeeRowInvalidError,
  EmployeeSelfChangeForbiddenError,
  EmployeeUpdateEmptyError,
} from './employee.errors';

/** Maps the errors of the employee routes to their HTTP answers; every other error goes to the mapper of the module. */
export function toEmployeeApiException(error: unknown): unknown {
  if (error instanceof FirstPlacementError)
    return refuse(
      error.problem === 'DATE_INVALID' ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.CONFLICT,
      `EMPLOYEE.${error.problem}`,
      error.message,
    );
  if (error instanceof EmployeeForbiddenError) {
    // The policy of a service refuses a role the way the guard of the route does, with the same body.
    return new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);
  }
  if (error instanceof EmployeeSelfChangeForbiddenError) {
    return refuse(HttpStatus.FORBIDDEN, 'EMPLOYEE.SELF_CHANGE_FORBIDDEN', error.message);
  }
  if (error instanceof EmployeeRowInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'EMPLOYEE.ROW_INVALID', error.message, {
      reasons: error.reasons,
    });
  }
  if (error instanceof EmployeeUpdateEmptyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'EMPLOYEE.UPDATE_EMPTY', error.message);
  }

  if (error instanceof DepartmentNotFoundError)
    return refuse(HttpStatus.NOT_FOUND, 'DEPARTMENT.NOT_FOUND', error.message);
  if (error instanceof DepartmentInactiveError)
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT.INACTIVE', error.message);
  return toOrganizationApiException(error);
}

const example = (error: Error) => errorExampleOf(toEmployeeApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const EMPLOYEE_ERROR_EXAMPLES = {
  EMPLOYEE_NOT_FOUND: example(new EmployeeNotFoundError('<employee-id>')),
  DEPARTMENT_NOT_FOUND: example(new DepartmentNotFoundError()),
  DEPARTMENT_INACTIVE: example(new DepartmentInactiveError()),
  EMPLOYEE_ALREADY_PLACED: example(new FirstPlacementError('ALREADY_PLACED')),
  EMPLOYEE_INACTIVE: example(new FirstPlacementError('EMPLOYEE_INACTIVE')),
  EMPLOYEE_LEAVING: example(new FirstPlacementError('EMPLOYEE_LEAVING')),
  EMPLOYEE_DATE_INVALID: example(new FirstPlacementError('DATE_INVALID')),
  EMPLOYEE_ROW_INVALID: example(new EmployeeRowInvalidError([{ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' }])),
  /** The same code when an official field is corrected: the reasons name the fields that route changes. */
  EMPLOYEE_UPDATE_ROW_INVALID: example(new EmployeeRowInvalidError([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }])),
  EMPLOYEE_UPDATE_EMPTY: example(new EmployeeUpdateEmptyError()),
  EMPLOYEE_SELF_CHANGE_FORBIDDEN: example(new EmployeeSelfChangeForbiddenError()),
} as const;
