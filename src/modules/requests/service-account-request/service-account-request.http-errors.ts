import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { ProvisioningAnotherItAdminNeededError } from '../../licensing/public/licensing.errors';
import {
  AccessRequestApplicationRetiredError,
  AccessRequestNoDepartmentError,
  AccessRequestNotFoundError,
  AccessRequestPlanNotFoundError,
  AccessRequestSpendDateNotAllowedError,
  AccessRequestSuperAdminCannotRequestError,
} from '../access-request/access-request.errors';
import { RequestPartyIneligibleError } from '../../identity-access/public/request-party.errors';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import { ServiceAccountReviewRefusedError, ServiceAccountSubmitRefusedError } from './service-account-request.errors';

/** Maps the errors of the routes of service accounts to their HTTP answers and leaves the rest to the request mapper. */
export function toServiceAccountApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof ServiceAccountSubmitRefusedError) {
    return new ApiException(
      error.reason === 'PLAN_NOT_SUPPORTED' ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.CONFLICT,
      { code: `SERVICE_ACCOUNT_REQUEST.${error.reason}`, message: error.message },
    );
  }
  if (error instanceof ServiceAccountReviewRefusedError) {
    return new ApiException(
      error.reason === 'REASON_REQUIRED' ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.CONFLICT,
      { code: `SERVICE_ACCOUNT_REQUEST.${error.reason}`, message: error.message },
    );
  }
  if (error instanceof ProvisioningAnotherItAdminNeededError) {
    return new ApiException(HttpStatus.FORBIDDEN, {
      code: 'PROVISIONING.ANOTHER_IT_ADMIN_NEEDED',
      message: error.message,
    });
  }

  return toAccessRequestApiException(error);
}

const example = (error: Error) => errorExampleOf(toServiceAccountApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const SERVICE_ACCOUNT_ERROR_EXAMPLES = {
  BASELINE_NOT_CLOSED: example(new ServiceAccountSubmitRefusedError('BASELINE_NOT_CLOSED')),
  PLAN_NOT_SUPPORTED: example(new ServiceAccountSubmitRefusedError('PLAN_NOT_SUPPORTED')),
  NOT_REVIEWABLE: example(new ServiceAccountReviewRefusedError('NOT_REVIEWABLE')),
  BOUNDARY_ALREADY_DECIDED: example(new ServiceAccountReviewRefusedError('BOUNDARY_ALREADY_DECIDED')),
  ANOTHER_IT_ADMIN_NEEDED: example(new ProvisioningAnotherItAdminNeededError()),
  REQUEST_NOT_FOUND: example(new AccessRequestNotFoundError()),
  PLAN_NOT_FOUND: example(new AccessRequestPlanNotFoundError()),
  APPLICATION_RETIRED: example(new AccessRequestApplicationRetiredError()),
  NO_DEPARTMENT: example(new AccessRequestNoDepartmentError()),
  REQUEST_PARTY_INELIGIBLE: example(
    new RequestPartyIneligibleError({
      reason: 'SPENDING_APPROVER',
      party: 'REQUESTER',
      employeeIds: ['<employee-id>'],
    }),
  ),
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  SUPER_ADMIN_CANNOT_REQUEST: example(new AccessRequestSuperAdminCannotRequestError()),
  NO_SPEND_FOR_FREE_SOFTWARE: example(new AccessRequestSpendDateNotAllowedError()),
} as const;
