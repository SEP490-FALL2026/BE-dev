import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { CongestionHolderNotFoundError } from './congestion.errors';

/** Maps the errors of the board of the Super Admin to their HTTP answers and leaves the rest to the global filter. */
export function toCongestionApiException(error: unknown): unknown {
  if (error instanceof CongestionHolderNotFoundError) {
    return new ApiException(HttpStatus.NOT_FOUND, { code: 'STEP_CONGESTION.HOLDER_NOT_FOUND', message: error.message });
  }

  return error;
}
