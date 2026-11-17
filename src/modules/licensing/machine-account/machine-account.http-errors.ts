import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { AssignmentNotFoundError } from '../public/licensing.errors';
import { toLicensingApiException } from '../licensing.http-errors';
import { MachineAccountOverlapError, MachineAccountRefusedError } from './machine-account.errors';

/**
 * Maps the refusals of the route of the flag of a machine account to their codes (`LICENSE_ASSIGNMENT.*`); the rest goes to the licensing
 * mapper. A seat that is not a personal seat or not the seat of an IT Admin is a 422, a seat that is no longer open and a flag that would
 * overlap another personal seat are a 409.
 */
export function toMachineAccountApiException(error: unknown): unknown {
  if (error instanceof MachineAccountRefusedError) {
    if (error.refusal === 'NOT_OPEN') {
      return new ApiException(HttpStatus.CONFLICT, {
        code: 'LICENSE_ASSIGNMENT.NOT_OPEN',
        message: error.message,
      });
    }

    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code:
        error.refusal === 'NOT_PERSONAL'
          ? 'LICENSE_ASSIGNMENT.NOT_PERSONAL'
          : 'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_HOLDER_NOT_IT_ADMIN',
      message: error.message,
    });
  }
  if (error instanceof MachineAccountOverlapError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_OVERLAP',
      message: error.message,
    });
  }

  return toLicensingApiException(error);
}

const example = (error: Error) => errorExampleOf(toMachineAccountApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const MACHINE_ACCOUNT_ERROR_EXAMPLES = {
  ASSIGNMENT_NOT_FOUND: example(new AssignmentNotFoundError()),
  NOT_OPEN: example(new MachineAccountRefusedError('NOT_OPEN')),
  NOT_PERSONAL: example(new MachineAccountRefusedError('NOT_PERSONAL')),
  HOLDER_NOT_IT_ADMIN: example(new MachineAccountRefusedError('HOLDER_NOT_IT_ADMIN')),
  OVERLAP: example(new MachineAccountOverlapError()),
} as const;
