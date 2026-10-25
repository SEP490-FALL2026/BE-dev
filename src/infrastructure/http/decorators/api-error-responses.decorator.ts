import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorEnvelopeDto } from '../dto/error-envelope.dto';
import {
  AUTHENTICATION_REQUIRED_ERROR,
  FORBIDDEN_ERROR,
  INVALID_ACCESS_TOKEN_ERROR,
  TOKEN_VERIFICATION_UNAVAILABLE_ERROR,
} from '../errors/access-errors';
import { SERVICE_UNAVAILABLE_ERROR } from '../errors/service-unavailable';
import { fallbackErrorFor } from '../filters/fallback-error';
import { toNamedErrorExamples, type ErrorExample } from '../openapi-error-examples';
import { VALIDATION_ERROR_BODY } from '../pipes/zod-validation.pipe';

/** The role guard's 403 on a route with `@RequireRoles(...)`. */
export const FORBIDDEN_EXAMPLE: ErrorExample = FORBIDDEN_ERROR;

/** A request validation failure: `details.issues` names each failed field (`<field>` stands for its path). */
export const VALIDATION_EXAMPLE: ErrorExample = {
  ...VALIDATION_ERROR_BODY,
  details: { issues: [{ code: 'invalid_type', path: '<field>' }] },
};

/** A dependency outage behind the guard: reachable where the route's errors pass through `toUnavailableApiException`. */
export const SERVICE_UNAVAILABLE_EXAMPLE: ErrorExample = SERVICE_UNAVAILABLE_ERROR;

/** An error without a code of its own (a refusal of a request parser, an unexpected fault), as the filter answers it. */
export const fallbackExample = (status: HttpStatus): ErrorExample => fallbackErrorFor(status);

/** The authentication guard's 401 on any route that needs a bearer token. One wording for every such route. */
export const UNAUTHENTICATED_RESPONSE = {
  status: HttpStatus.UNAUTHORIZED,
  description: 'Authentication is required or the token is no longer valid.',
  examples: [AUTHENTICATION_REQUIRED_ERROR, INVALID_ACCESS_TOKEN_ERROR],
} as const;

/** The 503 of a route behind the guard: from the guard itself, or from the service after it. One wording for all. */
export const GUARDED_SERVICE_UNAVAILABLE_RESPONSE = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  description:
    'Authentication or the service is temporarily unavailable (TOKEN_VERIFICATION_UNAVAILABLE from the guard, ' +
    'SERVICE_UNAVAILABLE after it).',
  examples: [TOKEN_VERIFICATION_UNAVAILABLE_ERROR, SERVICE_UNAVAILABLE_ERROR],
} as const;

/**
 * One documented error response. `examples` lists the codes this route can really answer with at this status (traced
 * from its guards, pipe and HTTP mapper — never taken from the description); each is shown as a named example of the
 * error envelope. Route-specific examples come from the capability's HTTP mapper (`*_ERROR_EXAMPLES`).
 *
 * A declared status that the running system cannot answer yet (its path waits for a later slice) shows no example and
 * says why in `noExampleBecause` — never an example of a code the runtime cannot return. The inventory test holds the
 * exact list of such responses.
 */
export type ErrorResponseDeclaration = {
  status: HttpStatus;
  description?: string;
  type?: Type<unknown>;
} & (
  | { examples: readonly [ErrorExample, ...ErrorExample[]]; noExampleBecause?: never }
  | { examples?: never; noExampleBecause: string }
);

export function ApiErrorResponses(...responses: ErrorResponseDeclaration[]): MethodDecorator {
  return applyDecorators(
    ...responses.map(({ status, description, type, examples }) =>
      ApiResponse({
        status,
        description,
        type: type ?? ErrorEnvelopeDto,
        ...(examples ? { examples: toNamedErrorExamples(examples) } : {}),
      }),
    ),
  );
}
