import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError, toTransientError } from '../../infrastructure/database/transaction-runner';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { EmployeeNotFoundError } from '../organization/organization.errors';
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
  PasswordPolicyError,
  RoleAlreadyGrantedError,
  RoleCombinationForbiddenError,
  RoleNotGrantedError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
  SuperAdminHolderNotLockableError,
} from './errors/identity-access.errors';

function refuse(status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/**
 * 503 for a database that could not answer: a transaction's TransientDatabaseError, or the driver's
 * own error from a read outside TransactionRunner. Anything else is not an outage (undefined).
 */
export function toUnavailableApiException(error: unknown): ApiException | undefined {
  if (!(error instanceof TransientDatabaseError) && !toTransientError(error)) return undefined;

  return refuse(
    HttpStatus.SERVICE_UNAVAILABLE,
    'SERVICE_UNAVAILABLE',
    'The service is temporarily unavailable. Retry shortly.',
  );
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
    return refuse(HttpStatus.CONFLICT, 'APP_USER.ROLE_COMBINATION_FORBIDDEN', error.message);
  }
  if (error instanceof FinanceAlreadyAssignedError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.FINANCE_ALREADY_ASSIGNED', error.message);
  }
  if (error instanceof InvitationInvalidError) {
    return refuse(HttpStatus.BAD_REQUEST, 'AUTH.INVITATION_INVALID', 'The invitation link is not valid.');
  }
  if (error instanceof PasswordPolicyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'AUTH.PASSWORD_POLICY_VIOLATION', error.message, {
      violation: error.violation,
    });
  }
  return toUnavailableApiException(error) ?? error;
}
