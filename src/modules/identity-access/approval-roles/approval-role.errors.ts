import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';

export type ApprovalRoleHolderProblem = 'EMPLOYEE_NOT_ACTIVE' | 'NO_USABLE_ACCOUNT' | 'SUPER_ADMIN_CANNOT_HOLD';

/** The person chosen cannot hold an approval role (US-01-03 AC-2, AC-6). */
export class ApprovalRoleHolderInvalidError extends Error {
  constructor(readonly problem: ApprovalRoleHolderProblem) {
    super(`The person cannot hold an approval role: ${problem}.`);
    this.name = 'ApprovalRoleHolderInvalidError';
  }
}

/** The substitute and the spending approver must be two people (US-01-03 AC-7, BR-13.12). */
export class ApprovalRolePairingError extends Error {
  constructor() {
    super('The substitute for a conflict of interest cannot be the spending approver.');
    this.name = 'ApprovalRolePairingError';
  }
}

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
