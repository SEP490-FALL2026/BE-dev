import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { ProvisioningAnotherItAdminNeededError } from '../../licensing/licensing.errors';
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
