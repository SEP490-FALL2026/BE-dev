import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
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
