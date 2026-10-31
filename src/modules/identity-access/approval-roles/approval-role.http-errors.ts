import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { ApprovalRoleHolderInvalidError, ApprovalRolePairingError } from './approval-role.errors';

/** The one place the errors of the approval-role routes become HTTP answers. */
export function toApprovalRoleApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof EmployeeNotFoundError) {
    return new ApiException(HttpStatus.NOT_FOUND, {
      code: 'ORGANIZATION.EMPLOYEE_NOT_FOUND',
      message: 'The employee was not found.',
    });
  }
  if (error instanceof ApprovalRoleHolderInvalidError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: `APPROVAL_ROLE.${error.problem}`,
      message: error.message,
    });
  }
  if (error instanceof ApprovalRolePairingError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER',
      message: error.message,
    });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toApprovalRoleApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const APPROVAL_ROLE_ERROR_EXAMPLES = {
  EMPLOYEE_NOT_FOUND: example(new EmployeeNotFoundError('<employee-id>')),
  EMPLOYEE_NOT_ACTIVE: example(new ApprovalRoleHolderInvalidError('EMPLOYEE_NOT_ACTIVE')),
  NO_USABLE_ACCOUNT: example(new ApprovalRoleHolderInvalidError('NO_USABLE_ACCOUNT')),
  SUPER_ADMIN_CANNOT_HOLD: example(new ApprovalRoleHolderInvalidError('SUPER_ADMIN_CANNOT_HOLD')),
  SUBSTITUTE_MUST_DIFFER: example(new ApprovalRolePairingError()),
} as const;
