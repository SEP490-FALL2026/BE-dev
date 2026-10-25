import { Module, UnsupportedMediaTypeException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACCEPTED_CONTENT_ENCODINGS,
  applyRequestBodyLimit,
  contentEncodingAllowlist,
  REQUEST_BODY_LIMIT_BYTES,
  REQUEST_BODY_LIMIT_TEXT,
  URLENCODED_DEPTH_LIMIT,
  URLENCODED_PARAMETER_LIMIT,
} from './request-body-limit';

@Module({})
class EmptyModule {}

/** The names of the middleware the Express router runs, in order. */
function parserNames(app: NestExpressApplication): string[] {
  const router = (app.getHttpAdapter().getInstance() as { router: { stack: { handle?: { name?: string } }[] } }).router;

  return router.stack
    .map((layer) => layer.handle?.name ?? '')
    .filter((name) => ['contentEncodingAllowlist', 'jsonParser', 'urlencodedParser'].includes(name));
}

describe('applyRequestBodyLimit (P29-N1)', () => {
  it('is 100 KiB, written out once', () => {
    expect(REQUEST_BODY_LIMIT_BYTES).toBe(102_400);
    expect(REQUEST_BODY_LIMIT_TEXT).toBe('100 KiB');
  });

  it('limits URL-encoded input to 100 parameters and a depth of 5, as the API contract states (P29-N4)', () => {
    const contract = readFileSync(join(process.cwd(), 'docs', 'rules', 'api-contract.md'), 'utf8');

    expect({ parameters: URLENCODED_PARAMETER_LIMIT, depth: URLENCODED_DEPTH_LIMIT }).toEqual({
      parameters: 100,
      depth: 5,
    });
    expect(contract).toContain(`tối đa ${URLENCODED_PARAMETER_LIMIT} tham số`);
    expect(contract).toContain(`độ sâu lồng tối đa ${URLENCODED_DEPTH_LIMIT}`);
  });

  it('mounts the encoding allowlist, then exactly one JSON and one URL-encoded parser: Nest adds no default', async () => {
    const app = await NestFactory.create<NestExpressApplication>(EmptyModule, { logger: false });
    try {
      applyRequestBodyLimit(app);
      await app.init();

      expect(parserNames(app)).toEqual(['contentEncodingAllowlist', 'jsonParser', 'urlencodedParser']);
    } finally {
      await app.close();
    }
  });

  it('refuses an application that cannot register a body parser', () => {
    expect(() => applyRequestBodyLimit({} as never)).toThrow('Expected an Express application');
  });
});

/** SEC-UPGRADE-RV-01-F1: the content encodings of the request contract stay those before body-parser 2.4.0. */
describe('contentEncodingAllowlist', () => {
  /** A request as Express sees it: `is` answers the matched type, `false` for another type, `null` without a body. */
  const run = (contentType: string | null, encoding?: string) => {
    const request = {
      headers: encoding === undefined ? {} : { 'content-encoding': encoding },
      is: (types: string[]) => (contentType === null ? null : types.includes(contentType) ? contentType : false),
    } as unknown as Request;
    const next = jest.fn();

    contentEncodingAllowlist(request, {} as Response, next);

    return next.mock.calls as unknown[][];
  };

  it('is gzip, deflate and br besides no encoding, as the API contract states', () => {
    const contract = readFileSync(join(process.cwd(), 'docs', 'rules', 'api-contract.md'), 'utf8');

    expect(ACCEPTED_CONTENT_ENCODINGS).toEqual(['identity', 'gzip', 'deflate', 'br']);
    expect(contract).toContain('chỉ `gzip`, `deflate`, `br`');
  });

  it.each(['application/json', 'application/x-www-form-urlencoded'])(
    'lets a %s body through without an encoding or with an accepted one, in any case',
    (type) => {
      // An empty header reads as no encoding, as body-parser reads it.
      for (const encoding of [undefined, '', 'identity', 'gzip', 'GZIP', 'deflate', 'br'])
        expect({ encoding, calls: run(type, encoding) }).toEqual({ encoding, calls: [[]] });
    },
  );

  it.each(['zstd', 'ZSTD', 'compress', 'gzip, br', 'x-unknown'])(
    'answers a JSON or URL-encoded body sent as "%s" with the 415 of an unsupported encoding',
    (encoding) => {
      for (const type of ['application/json', 'application/x-www-form-urlencoded']) {
        const [[error]] = run(type, encoding);

        expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
      }
    },
  );

  it('leaves a body the two parsers do not read, and a request without a body, to the routes', () => {
    expect(run('multipart/form-data', 'zstd')).toEqual([[]]);
    expect(run('text/plain', 'zstd')).toEqual([[]]);
    expect(run(null, 'zstd')).toEqual([[]]);
  });
});
