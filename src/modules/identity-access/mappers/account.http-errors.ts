import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
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
  RoleAlreadyGrantedError,
  RoleCombinationForbiddenError,
  RoleNotGrantedError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
  SuperAdminHolderNotLockableError,
  SuperAdminTransferRefusedError,
  type SuperAdminTransferProblem,
} from '../accounts/account.errors';

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
    return refuse(HttpStatus.CONFLICT, 'APP_USER.ROLE_COMBINATION_FORBIDDEN', error.message);
  }
  if (error instanceof FinanceAlreadyAssignedError) {
    return refuse(HttpStatus.CONFLICT, 'APP_USER.FINANCE_ALREADY_ASSIGNED', error.message);
  }
  if (error instanceof InvitationInvalidError) {
    return refuse(HttpStatus.BAD_REQUEST, 'AUTH.INVITATION_INVALID', 'The invitation link is not valid.');
  }
  return toUnavailableApiException(error) ?? error;
}

/** The Super Admin transfer (`US-01-09`): its refusals first, then the account answers. */
export function toSuperAdminTransferApiException(error: unknown): unknown {
  if (error instanceof SuperAdminTransferRefusedError) {
    if (error.problem === 'NOT_HOLDER') {
      // The role moved while this request was waiting (US-01-09 AC-5): the same answer as a caller who never had it.
      return new ApiException(HttpStatus.FORBIDDEN, {
        code: 'AUTHORIZATION.FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }
    const status = error.problem === 'SUCCESSOR_NOT_FOUND' ? HttpStatus.NOT_FOUND : HttpStatus.UNPROCESSABLE_ENTITY;

    return new ApiException(status, { code: `SUPER_ADMIN_TRANSFER.${error.problem}`, message: error.message });
  }

  return toAccountApiException(error);
}

const example = (error: Error) => errorExampleOf(toAccountApiException(error));
const transferExample = (problem: SuperAdminTransferProblem) =>
  errorExampleOf(toSuperAdminTransferApiException(new SuperAdminTransferRefusedError(problem)));

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
  ROLE_COMBINATION_FORBIDDEN: example(new RoleCombinationForbiddenError()),
  FINANCE_ALREADY_ASSIGNED: example(new FinanceAlreadyAssignedError()),
  INVITATION_INVALID: example(new InvitationInvalidError()),
} as const;

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const SUPER_ADMIN_TRANSFER_ERROR_EXAMPLES = {
  SUCCESSOR_NOT_FOUND: transferExample('SUCCESSOR_NOT_FOUND'),
  SUCCESSOR_IS_HOLDER: transferExample('SUCCESSOR_IS_HOLDER'),
  ACCOUNT_LOCKED: transferExample('ACCOUNT_LOCKED'),
  EMPLOYEE_NOT_WORKING: transferExample('EMPLOYEE_NOT_WORKING'),
  NOT_ACTIVATED: transferExample('NOT_ACTIVATED'),
  EMAIL_NOT_VERIFIED: transferExample('EMAIL_NOT_VERIFIED'),
  WORK_ROLE_HELD: transferExample('WORK_ROLE_HELD'),
  APPROVAL_ROLE_HELD: transferExample('APPROVAL_ROLE_HELD'),
  HEADS_DEPARTMENT: transferExample('HEADS_DEPARTMENT'),
} as const;
