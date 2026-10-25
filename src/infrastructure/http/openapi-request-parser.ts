import { HttpStatus } from '@nestjs/common';
import { fallbackErrorFor } from './filters/fallback-error';
import { toNamedErrorExamples, withErrorExamples, type ErrorExample } from './openapi-error-examples';
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

/** Each answer with what the filter says for it: a parser refusal carries no code of its own. */
const PARSER_RESPONSES: readonly [status: string, description: string, example: ErrorExample][] = [
  ['400', MALFORMED_BODY_DESCRIPTION, fallbackErrorFor(HttpStatus.BAD_REQUEST)],
  ['413', REQUEST_BODY_LIMIT_DESCRIPTION, fallbackErrorFor(HttpStatus.PAYLOAD_TOO_LARGE)],
  ['415', UNSUPPORTED_BODY_DESCRIPTION, fallbackErrorFor(HttpStatus.UNSUPPORTED_MEDIA_TYPE)],
];
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const ERROR_ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelopeDto' };

type Response = { description?: string; content?: Record<string, Record<string, unknown>> };
type Operation = { requestBody?: { content?: Record<string, unknown> }; responses?: Record<string, Response> };

/**
 * Documents the parser's 400, 413 and 415 on every operation with a JSON request body. An operation that declares the
 * status for its own reason keeps that description and its examples, and the parser's meaning and example are appended
 * to them exactly once. Independent of decorator order. Returns a new document; the input is unchanged.
 */
export function withRequestParserResponses<T extends { paths: object }>(document: T): T {
  const result = structuredClone(document);
  for (const item of Object.values(result.paths as Record<string, Record<string, unknown>>)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method] as Operation | undefined;
      if (!operation?.requestBody?.content?.['application/json']) continue;
      operation.responses ??= {};
      for (const [status, description, example] of PARSER_RESPONSES) {
        const own = operation.responses[status];
        if (own === undefined) {
          operation.responses[status] = {
            description,
            content: { 'application/json': { schema: ERROR_ENVELOPE, examples: toNamedErrorExamples([example]) } },
          };
          continue;
        }
        if (!(own.description ?? '').includes(description)) {
          own.description = own.description ? `${own.description} ${description}` : description;
        }
        if (own.content?.['application/json']) {
          operation.responses[status] = withErrorExamples(own as Parameters<typeof withErrorExamples>[0], [example]);
        }
      }
    }
  }

  return result;
}
