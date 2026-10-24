import { REQUEST_BODY_LIMIT_TEXT } from './request-body-limit';

/**
 * What the JSON parser answers before any route runs (`applyRequestBodyLimit`, the filter's parser recognition), so every
 * operation that takes a JSON body can answer it (P29-N1, P29-N4). These are the one wording for each answer.
 */
export const MALFORMED_BODY_DESCRIPTION =
  'The JSON body cannot be read: it is not valid JSON, it does not match its declared length, or its compressed content is corrupt (HTTP_BAD_REQUEST).';
export const REQUEST_BODY_LIMIT_DESCRIPTION = `The JSON body is larger than ${REQUEST_BODY_LIMIT_TEXT}; it is refused before it is read (HTTP_PAYLOAD_TOO_LARGE).`;
export const UNSUPPORTED_BODY_DESCRIPTION =
  'The JSON body declares a charset other than UTF, or a Content-Encoding other than gzip, deflate or br (HTTP_UNSUPPORTED_MEDIA_TYPE).';

const PARSER_RESPONSES: readonly [status: string, description: string][] = [
  ['400', MALFORMED_BODY_DESCRIPTION],
  ['413', REQUEST_BODY_LIMIT_DESCRIPTION],
  ['415', UNSUPPORTED_BODY_DESCRIPTION],
];
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const ERROR_ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelopeDto' };

type Response = { description?: string; content?: unknown };
type Operation = { requestBody?: { content?: Record<string, unknown> }; responses?: Record<string, Response> };

/**
 * Documents the parser's 400, 413 and 415 on every operation with a JSON request body. An operation that declares the
 * status for its own reason keeps that description, and the parser's meaning is appended to it exactly once. Independent
 * of decorator order. Returns a new document; the input is unchanged.
 */
export function withRequestParserResponses<T extends { paths: object }>(document: T): T {
  const result = structuredClone(document);
  for (const item of Object.values(result.paths as Record<string, Record<string, unknown>>)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method] as Operation | undefined;
      if (!operation?.requestBody?.content?.['application/json']) continue;
      operation.responses ??= {};
      for (const [status, description] of PARSER_RESPONSES) {
        const own = operation.responses[status];
        if (own === undefined) {
          operation.responses[status] = { description, content: { 'application/json': { schema: ERROR_ENVELOPE } } };
        } else if (!(own.description ?? '').includes(description)) {
          own.description = own.description ? `${own.description} ${description}` : description;
        }
      }
    }
  }

  return result;
}
