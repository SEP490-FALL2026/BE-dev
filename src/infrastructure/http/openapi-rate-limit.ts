/**
 * `ThrottlerGuard` is the first global guard (`SecurityModule`, `APP_GUARD`) and no route opts out, so every operation
 * can answer 429 with the filter's code `HTTP_TOO_MANY_REQUESTS`. This is the one wording for that answer.
 */
export const GLOBAL_RATE_LIMIT_DESCRIPTION =
  'Too many requests to this route from this address (HTTP_TOO_MANY_REQUESTS).';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const ERROR_ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelopeDto' };

/**
 * Documents the global rate limit on every operation that declares no 429 of its own. An operation that does declare
 * one (a domain lockout, a stricter route limit) keeps it, and its description must name `HTTP_TOO_MANY_REQUESTS` too —
 * the API inventory test checks that. Independent of decorator order. Returns a new document; the input is unchanged.
 */
export function withGlobalRateLimitResponse<T extends { paths: object }>(document: T): T {
  const result = structuredClone(document);
  for (const item of Object.values(result.paths as Record<string, Record<string, unknown>>)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method] as { responses?: Record<string, unknown> } | undefined;
      if (!operation) continue;
      operation.responses ??= {};
      operation.responses['429'] ??= {
        description: GLOBAL_RATE_LIMIT_DESCRIPTION,
        content: { 'application/json': { schema: ERROR_ENVELOPE } },
      };
    }
  }

  return result;
}
