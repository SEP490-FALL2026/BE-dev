import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { refuse, toOrganizationApiException } from '../organization.http-errors';
import {
  DepartmentCodeTakenError,
  DepartmentCodeInvalidError,
  DepartmentForbiddenError,
  DepartmentInUseError,
  DepartmentInactiveError,
  DepartmentItAdminInvalidError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentNotYetEffectiveError,
  DepartmentOutOfScopeError,
  DepartmentOutsideBudgetPeriodError,
  DepartmentUpdateEmptyError,
  HeadAssignmentError,
} from '../department/department.errors';
import {
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';

/**
 * Maps the errors of the department routes to their HTTP answers; every other error goes to the mapper of the module
 * (`toOrganizationApiException`).
 */
export function toDepartmentApiException(error: unknown): unknown {
  if (error instanceof DepartmentForbiddenError) {
    // The policy of a service refuses a role the way the guard of the route does, with the same body.
    return new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);
  }
  if (error instanceof DepartmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEPARTMENT.NOT_FOUND', error.message);
  }
  if (error instanceof DepartmentOutOfScopeError) {
    return refuse(HttpStatus.FORBIDDEN, 'DEPARTMENT.OUT_OF_SCOPE', error.message);
  }
  if (error instanceof DepartmentCodeInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEPARTMENT.CODE_INVALID', error.message);
  }
  if (error instanceof DepartmentOutsideBudgetPeriodError) {
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT.OUTSIDE_BUDGET_PERIOD', error.message);
  }
  if (error instanceof DepartmentNotYetEffectiveError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEPARTMENT.NOT_YET_EFFECTIVE', error.message, {
      effectiveFrom: error.effectiveFrom,
    });
  }
  if (error instanceof DepartmentCodeTakenError) {
    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT.CODE_TAKEN', error.message);
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
    const { members, serviceAccounts, openWork, subscriptions } = error.groups;

    return refuse(HttpStatus.CONFLICT, 'DEPARTMENT.IN_USE', error.message, {
      members: members.items,
      totalMembers: members.total,
      serviceAccounts: serviceAccounts.items,
      totalServiceAccounts: serviceAccounts.total,
      openWork: openWork.items,
      totalOpenWork: openWork.total,
      subscriptions: subscriptions.items,
      totalSubscriptions: subscriptions.total,
    });
  }
  if (error instanceof HeadAssignmentError) {
    // A successor already named is a state of the department (409); every other problem is a fault of the request (422).
    return refuse(
      error.problem === 'SUCCESSOR_ALREADY_NAMED' ? HttpStatus.CONFLICT : HttpStatus.UNPROCESSABLE_ENTITY,
      `DEPARTMENT.HEAD_${error.problem}`,
      error.message,
    );
  }

  return toOrganizationApiException(error);
}

const example = (error: Error) => errorExampleOf(toDepartmentApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const DEPARTMENT_ERROR_EXAMPLES = {
  DEPARTMENT_NOT_FOUND: example(new DepartmentNotFoundError()),
  DEPARTMENT_OUT_OF_SCOPE: example(new DepartmentOutOfScopeError()),
  DEPARTMENT_CODE_INVALID: example(new DepartmentCodeInvalidError()),
  DEPARTMENT_CODE_TAKEN: example(new DepartmentCodeTakenError('D01')),
  DEPARTMENT_OUTSIDE_BUDGET_PERIOD: example(new DepartmentOutsideBudgetPeriodError()),
  DEPARTMENT_NOT_YET_EFFECTIVE: example(new DepartmentNotYetEffectiveError('2027-01-01')),
  DEPARTMENT_NAME_INVALID: example(new DepartmentNameInvalidError()),
  DEPARTMENT_IT_ADMIN_INVALID: example(new DepartmentItAdminInvalidError()),
  DEPARTMENT_UPDATE_EMPTY: example(new DepartmentUpdateEmptyError()),
  DEPARTMENT_INACTIVE: example(new DepartmentInactiveError()),
  DEPARTMENT_IN_USE: example(
    new DepartmentInUseError({
      members: { items: [{ employeeCode: 'E001', fullName: '<full-name>' }], total: 1 },
      serviceAccounts: { items: [], total: 0 },
      openWork: { items: [{ kind: 'ACCESS_REQUEST', id: '<request-id>', label: null }], total: 1 },
      subscriptions: { items: [{ kind: 'SUBSCRIPTION', id: '<subscription-id>', label: null }], total: 1 },
    }),
  ),
  DEPARTMENT_HEAD_DATE_IN_PAST: example(new HeadAssignmentError('DATE_IN_PAST')),
  DEPARTMENT_HEAD_EMPLOYEE_NOT_FOUND: example(new HeadAssignmentError('EMPLOYEE_NOT_FOUND')),
  DEPARTMENT_HEAD_EMPLOYEE_NOT_ACTIVE: example(new HeadAssignmentError('EMPLOYEE_NOT_ACTIVE')),
  DEPARTMENT_HEAD_SUPER_ADMIN_CANNOT_HEAD: example(new HeadAssignmentError('SUPER_ADMIN_CANNOT_HEAD')),
  DEPARTMENT_HEAD_MANAGER_ROLE_REQUIRED: example(new HeadAssignmentError('MANAGER_ROLE_REQUIRED')),
  DEPARTMENT_HEAD_SPENDING_APPROVER_CANNOT_HEAD: example(new HeadAssignmentError('SPENDING_APPROVER_CANNOT_HEAD')),
  DEPARTMENT_HEAD_NOT_A_MEMBER_ON_DATE: example(new HeadAssignmentError('NOT_A_MEMBER_ON_DATE')),
  DEPARTMENT_HEAD_HEADS_ANOTHER_DEPARTMENT: example(new HeadAssignmentError('HEADS_ANOTHER_DEPARTMENT')),
  DEPARTMENT_HEAD_SUCCESSOR_DATE_NOT_FUTURE: example(new HeadAssignmentError('SUCCESSOR_DATE_NOT_FUTURE')),
  DEPARTMENT_HEAD_SUCCESSOR_NEEDS_A_HEAD: example(new HeadAssignmentError('SUCCESSOR_NEEDS_A_HEAD')),
  DEPARTMENT_HEAD_SUCCESSOR_IS_THE_HEAD: example(new HeadAssignmentError('SUCCESSOR_IS_THE_HEAD')),
  DEPARTMENT_HEAD_SUCCESSOR_ALREADY_NAMED: example(new HeadAssignmentError('SUCCESSOR_ALREADY_NAMED')),
} as const;

/** The answers the routes of a department share, written once for the two controllers of the capability. */
export const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

export const SUPER_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the Super Admin changes department data. The IT Admin does not.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
/** The reads of the departments: the Super Admin reads all, the IT Admin the departments they are in charge of or stand in for. */
export const READ_ROLES_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the Super Admin and the IT Admin list departments; the IT Admin sees only the departments they are in charge of or stand in for.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
export const VALIDATION_ERROR_DESCRIPTION =
  'The request is invalid (VALIDATION_ERROR, among them a name or a function over its limit or a field the route does not take) or a rule of the department refuses it; details name the reason.';
/** The department is retired: it takes no change to its profile, no head and no successor. */
export const DEPARTMENT_INACTIVE_RESPONSE = {
  status: HttpStatus.CONFLICT,
  description: 'The department is retired (DEPARTMENT.INACTIVE).',
  examples: [DEPARTMENT_ERROR_EXAMPLES.DEPARTMENT_INACTIVE],
} as const;
/** The routes where no rule of the department applies: only the request itself can be invalid. */
export const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE],
} as const;
/** The reads take no HR basis and no rule of the department applies: only the query, the id, or both can be invalid. */
export const QUERY_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
export const ID_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is not a UUID (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
export const ID_OR_QUERY_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id or the query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
export const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The department does not exist, or an IT Admin is asking about one they are not in charge of or standing in for.',
  examples: [DEPARTMENT_ERROR_EXAMPLES.DEPARTMENT_NOT_FOUND],
} as const;
