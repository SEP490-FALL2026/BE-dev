import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorEnvelopeDto } from '../dto/error-envelope.dto';

/** The authentication guard's 401 on any route that needs a bearer token. One wording for every such route. */
export const UNAUTHENTICATED_RESPONSE = {
  status: HttpStatus.UNAUTHORIZED,
  description: 'Authentication is required or the token is no longer valid.',
} as const;

/** The 503 of a route behind the guard: from the guard itself, or from the service after it. One wording for all. */
export const GUARDED_SERVICE_UNAVAILABLE_RESPONSE = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  description:
    'Authentication or the service is temporarily unavailable (TOKEN_VERIFICATION_UNAVAILABLE from the guard, ' +
    'SERVICE_UNAVAILABLE after it).',
} as const;

export function ApiErrorResponses(
  ...responses: Array<{
    status: HttpStatus;
    description?: string;
    type?: Type<unknown>;
  }>
): MethodDecorator {
  return applyDecorators(
    ...responses.map(({ status, description, type }) =>
      ApiResponse({ status, description, type: type ?? ErrorEnvelopeDto }),
    ),
  );
}
