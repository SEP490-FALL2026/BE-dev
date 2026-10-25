import { ERROR_CODE_PATTERN, type ErrorEnvelope } from './dto/error-envelope.dto';
import { ApiException } from './errors/api.exception';

/**
 * One error answer as the OpenAPI document shows it: the `code`, `message` and optional `details` of the error envelope.
 * Presentation only — the runtime never reads it (OPENAPI-EXAMPLE.1).
 */
export interface ErrorExample {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** The fixed `requestId` of every example: a placeholder, never one that looks like a live request. */
export const EXAMPLE_REQUEST_ID = 'req_example';

/**
 * The example of the answer an ApiException gives, read from the exception itself. Capabilities build their examples by
 * passing a domain error through their own HTTP mapper, so the code, message and details shown are the runtime's.
 * Anything else — a mapper that let the error through, an HttpException without a code — is refused, so an example the
 * runtime cannot answer with is never published.
 */
export function errorExampleOf(exception: unknown): ErrorExample {
  const body = exception instanceof ApiException ? exception.getResponse() : undefined;
  const candidate = body as Partial<Record<'code' | 'message' | 'details', unknown>> | undefined;
  if (
    !candidate ||
    typeof candidate.code !== 'string' ||
    !ERROR_CODE_PATTERN.test(candidate.code) ||
    typeof candidate.message !== 'string'
  ) {
    throw new Error('An error example must come from an ApiException with a code and a message');
  }
  const details = candidate.details as Readonly<Record<string, unknown>> | undefined;

  return {
    code: candidate.code,
    message: candidate.message,
    ...(details === undefined ? {} : { details: structuredClone(details) }),
  };
}

/** A named example of the OpenAPI media type, as `@ApiResponse({ examples })` takes it. */
export interface NamedErrorExample {
  summary: string;
  value: ErrorEnvelope;
}

/**
 * The OpenAPI `examples` of one error response: one per code, named by the code, summarized by the message, with the
 * whole envelope as value. Two examples of the same code in one response are a declaration mistake and refused.
 */
export function toNamedErrorExamples(examples: readonly ErrorExample[]): Record<string, NamedErrorExample> {
  const named: Record<string, NamedErrorExample> = {};
  for (const { code, message, details } of examples) {
    if (Object.hasOwn(named, code)) throw new Error(`The response shows the example ${code} twice`);
    named[code] = {
      summary: message,
      value: {
        success: false,
        error: {
          code,
          message,
          ...(details === undefined ? {} : { details: structuredClone(details) }),
          requestId: EXAMPLE_REQUEST_ID,
        },
      },
    };
  }

  return named;
}

type JsonResponse = { content: Record<string, { examples?: Record<string, unknown> } & Record<string, unknown>> };

/**
 * A copy of a documented error response that also shows these examples, after the ones it shows already (a code it
 * shows is kept as it is). For the document-wide answers added after the decorators ran (429, the request parsers).
 */
export function withErrorExamples<T extends JsonResponse>(response: T, examples: readonly ErrorExample[]): T {
  const result = structuredClone(response);
  const media = result.content['application/json'];
  const own = media.examples ?? {};
  const missing = examples.filter(({ code }) => !Object.hasOwn(own, code));
  media.examples = { ...own, ...toNamedErrorExamples(missing) };

  return result;
}
