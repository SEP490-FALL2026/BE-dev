import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  LicenseKeyNotFoundError,
  LicenseKeyPlanNotK4Error,
  LicenseKeyRevealLimitError,
  SeatTargetNotFoundError,
} from '../public/licensing.errors';
import { toLicensingApiException } from '../licensing.http-errors';
import { LicenseKeyApplicationRetiredError, LicenseKeyStateError } from './license-key.errors';

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
  if (error instanceof LicenseKeyRevealLimitError) {
    // The same code the global rate limit answers with: to a client it is one kind of refusal.
    return refuse(HttpStatus.TOO_MANY_REQUESTS, 'HTTP_TOO_MANY_REQUESTS', error.message);
  }
  if (error instanceof LicenseKeyApplicationRetiredError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'LICENSE_KEY.APPLICATION_RETIRED', error.message);
  }
  if (error instanceof LicenseKeyStateError) {
    return refuse(HttpStatus.CONFLICT, `LICENSE_KEY.${error.problem}`, error.message);
  }
  if (error instanceof LicenseKeyPlanNotK4Error) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'LICENSE_KEY.PLAN_NOT_K4', error.message, {
      provisioningType: error.provisioningType,
    });
  }

  return toLicensingApiException(error);
}

const example = (error: Error) => errorExampleOf(toLicenseKeyApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const LICENSE_KEY_ERROR_EXAMPLES = {
  NOT_FOUND: example(new LicenseKeyNotFoundError()),
  PLAN_NOT_K4: example(new LicenseKeyPlanNotK4Error('K1')),
  APPLICATION_RETIRED: example(new LicenseKeyApplicationRetiredError()),
  REVEAL_LIMIT: example(new LicenseKeyRevealLimitError('MINUTE')),
  SUBSCRIPTION_NOT_FOUND: example(new SeatTargetNotFoundError('SUBSCRIPTION')),
  WITHDRAWN: example(new LicenseKeyStateError('WITHDRAWN')),
  ASSIGNED: example(new LicenseKeyStateError('ASSIGNED')),
  ALREADY_WITHDRAWN: example(new LicenseKeyStateError('ALREADY_WITHDRAWN')),
  NOT_IN_STORE: example(new LicenseKeyStateError('NOT_IN_STORE')),
  SUBSCRIPTION_MISMATCH: example(new LicenseKeyStateError('SUBSCRIPTION_MISMATCH')),
} as const;
