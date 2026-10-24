import { ArgumentsHost, BadRequestException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { createRequire } from 'node:module';
import { brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
import { ApiException } from '../errors/api.exception';
import { RequestContextService } from '../../observability/request-context.service';
import { HttpExceptionFilter } from './http-exception.filter';
import { MulterError } from './request-parser-errors';

interface CapturedResponse {
  status: number;
  body: { success: false; error: { code: string; message: string; details?: unknown; requestId: string } };
}

function captureResponse(
  filter: HttpExceptionFilter,
  exception: unknown,
  state: Record<string, unknown> = {},
): CapturedResponse {
  const captured: Partial<CapturedResponse> = {};
  const response = {
    ...state,
    setHeader: () => response,
    status: (value: number) => {
      captured.status = value;
      return response;
    },
    json: (value: CapturedResponse['body']) => {
      captured.body = value;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ header: () => undefined }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  filter.catch(exception, host);

  return captured as CapturedResponse;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter(new RequestContextService());
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('uses one code for a thrown non-HttpException', () => {
    const captured = captureResponse(filter, new TypeError('boom'));

    expect(captured.status).toBe(500);
    expect(captured.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('uses the same code for an HttpException carrying a 500', () => {
    const captured = captureResponse(filter, new InternalServerErrorException());

    expect(captured.status).toBe(500);
    expect(captured.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('uses the same code for any other 5xx status', () => {
    const captured = captureResponse(filter, new ApiException(HttpStatus.BAD_GATEWAY, {} as never));

    expect(captured.status).toBe(502);
    expect(captured.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('still derives 4xx codes from the status', () => {
    expect(captureResponse(filter, new BadRequestException()).body.error.code).toBe('HTTP_BAD_REQUEST');
  });

  it('never leaks the internal message of a 5xx', () => {
    const captured = captureResponse(filter, new Error('connection string postgres://app:secret@db/app'));

    expect(captured.body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(captured.body)).not.toContain('secret');
  });

  it('keeps a deliberate code and details from an ApiException', () => {
    const captured = captureResponse(
      filter,
      new ApiException(HttpStatus.CONFLICT, {
        code: 'CATALOG.APPLICATION_SLUG_TAKEN',
        message: 'A catalog application with this slug already exists.',
        details: { slug: 'figma' },
      }),
    );

    expect(captured.status).toBe(409);
    expect(captured.body.error).toMatchObject({
      code: 'CATALOG.APPLICATION_SLUG_TAKEN',
      details: { slug: 'figma' },
    });
  });

  it('always carries a request id', () => {
    expect(captureResponse(filter, new Error('boom')).body.error.requestId).toEqual(expect.stringMatching(/\S/));
  });

  describe('refusals of the request parsers (P29-N1, P29-N2)', () => {
    /** What raw-body throws through body-parser for a JSON body over the limit (http-errors 2, raw-body 3). */
    const bodyTooLarge = (overrides: Record<string, unknown> = {}) =>
      Object.assign(new Error('request entity too large'), {
        name: 'PayloadTooLargeError',
        expose: true,
        status: 413,
        statusCode: 413,
        expected: 102_401,
        length: 102_401,
        limit: 102_400,
        type: 'entity.too.large',
        ...overrides,
      });
    /** What multer 2 throws: its own MulterError with a code (its message is not part of the contract). */
    const multerError = (code: string) => new MulterError(code, 'document');

    it('recognizes the very MulterError class the file interceptor of Nest loads', () => {
      const interceptor = require.resolve('@nestjs/platform-express/multer/interceptors/file.interceptor.js');

      const loaded = createRequire(interceptor)('multer') as { MulterError: unknown };

      expect(loaded.MulterError).toBe(MulterError);
    });

    it('answers a JSON body over the parser limit with 413 HTTP_PAYLOAD_TOO_LARGE and nothing of the parser', () => {
      const logged = jest.spyOn(filter['logger'], 'error');
      const captured = captureResponse(filter, bodyTooLarge());

      expect(captured.status).toBe(413);
      const { requestId, ...error } = captured.body.error;
      expect(error).toEqual({ code: 'HTTP_PAYLOAD_TOO_LARGE', message: 'The request could not be processed.' });
      expect(requestId).toMatch(/\S/);
      expect(JSON.stringify(captured.body)).not.toMatch(/entity|102400|102401|limit/);
      expect(logged).not.toHaveBeenCalled();
    });

    it.each([
      ['an object that only claims status 413', { status: 413, statusCode: 413, type: 'entity.too.large', limit: 1 }],
      ['an Error that only claims status 413', Object.assign(new Error('x'), { status: 413, statusCode: 413 })],
      ['the body-parser error without its type', bodyTooLarge({ type: undefined })],
      ['the body-parser error with another status', bodyTooLarge({ status: 500, statusCode: 500 })],
      ['the body-parser error without its limit', bodyTooLarge({ limit: undefined })],
    ])('keeps %s an unexpected error: 500 with no detail', (_name, thrown) => {
      const captured = captureResponse(filter, thrown);

      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(captured.body.error.message).toBe('An unexpected error occurred.');
    });

    it.each([
      ['LIMIT_UNEXPECTED_FILE', 400, 'HTTP_BAD_REQUEST'],
      ['LIMIT_PART_COUNT', 400, 'HTTP_BAD_REQUEST'],
      ['LIMIT_FILE_COUNT', 400, 'HTTP_BAD_REQUEST'],
      ['LIMIT_FIELD_KEY', 400, 'HTTP_BAD_REQUEST'],
      ['LIMIT_FIELD_VALUE', 400, 'HTTP_BAD_REQUEST'],
      ['LIMIT_FIELD_COUNT', 400, 'HTTP_BAD_REQUEST'],
      ['MISSING_FIELD_NAME', 400, 'HTTP_BAD_REQUEST'],
      ['LIMIT_FIELD_NESTING', 400, 'HTTP_BAD_REQUEST'],
      ['LIMIT_FIELD_ARRAY_INDEX', 400, 'HTTP_BAD_REQUEST'],
      ['INVALID_FIELD_NAME', 400, 'HTTP_BAD_REQUEST'],
      ['LIMIT_FILE_SIZE', 413, 'HTTP_PAYLOAD_TOO_LARGE'],
    ])('answers the multer code %s with %i %s, naming no field', (code, status, wire) => {
      const captured = captureResponse(filter, multerError(code));

      expect({ status: captured.status, code: captured.body.error.code }).toEqual({ status, code: wire });
      expect(captured.body.error.message).toBe('The request could not be processed.');
      expect(JSON.stringify(captured.body)).not.toMatch(/document|multer/);
    });

    it.each([
      ['a broken file stream (STREAM_DESTROYED)', multerError('STREAM_DESTROYED')],
      ['a multer code it does not know', multerError('LIMIT_SOMETHING_NEW')],
      ['a plain object that looks like a MulterError', { name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE' }],
      [
        'an Error named MulterError that multer did not make',
        Object.assign(new Error('x'), { name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE' }),
      ],
      [
        'an Error with a multer code but another name',
        Object.assign(new Error('x'), { code: 'LIMIT_UNEXPECTED_FILE' }),
      ],
      ['a storage failure', Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })],
    ])('keeps %s a server error: 500 with no detail', (_name, thrown) => {
      const captured = captureResponse(filter, thrown);

      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(JSON.stringify(captured.body)).not.toMatch(/ENOSPC|STREAM|LIMIT/);
    });
  });

  describe('the request-parser matrix (P29-N4)', () => {
    // The very http-errors body-parser uses (a dependency of express, itself one of @nestjs/platform-express), so every
    // error below has the exact shape body-parser 2.3 and raw-body 3 give it.
    const fromBodyParser = createRequire(
      createRequire(createRequire(require.resolve('@nestjs/platform-express')).resolve('express')).resolve(
        'body-parser',
      ),
    );
    const createError = fromBodyParser('http-errors') as (
      status: number,
      message: string | Error,
      props?: Record<string, unknown>,
    ) => Error;
    const SECRET = 'SECRET-FIELD-VALUE';
    const zlibFailure = (decompress: () => unknown): Error => {
      try {
        decompress();
      } catch (error) {
        // read.js: `createError(400, error)`, then `createError(400, _error)` once the request is dumped.
        return createError(400, createError(400, error as Error));
      }
      throw new Error('expected the decompression to fail');
    };
    const LEAK = /SECRET-FIELD-VALUE|latin1|compress|aborted|depth|parameters|too large|charset|Z_|header/i;

    const refusals: [string, () => Error, number, string][] = [
      [
        'entity.parse.failed (URL-encoded)',
        () => createError(400, new TypeError('x'), { body: SECRET, type: 'entity.parse.failed' }),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'request.size.invalid',
        () =>
          createError(400, 'request size did not match content length', {
            expected: 10,
            length: 10,
            received: 4,
            type: 'request.size.invalid',
          }),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'request.aborted',
        () =>
          createError(400, 'request aborted', {
            code: 'ECONNABORTED',
            expected: 100,
            length: 100,
            received: 9,
            type: 'request.aborted',
          }),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'querystring.parse.rangeError',
        () =>
          createError(400, createError(400, 'The input exceeded the depth', { type: 'querystring.parse.rangeError' }), {
            body: `a[b]=${SECRET}`,
            type: 'querystring.parse.rangeError',
          }),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'entity.too.large',
        () =>
          createError(
            400,
            createError(413, 'request entity too large', {
              expected: 102_401,
              length: 102_401,
              limit: 102_400,
              type: 'entity.too.large',
            }),
          ),
        413,
        'HTTP_PAYLOAD_TOO_LARGE',
      ],
      [
        'parameters.too.many',
        () =>
          createError(400, createError(413, 'too many parameters', { type: 'parameters.too.many' }), {
            body: `a=${SECRET}`,
            type: 'parameters.too.many',
          }),
        413,
        'HTTP_PAYLOAD_TOO_LARGE',
      ],
      [
        'charset.unsupported',
        () => createError(415, 'unsupported charset "LATIN1"', { charset: 'latin1', type: 'charset.unsupported' }),
        415,
        'HTTP_UNSUPPORTED_MEDIA_TYPE',
      ],
      [
        'encoding.unsupported',
        () =>
          createError(415, 'unsupported content encoding "compress"', {
            encoding: 'compress',
            type: 'encoding.unsupported',
          }),
        415,
        'HTTP_UNSUPPORTED_MEDIA_TYPE',
      ],
      [
        'a gzip body that is not gzip (Z_DATA_ERROR)',
        () => zlibFailure(() => gunzipSync(Buffer.from(SECRET))),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'a gzip body cut short (Z_BUF_ERROR)',
        () => zlibFailure(() => gunzipSync(gzipSync(SECRET).subarray(0, 12))),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'a brotli body that is not brotli (ERR__ERROR_FORMAT_*)',
        () => zlibFailure(() => brotliDecompressSync(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00, 0x13]))),
        400,
        'HTTP_BAD_REQUEST',
      ],
    ];

    it.each(refusals)('answers %s with %i %s and nothing of the request or the parser', (_name, make, status, code) => {
      const logged = jest.spyOn(filter['logger'], 'error');
      const captured = captureResponse(filter, make());

      expect({ status: captured.status, code: captured.body.error.code }).toEqual({ status, code });
      expect(captured.body.error.message).toBe('The request could not be processed.');
      expect(JSON.stringify(captured.body)).not.toMatch(LEAK);
      expect(logged).not.toHaveBeenCalled();
    });

    const valid = (type: string) => refusals.find(([name]) => name.startsWith(type))![1]();
    const without = (error: Error, key: string) => Object.assign(error, { [key]: undefined });

    it.each([
      [
        'a plain object with the type, status and shape of a refusal',
        () => ({
          ...valid('charset.unsupported'),
          type: 'charset.unsupported',
          status: 415,
          statusCode: 415,
          expose: true,
          charset: 'latin1',
        }),
      ],
      ['a refusal that is not exposed', () => Object.assign(valid('charset.unsupported'), { expose: false })],
      [
        'charset.unsupported with the status of another type',
        () => Object.assign(valid('charset.unsupported'), { status: 400, statusCode: 400 }),
      ],
      [
        'parameters.too.many with only its status changed',
        () => Object.assign(valid('parameters.too.many'), { status: 400 }),
      ],
      ['charset.unsupported without its charset', () => without(valid('charset.unsupported'), 'charset')],
      ['encoding.unsupported without its encoding', () => without(valid('encoding.unsupported'), 'encoding')],
      ['request.aborted without its byte count', () => without(valid('request.aborted'), 'received')],
      ['request.size.invalid without its byte counts', () => without(valid('request.size.invalid'), 'expected')],
      ['parameters.too.many without its body', () => without(valid('parameters.too.many'), 'body')],
      ['querystring.parse.rangeError without its body', () => without(valid('querystring.parse.rangeError'), 'body')],
      ['entity.parse.failed without its body', () => without(valid('entity.parse.failed'), 'body')],
      [
        'stream.encoding.set',
        () => createError(500, 'stream encoding should not be set', { type: 'stream.encoding.set' }),
      ],
      ['stream.not.readable', () => createError(500, 'stream is not readable', { type: 'stream.not.readable' })],
      [
        'stream.encoding.set claiming a client status',
        () => createError(400, 'stream encoding should not be set', { type: 'stream.encoding.set' }),
      ],
      [
        'stream.not.readable claiming a client status',
        () => createError(400, 'stream is not readable', { type: 'stream.not.readable' }),
      ],
      [
        'entity.verify.failed (no verify hook is configured)',
        () => createError(403, new Error('x'), { body: SECRET, type: 'entity.verify.failed' }),
      ],
      ['a parser type it does not know', () => createError(400, 'x', { body: SECRET, type: 'entity.mystery' })],
      [
        'a zlib error body-parser did not stamp',
        () => {
          try {
            gunzipSync(Buffer.from(SECRET));
          } catch (error) {
            return error as Error;
          }
          throw new Error('expected');
        },
      ],
      [
        'a zlib memory error stamped 400',
        () => createError(400, Object.assign(new Error('x'), { code: 'Z_MEM_ERROR', errno: -4 })),
      ],
      [
        'a decompression error code without errno',
        () => createError(400, Object.assign(new Error('x'), { code: 'Z_DATA_ERROR' })),
      ],
    ])('keeps %s a server error: 500 with no detail', (_name, make) => {
      const captured = captureResponse(filter, make());

      expect({ status: captured.status, code: captured.body.error.code }).toEqual({
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(captured.body.error.message).toBe('An unexpected error occurred.');
      expect(JSON.stringify(captured.body)).not.toMatch(LEAK);
    });

    it.each([
      ['its socket is destroyed (request.aborted)', { socket: { destroyed: true } }],
      ['its headers are already sent', { headersSent: true }],
      ['it has ended', { writableEnded: true }],
      ['it is destroyed', { destroyed: true }],
    ])('writes nothing to a response when %s', (_name, state) => {
      const captured = captureResponse(filter, valid('request.aborted'), state);

      expect(captured).toEqual({});
    });

    it('still answers a response whose socket is open', () => {
      expect(captureResponse(filter, valid('request.aborted'), { socket: { destroyed: false } }).status).toBe(400);
    });
  });
});
