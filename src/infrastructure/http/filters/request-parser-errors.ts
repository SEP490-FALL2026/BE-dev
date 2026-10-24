import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createRequire } from 'node:module';

/**
 * What the request parsers throw before any handler runs, and what the client did wrong when they do. Express's JSON and
 * URL-encoded parsers (body-parser 2 on raw-body 3) refuse a request with an http-errors object that carries a documented
 * `type`, and multer refuses a form that breaks its limits with a MulterError; Nest turns none of these into an
 * HttpException (except a JSON SyntaxError, which it maps to 400 itself), so the filter would answer 500 (P29-N1, P29-N2,
 * P29-N4).
 *
 * Recognized by their exact signature — the documented `type` and the shape its creator gives it, the multer class —
 * never by a `status`, a name or a message alone: an arbitrary thrown object that claims a client status is still an
 * unexpected error. Everything else — `stream.encoding.set`, `stream.not.readable`, an unknown parser type or multer code,
 * a storage failure — stays a server error, answered 500 without its message.
 */
export function fromRequestParserError(exception: unknown): HttpException | undefined {
  const body = bodyParserStatus(exception);
  const multipart = multipartStatus(exception);
  const status = body ?? multipart;
  if (status === 'BAD_REQUEST') return new BadRequestException();
  if (status === 'TOO_LARGE') return new PayloadTooLargeException();
  if (status === 'UNSUPPORTED') return new UnsupportedMediaTypeException();

  return undefined;
}

type ParserStatus = 'BAD_REQUEST' | 'TOO_LARGE' | 'UNSUPPORTED';
type Shape = Readonly<Record<string, 'number' | 'string'>>;

/**
 * The client refusals of body-parser 2.3 / raw-body 3, by `type`: the status http-errors stamps on them and the properties
 * their creator always sets (read from the installed sources and observed at the filter). `entity.verify.failed` is
 * absent: no verify hook is configured, so it cannot happen.
 */
const BODY_PARSER_REFUSALS: Readonly<Record<string, { status: ParserStatus; code: number; shape: Shape }>> = {
  // A parse error of the URL-encoded parser; a JSON SyntaxError of the same type is mapped to 400 by Nest first.
  'entity.parse.failed': { status: 'BAD_REQUEST', code: 400, shape: { body: 'string' } },
  // The bytes read do not match the declared Content-Length (Node's HTTP parser normally refuses this first).
  'request.size.invalid': { status: 'BAD_REQUEST', code: 400, shape: { expected: 'number', received: 'number' } },
  // The client went away before its body was read; the filter writes nothing to a closed socket.
  'request.aborted': { status: 'BAD_REQUEST', code: 400, shape: { code: 'string', received: 'number' } },
  'querystring.parse.rangeError': { status: 'BAD_REQUEST', code: 400, shape: { body: 'string' } },
  'entity.too.large': { status: 'TOO_LARGE', code: 413, shape: { limit: 'number' } },
  'parameters.too.many': { status: 'TOO_LARGE', code: 413, shape: { body: 'string' } },
  'charset.unsupported': { status: 'UNSUPPORTED', code: 415, shape: { charset: 'string' } },
  'encoding.unsupported': { status: 'UNSUPPORTED', code: 415, shape: { encoding: 'string' } },
};

/**
 * Codes of zlib and brotli for **data** they cannot decompress. body-parser passes such an error on with status 400 and no
 * `type`, so it is recognized by this shape instead; memory and allocation codes are server errors and are not listed.
 */
const DECOMPRESSION_DATA_ERROR = /^(?:Z_DATA_ERROR|Z_BUF_ERROR|Z_NEED_DICT|ERR__ERROR_FORMAT_[A-Z0-9_]+)$/;

/**
 * multer's own error class, from the copy Nest's `FileInterceptor` loads: multer is a dependency of
 * `@nestjs/platform-express`, not of this project, so it is resolved from there and `instanceof` holds for exactly the
 * errors the interceptor passes on.
 */
export const { MulterError } = createRequire(require.resolve('@nestjs/platform-express'))('multer') as {
  MulterError: new (code: string, field?: string) => Error & { code: string };
};

/**
 * The multer codes a client causes, by the status their answer carries. `STREAM_DESTROYED` (the file stream broke on
 * the server side) is deliberately absent: it is not the client's error.
 */
const MULTIPART_CLIENT_ERRORS: Readonly<Record<string, 'BAD_REQUEST' | 'TOO_LARGE'>> = {
  LIMIT_FILE_SIZE: 'TOO_LARGE',
  LIMIT_PART_COUNT: 'BAD_REQUEST',
  LIMIT_FILE_COUNT: 'BAD_REQUEST',
  LIMIT_FIELD_KEY: 'BAD_REQUEST',
  LIMIT_FIELD_VALUE: 'BAD_REQUEST',
  LIMIT_FIELD_COUNT: 'BAD_REQUEST',
  LIMIT_UNEXPECTED_FILE: 'BAD_REQUEST',
  MISSING_FIELD_NAME: 'BAD_REQUEST',
  LIMIT_FIELD_NESTING: 'BAD_REQUEST',
  LIMIT_FIELD_ARRAY_INDEX: 'BAD_REQUEST',
  INVALID_FIELD_NAME: 'BAD_REQUEST',
};

/** body-parser documents `type` as the way to tell its errors apart; the status and shape must match it too. */
function bodyParserStatus(exception: unknown): ParserStatus | undefined {
  if (!(exception instanceof Error)) return undefined;
  const candidate = exception as Error & Record<string, unknown>;
  if (candidate.expose !== true) return undefined;

  if (typeof candidate.type === 'string' && Object.hasOwn(BODY_PARSER_REFUSALS, candidate.type)) {
    const refusal = BODY_PARSER_REFUSALS[candidate.type];
    const shaped = Object.entries(refusal.shape).every(([key, kind]) => typeof candidate[key] === kind);

    return candidate.status === refusal.code && candidate.statusCode === refusal.code && shaped
      ? refusal.status
      : undefined;
  }

  const decompression =
    candidate.type === undefined &&
    candidate.status === 400 &&
    candidate.statusCode === 400 &&
    typeof candidate.errno === 'number' &&
    typeof candidate.code === 'string' &&
    DECOMPRESSION_DATA_ERROR.test(candidate.code);

  return decompression ? 'BAD_REQUEST' : undefined;
}

function multipartStatus(exception: unknown): 'BAD_REQUEST' | 'TOO_LARGE' | undefined {
  if (!(exception instanceof MulterError)) return undefined;

  return Object.hasOwn(MULTIPART_CLIENT_ERRORS, exception.code) ? MULTIPART_CLIENT_ERRORS[exception.code] : undefined;
}
