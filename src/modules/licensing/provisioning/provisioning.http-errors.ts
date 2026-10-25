import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import {
  GrantRequestRefusedError,
  ProvisioningAnotherItAdminNeededError,
  ProvisioningBeneficiaryDepartedError,
  ProvisioningBeneficiaryNotStartedError,
  ProvisioningEvidenceRequiredError,
  ProvisioningPersonalAccountError,
  ProvisioningReasonRequiredError,
  ProvisioningSubscriptionError,
  ProvisioningTaskAlreadyManualError,
  ProvisioningTaskNotFoundError,
  ProvisioningTaskNotManualError,
  ProvisioningTaskStateError,
  ProvisioningTypeNotSupportedError,
  SeatQuantityUnknownError,
} from '../licensing.errors';
import { toLicensingApiException } from '../mappers/licensing.http-errors';

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

    return refuse(
      CONFLICT,
      error.reason === 'ENDED' ? 'PROVISIONING.REQUEST_ENDED' : 'PROVISIONING.REQUEST_NOT_APPROVED',
      error.message,
    );
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
  if (error instanceof ProvisioningAnotherItAdminNeededError) {
    return refuse(HttpStatus.FORBIDDEN, 'PROVISIONING.ANOTHER_IT_ADMIN_NEEDED', error.message);
  }

  return toLicensingApiException(error);
}

const example = (error: Error) => errorExampleOf(toProvisioningApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const PROVISIONING_ERROR_EXAMPLES = {
  REQUEST_NOT_FOUND: example(new GrantRequestRefusedError('NOT_FOUND')),
  TASK_NOT_FOUND: example(new ProvisioningTaskNotFoundError()),
  EVIDENCE_REQUIRED: example(new ProvisioningEvidenceRequiredError()),
  REASON_REQUIRED: example(new ProvisioningReasonRequiredError()),
} as const;
