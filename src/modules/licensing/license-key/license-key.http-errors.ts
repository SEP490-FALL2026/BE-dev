import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { LicenseKeyNotFoundError, LicenseKeyPlanNotK4Error } from '../licensing.errors';
import { toLicensingApiException } from '../mappers/licensing.http-errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/**
 * Maps the errors of the vault routes to their HTTP answers and leaves the rest (a purchase that does not exist, the
 * database) to the licensing mapper. No answer holds a key: a key that cannot be opened is an error of the server with
 * the message of the cipher, which names nothing.
 */
export function toLicenseKeyApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof LicenseKeyNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'LICENSE_KEY.NOT_FOUND', error.message);
  }
  if (error instanceof LicenseKeyPlanNotK4Error) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'LICENSE_KEY.PLAN_NOT_K4', error.message, {
      provisioningType: error.provisioningType,
    });
  }

  return toLicensingApiException(error);
}
