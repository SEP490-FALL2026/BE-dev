import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import {
  AccountAlreadyActivatedError,
  AccountAlreadyExistsError,
  AccountLockedError,
  AccountNotFoundError,
  EmployeeTerminatedError,
  FinanceAlreadyAssignedError,
  InvitationInvalidError,
  LoginEmailInvalidError,
  LoginEmailRequiredError,
  LoginEmailTakenError,
  ManagerStillHeadingError,
  RoleAlreadyGrantedError,
  RoleCombinationForbiddenError,
  RoleNotGrantedError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
  SuperAdminHolderNotLockableError,
} from './account.errors';

// Shared by account administration (accounts/) and the invitation redeem route of the auth controller (auth/).

function refuse(status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/**
 * Maps the errors of account management to their HTTP answers. Anything not listed is returned
 * unchanged so the global filter reports it as an unexpected error rather than hiding it.
 */
export function toAccountApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof AccountNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'APP_USER.NOT_FOUND', error.message);
  if (error instanceof EmployeeNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'ORGANIZATION.EMPLOYEE_NOT_FOUND', 'The employee was not found.');
  }
  if (error instanceof SelfChangeForbiddenError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.SELF_CHANGE_FORBIDDEN', error.message);
  }
  if (error instanceof RoleRequestRefusedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `APP_USER.${error.reason}`, error.message);
  }
  if (error instanceof EmployeeTerminatedError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.EMPLOYEE_TERMINATED', error.message);
  }
  if (error instanceof AccountAlreadyExistsError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.ALREADY_EXISTS_FOR_EMPLOYEE', error.message);
  }
  if (error instanceof LoginEmailTakenError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.LOGIN_EMAIL_TAKEN', error.message);
  }
  if (error instanceof LoginEmailRequiredError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'APP_USER.LOGIN_EMAIL_REQUIRED', error.message);
  }
  if (error instanceof LoginEmailInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'APP_USER.LOGIN_EMAIL_INVALID', error.message);
  }
  if (error instanceof AccountAlreadyActivatedError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.ALREADY_ACTIVATED', error.message);
  }
  if (error instanceof AccountLockedError) return refuse(HttpStatus.CONFLICT, 'APP_USER.ACCOUNT_LOCKED', error.message);
  if (error instanceof SuperAdminHolderNotLockableError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.SUPER_ADMIN_HOLDER_NOT_LOCKABLE', error.message);
  }
  if (error instanceof RoleAlreadyGrantedError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.ROLE_ALREADY_GRANTED', error.message);
  }
  if (error instanceof RoleNotGrantedError) {
    return refuse(HttpStatus.NOT_FOUND, 'APP_USER.ROLE_NOT_GRANTED', error.message);
  }
  if (error instanceof RoleCombinationForbiddenError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.ROLE_COMBINATION_FORBIDDEN', error.message, {
      conflictingRoles: [...error.conflictingRoles],
    });
  }
  if (error instanceof ManagerStillHeadingError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.MANAGER_STILL_HEADING', error.message, {
      headPeriods: error.headPeriods.map((period) => ({ ...period })),
    });
  }
  if (error instanceof FinanceAlreadyAssignedError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.FINANCE_ALREADY_ASSIGNED', error.message);
  }
  if (error instanceof InvitationInvalidError) {
    return refuse(HttpStatus.BAD_REQUEST, 'AUTH.INVITATION_INVALID', 'The invitation link is not valid.');
  }
  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toAccountApiException(error));
/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const ACCOUNT_ERROR_EXAMPLES = {
  NOT_FOUND: example(new AccountNotFoundError()),
  EMPLOYEE_NOT_FOUND: example(new EmployeeNotFoundError('<employee-id>')),
  SELF_CHANGE_FORBIDDEN: example(new SelfChangeForbiddenError()),
  ROLE_DERIVED: example(new RoleRequestRefusedError('ROLE_DERIVED')),
  SUPER_ADMIN_TRANSFER_ONLY: example(new RoleRequestRefusedError('SUPER_ADMIN_TRANSFER_ONLY')),
  EMPLOYEE_TERMINATED: example(new EmployeeTerminatedError()),
  ALREADY_EXISTS_FOR_EMPLOYEE: example(new AccountAlreadyExistsError()),
  LOGIN_EMAIL_TAKEN: example(new LoginEmailTakenError()),
  LOGIN_EMAIL_REQUIRED: example(new LoginEmailRequiredError()),
  LOGIN_EMAIL_INVALID: example(new LoginEmailInvalidError()),
  ALREADY_ACTIVATED: example(new AccountAlreadyActivatedError()),
  ACCOUNT_LOCKED: example(new AccountLockedError()),
  SUPER_ADMIN_HOLDER_NOT_LOCKABLE: example(new SuperAdminHolderNotLockableError()),
  ROLE_ALREADY_GRANTED: example(new RoleAlreadyGrantedError()),
  ROLE_NOT_GRANTED: example(new RoleNotGrantedError()),
  ROLE_COMBINATION_FORBIDDEN: example(new RoleCombinationForbiddenError(['IT_ADMIN'])),
  MANAGER_STILL_HEADING: example(
    new ManagerStillHeadingError([
      {
        departmentId: '<department-id>',
        departmentCode: '<department-code>',
        validFrom: '2026-01-01',
        validTo: null,
        timing: 'CURRENT',
      },
    ]),
  ),
  FINANCE_ALREADY_ASSIGNED: example(new FinanceAlreadyAssignedError()),
  INVITATION_INVALID: example(new InvitationInvalidError()),
} as const;
