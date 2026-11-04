import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  RequestPartyIneligibleError,
  requestPartyRefusalBody,
} from '../../identity-access/public/request-party.errors';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import {
  AssignmentConflictError,
  GrantRequestRefusedError,
  ProvisioningAccountIdentifierRequiredError,
  ProvisioningAnotherItAdminNeededError,
  ProvisioningBeneficiaryDepartedError,
  ProvisioningBeneficiaryNotStartedError,
  ProvisioningEvidenceRequiredError,
  ProvisioningPersonalAccountError,
  ProvisioningReasonRequiredError,
  ProvisioningResponsibleInvalidError,
  ProvisioningResponsibleNotInDepartmentError,
  ProvisioningSubscriptionError,
  ProvisioningTaskAlreadyManualError,
  ProvisioningTaskNotFoundError,
  ProvisioningTaskNotManualError,
  ProvisioningTaskStateError,
  ProvisioningTypeNotSupportedError,
  RevocationCompletionError,
  RevocationHookRefusedError,
  RevocationRefusedError,
  SeatApplicationRetiredError,
  SeatQuantityUnknownError,
  SeatSubscriptionDraftError,
  SeatTargetNotFoundError,
} from '../public/licensing.errors';
import { toLicensingApiException } from '../licensing.http-errors';
import { ProvisioningItAdminRequiredError } from './provisioning.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;
const CONFLICT = HttpStatus.CONFLICT;

/**
 * Maps the errors of the queue routes to their HTTP answers and leaves the rest (the assignment, the seat target and the
 * database) to the licensing mapper.
 */
export function toProvisioningApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof GrantRequestRefusedError) {
    if (error.reason === 'NOT_FOUND') return refuse(HttpStatus.NOT_FOUND, 'REQUEST.NOT_FOUND', error.message);
    if (error.reason === 'BENEFICIARY_REQUIRED') {
      return refuse(UNPROCESSABLE, 'PROVISIONING.BENEFICIARY_REQUIRED', error.message);
    }

    const code = {
      ENDED: 'PROVISIONING.REQUEST_ENDED',
      NOT_IN_CATALOG: 'PROVISIONING.REQUEST_NOT_IN_CATALOG',
      NOT_APPROVED: 'PROVISIONING.REQUEST_NOT_APPROVED',
      BOUNDARY_NOT_CHECKED: 'PROVISIONING.REQUEST_BOUNDARY_NOT_CHECKED',
    }[error.reason];

    return refuse(CONFLICT, code, error.message);
  }
  if (error instanceof EmployeeNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'EMPLOYEE.NOT_FOUND', error.message);
  if (error instanceof ProvisioningTypeNotSupportedError) {
    return refuse(CONFLICT, 'PROVISIONING.TYPE_NOT_SUPPORTED', error.message, {
      provisioningType: error.provisioningType,
    });
  }
  if (error instanceof ProvisioningSubscriptionError) {
    return refuse(UNPROCESSABLE, `PROVISIONING.SUBSCRIPTION_${error.problem}`, error.message);
  }
  if (error instanceof SeatQuantityUnknownError) {
    return refuse(UNPROCESSABLE, 'PROVISIONING.SUBSCRIPTION_QUANTITY_UNKNOWN', error.message);
  }
  if (error instanceof ProvisioningPersonalAccountError) {
    return refuse(UNPROCESSABLE, 'PROVISIONING.PERSONAL_ACCOUNT', error.message);
  }
  if (error instanceof ProvisioningAccountIdentifierRequiredError) {
    return refuse(UNPROCESSABLE, 'PROVISIONING.ACCOUNT_IDENTIFIER_REQUIRED', error.message);
  }
  if (error instanceof ProvisioningResponsibleInvalidError) {
    return refuse(UNPROCESSABLE, 'PROVISIONING.RESPONSIBLE_INVALID', error.message, { problem: error.problem });
  }
  // The person IT Admin names as responsible cannot be the spending approver: the same answer as every route that makes a Request (`D-S21`).
  if (error instanceof RequestPartyIneligibleError) {
    return new ApiException(UNPROCESSABLE, requestPartyRefusalBody(error));
  }
  if (error instanceof ProvisioningResponsibleNotInDepartmentError) {
    return refuse(CONFLICT, 'PROVISIONING.RESPONSIBLE_NOT_IN_DEPARTMENT', error.message);
  }
  if (error instanceof ProvisioningBeneficiaryDepartedError) {
    return refuse(CONFLICT, 'PROVISIONING.BENEFICIARY_DEPARTED', error.message, {
      requestId: error.requestId,
      nextStep: 'CANCEL_REQUEST',
    });
  }
  if (error instanceof ProvisioningBeneficiaryNotStartedError) {
    return refuse(CONFLICT, 'PROVISIONING.BENEFICIARY_NOT_STARTED', error.message, {
      requestId: error.requestId,
      startsOn: error.startsOn,
    });
  }
  if (error instanceof ProvisioningTaskNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'PROVISIONING_TASK.NOT_FOUND', error.message);
  }
  if (error instanceof ProvisioningTaskNotManualError) {
    return refuse(CONFLICT, 'PROVISIONING_TASK.NOT_MANUAL', error.message);
  }
  if (error instanceof ProvisioningTaskAlreadyManualError) {
    return refuse(CONFLICT, 'PROVISIONING_TASK.ALREADY_MANUAL', error.message);
  }
  if (error instanceof ProvisioningTaskStateError) {
    return refuse(CONFLICT, `PROVISIONING_TASK.${error.problem}`, error.message);
  }
  if (error instanceof ProvisioningEvidenceRequiredError) {
    return refuse(UNPROCESSABLE, 'PROVISIONING_TASK.EVIDENCE_REQUIRED', error.message);
  }
  if (error instanceof ProvisioningReasonRequiredError) {
    return refuse(UNPROCESSABLE, 'PROVISIONING_TASK.REASON_REQUIRED', error.message);
  }
  if (error instanceof RevocationCompletionError) {
    return refuse(UNPROCESSABLE, `REVOCATION.${error.problem}`, error.message);
  }
  if (error instanceof RevocationRefusedError) {
    if (error.problem === 'SOURCE_REQUIRED') return refuse(UNPROCESSABLE, 'REVOCATION.SOURCE_REQUIRED', error.message);

    return refuse(CONFLICT, `REVOCATION.${error.problem}`, error.message, {
      ...(error.provisioningType ? { provisioningType: error.provisioningType } : {}),
    });
  }
  if (error instanceof RevocationHookRefusedError) {
    // The module that extends the revocation names the code; the answer is a conflict, nothing was changed.
    return refuse(CONFLICT, error.code, error.message, error.details);
  }
  if (error instanceof ProvisioningAnotherItAdminNeededError) {
    return refuse(HttpStatus.FORBIDDEN, 'PROVISIONING.ANOTHER_IT_ADMIN_NEEDED', error.message);
  }
  // The same answer as the role guard of the route: the policy of the work refuses what the guard would have refused.
  if (error instanceof ProvisioningItAdminRequiredError) return new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);

  return toLicensingApiException(error);
}

const example = (error: Error) => errorExampleOf(toProvisioningApiException(error));

/**
 * The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). Since G5
 * binds the request gate of the module of requests, a grant reaches every check after the gate and its tasks exist, so the
 * task routes answer with the states of a real task.
 */
export const PROVISIONING_ERROR_EXAMPLES = {
  REQUEST_NOT_FOUND: example(new GrantRequestRefusedError('NOT_FOUND')),
  TASK_NOT_FOUND: example(new ProvisioningTaskNotFoundError()),
  EVIDENCE_REQUIRED: example(new ProvisioningEvidenceRequiredError()),
  REASON_REQUIRED: example(new ProvisioningReasonRequiredError()),
  ANOTHER_IT_ADMIN_NEEDED: example(new ProvisioningAnotherItAdminNeededError()),
  NOT_CLAIMABLE: example(new ProvisioningTaskStateError('NOT_CLAIMABLE')),
  NOT_IN_PROGRESS: example(new ProvisioningTaskStateError('NOT_IN_PROGRESS')),
  IS_REVOCATION: example(new ProvisioningTaskStateError('IS_REVOCATION')),
  NOT_REVOCATION: example(new ProvisioningTaskStateError('NOT_REVOCATION')),
  NOT_FAILED: example(new ProvisioningTaskStateError('NOT_FAILED')),
  WITHDRAWAL_PENDING: example(new ProvisioningTaskStateError('WITHDRAWAL_PENDING')),
  NO_WITHDRAWAL: example(new ProvisioningTaskStateError('NO_WITHDRAWAL')),
  NOT_TERMINATING: example(new ProvisioningTaskStateError('NOT_TERMINATING')),
  ALREADY_MANUAL: example(new ProvisioningTaskAlreadyManualError()),
  BENEFICIARY_DEPARTED: example(new ProvisioningBeneficiaryDepartedError('<request-id>')),
  COMPLETION_NOT_ALLOWED: example(new RevocationCompletionError('COMPLETION_NOT_ALLOWED')),
  NOTE_REQUIRED: example(new RevocationCompletionError('NOTE_REQUIRED')),
  PAID_THROUGH_REQUIRED: example(new RevocationCompletionError('PAID_THROUGH_REQUIRED')),
  ACCESS_STATE_REQUIRED: example(new RevocationCompletionError('ACCESS_STATE_REQUIRED')),
  ACCESS_STATE_INVALID: example(new RevocationCompletionError('ACCESS_STATE_INVALID')),
} as const;

/** The refusals of the grant of a seat, by status, after the request gate of G5 (`US-07-01`). */
export const PROVISIONING_GRANT_EXAMPLES = {
  NOT_FOUND: [PROVISIONING_ERROR_EXAMPLES.REQUEST_NOT_FOUND, example(new SeatTargetNotFoundError('SUBSCRIPTION'))],
  CONFLICT: [
    example(new GrantRequestRefusedError('NOT_APPROVED')),
    example(new GrantRequestRefusedError('ENDED')),
    example(new GrantRequestRefusedError('NOT_IN_CATALOG')),
    example(new GrantRequestRefusedError('BOUNDARY_NOT_CHECKED')),
    example(new ProvisioningResponsibleNotInDepartmentError()),
    example(new ProvisioningTypeNotSupportedError('K4')),
    PROVISIONING_ERROR_EXAMPLES.BENEFICIARY_DEPARTED,
    example(new ProvisioningBeneficiaryNotStartedError('<request-id>', '2026-01-01')),
    example(new SeatApplicationRetiredError()),
    example(new AssignmentConflictError('SEAT_CAPACITY', 0)),
  ],
  UNPROCESSABLE: [
    example(new GrantRequestRefusedError('BENEFICIARY_REQUIRED')),
    example(new ProvisioningPersonalAccountError()),
    example(new ProvisioningAccountIdentifierRequiredError()),
    example(new ProvisioningResponsibleInvalidError('OUTSIDE_DEPARTMENT')),
    example(
      new RequestPartyIneligibleError({
        reason: 'SPENDING_APPROVER',
        party: 'BENEFICIARY',
        employeeIds: ['<employee-id>'],
      }),
    ),
    example(new ProvisioningSubscriptionError('REQUIRED')),
    example(new ProvisioningSubscriptionError('NOT_ALLOWED')),
    example(new ProvisioningSubscriptionError('PLAN_MISMATCH')),
    example(new SeatQuantityUnknownError()),
    example(new SeatSubscriptionDraftError(['START_DATE'])),
    example(new AssignmentConflictError('OVERLAP', 0)),
    example(new AssignmentConflictError('IDENTIFIER_IN_USE', 0)),
    example(new AssignmentConflictError('EXPECTED_END_REQUIRED', 0)),
    example(new AssignmentConflictError('SUBSCRIPTION_DEPARTMENT_MISMATCH', 0)),
  ],
} as const;
