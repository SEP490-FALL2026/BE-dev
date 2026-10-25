import { type INestApplication, UnsupportedMediaTypeException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

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
 * The content encodings a JSON or URL-encoded body may use: none, `gzip`, `deflate` and `br` — the request contract
 * before `body-parser` 2.4.0, which also decodes `zstd` wherever Node can (SEC-UPGRADE-RV-01-F1). Changing this list
 * changes the API contract (docs/rules/api-contract.md).
 */
export const ACCEPTED_CONTENT_ENCODINGS: readonly string[] = ['identity', 'gzip', 'deflate', 'br'];

/** The bodies the two parsers below read (their default `type`); multipart goes to multer, which decodes nothing. */
const PARSED_BODY_TYPES = ['application/json', 'application/x-www-form-urlencoded'];

/**
 * Refuses a JSON or URL-encoded body in another encoding before any parser reads it, with the same 415 the filter gives a
 * parser's unsupported-encoding refusal. The header is read the way body-parser reads it (absent or empty = identity,
 * case-insensitive, one value). A request without a body or of another type is left to the routes.
 */
export function contentEncodingAllowlist(request: Request, _response: Response, next: NextFunction): void {
  if (!request.is(PARSED_BODY_TYPES)) return next();
  const encoding = (request.headers['content-encoding'] || 'identity').toLowerCase();
  if (ACCEPTED_CONTENT_ENCODINGS.includes(encoding)) return next();
  next(new UnsupportedMediaTypeException());
}

/**
 * Registers the content-encoding allowlist, then the JSON and URL-encoded parsers with the limit, before Nest would
 * register its own defaults, which it then skips (it adds a parser only when none of that name is mounted).
 */
export function applyRequestBodyLimit(app: INestApplication): void {
  const parsers = app as unknown as Partial<Pick<NestExpressApplication, 'useBodyParser'>>;
  if (typeof parsers.useBodyParser !== 'function') {
    throw new Error('Expected an Express application to set the request body limit');
  }

  app.use(contentEncodingAllowlist);
  parsers.useBodyParser('json', { limit: REQUEST_BODY_LIMIT_BYTES });
  parsers.useBodyParser('urlencoded', {
    limit: REQUEST_BODY_LIMIT_BYTES,
    extended: true,
    parameterLimit: URLENCODED_PARAMETER_LIMIT,
    depth: URLENCODED_DEPTH_LIMIT,
  });
}
