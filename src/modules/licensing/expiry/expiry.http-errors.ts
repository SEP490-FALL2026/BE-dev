import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { ProvisioningAnotherItAdminNeededError, RevocationRefusedError } from '../public/licensing.errors';
import { toProvisioningApiException } from '../provisioning/provisioning.http-errors';
import { ExpiryError, type ExpiryProblem } from './expiry.errors';

const ANSWERS: Readonly<Record<ExpiryProblem, { status: HttpStatus; message: string }>> = {
  NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'There is no right of a person that ends on a day with this id.',
  },
  NOT_OPEN: { status: HttpStatus.CONFLICT, message: 'The right was ended already.' },
  NOT_EXPIRED: { status: HttpStatus.CONFLICT, message: 'The end day of the right has not passed.' },
  RENEWAL_PENDING: {
    status: HttpStatus.CONFLICT,
    message: 'A renewal sent before the end day waits for its decision: the right stays as it is.',
  },
  SCOPE_FORBIDDEN: { status: HttpStatus.FORBIDDEN, message: 'Only an IT Admin reads the reminders of everyone.' },
};

/**
 * Maps the refusals of the routes of the rights that have ended to their codes (`ASSIGNMENT_EXPIRY.*`); the refusals of the gate that
 * opens a revocation and the rest go to the mapper of the provisioning routes.
 */
export function toExpiryApiException(error: unknown): unknown {
  if (error instanceof ExpiryError) {
    const answer = ANSWERS[error.problem];

    return new ApiException(answer.status, { code: `ASSIGNMENT_EXPIRY.${error.problem}`, message: answer.message });
  }

  return toProvisioningApiException(error);
}

const example = (error: Error) => errorExampleOf(toExpiryApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const EXPIRY_ERROR_EXAMPLES = {
  NOT_FOUND: example(new ExpiryError('NOT_FOUND')),
  NOT_OPEN: example(new ExpiryError('NOT_OPEN')),
  NOT_EXPIRED: example(new ExpiryError('NOT_EXPIRED')),
  RENEWAL_PENDING: example(new ExpiryError('RENEWAL_PENDING')),
  SCOPE_FORBIDDEN: example(new ExpiryError('SCOPE_FORBIDDEN')),
  ANOTHER_IT_ADMIN_NEEDED: example(new ProvisioningAnotherItAdminNeededError()),
  REVOCATION_TYPE_NOT_SUPPORTED: example(new RevocationRefusedError('TYPE_NOT_SUPPORTED', 'K4')),
} as const;
