import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * The one limit of a parsed request body — JSON and URL-encoded alike: 100 KiB, the size Express applied by default
 * before it was written down (P29-N1). A body over it is refused by the parser, before routing, guards or validation,
 * with 413 HTTP_PAYLOAD_TOO_LARGE (the filter recognizes the parser's refusal). Multipart uploads have their own limits
 * on their routes. Changing this number changes the API contract (docs/rules/api-contract.md).
 */
export const REQUEST_BODY_LIMIT_BYTES = 100 * 1024;

/** How the limit reads in the API description. */
export const REQUEST_BODY_LIMIT_TEXT = `${REQUEST_BODY_LIMIT_BYTES / 1024} KiB`;

/**
 * The URL-encoded parser stays mounted (as Nest would mount it) although no route documents URL-encoded input, so its
 * limits are written here rather than left to the library (P29-N4): more parameters ⟹ 413 `HTTP_PAYLOAD_TOO_LARGE`,
 * deeper nesting ⟹ 400 `HTTP_BAD_REQUEST`. Changing either changes the API contract (docs/rules/api-contract.md).
 */
export const URLENCODED_PARAMETER_LIMIT = 100;
export const URLENCODED_DEPTH_LIMIT = 5;

/**
 * Registers the JSON and URL-encoded parsers with the limit before Nest would register its own defaults, which it then
 * skips (it adds a parser only when none of that name is mounted).
 */
export function applyRequestBodyLimit(app: INestApplication): void {
  const parsers = app as unknown as Partial<Pick<NestExpressApplication, 'useBodyParser'>>;
  if (typeof parsers.useBodyParser !== 'function') {
    throw new Error('Expected an Express application to set the request body limit');
  }

  parsers.useBodyParser('json', { limit: REQUEST_BODY_LIMIT_BYTES });
  parsers.useBodyParser('urlencoded', {
    limit: REQUEST_BODY_LIMIT_BYTES,
    extended: true,
    parameterLimit: URLENCODED_PARAMETER_LIMIT,
    depth: URLENCODED_DEPTH_LIMIT,
  });
}
