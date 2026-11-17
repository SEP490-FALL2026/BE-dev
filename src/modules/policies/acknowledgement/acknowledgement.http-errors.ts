import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { LIBRARY_ERROR_EXAMPLES, toLibraryApiException } from '../library/library.http-errors';
import { PolicyAcknowledgementNotRequiredError } from './acknowledgement.errors';

/** Maps the errors of the acknowledgement routes to their HTTP answers; the errors of the library keep their own. */
export function toAcknowledgementApiException(error: unknown): unknown {
  if (error instanceof PolicyAcknowledgementNotRequiredError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'POLICY.ACKNOWLEDGEMENT_NOT_REQUIRED',
      message: error.message,
    });
  }

  return toLibraryApiException(error);
}

export const ACKNOWLEDGEMENT_ERROR_EXAMPLES = {
  ...LIBRARY_ERROR_EXAMPLES,
  NOT_REQUIRED: errorExampleOf(toAcknowledgementApiException(new PolicyAcknowledgementNotRequiredError())),
} as const;
