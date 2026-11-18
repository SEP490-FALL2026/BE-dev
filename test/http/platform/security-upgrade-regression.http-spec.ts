import { ArgumentsHost, Body, Controller, Get, HttpStatus, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import * as zlib from 'node:zlib';
import request from 'supertest';
import { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../../../src/app/app.module';
import { configureApplication } from '../../../src/app/configure-application';
import { ApiSuccessResponse } from '../../../src/infrastructure/http/decorators/api-success-response.decorator';
import { successEnvelopeSchema } from '../../../src/infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../src/infrastructure/http/dto/zod-dto';
import { HttpExceptionFilter } from '../../../src/infrastructure/http/filters/http-exception.filter';
import { MulterError } from '../../../src/infrastructure/http/filters/request-parser-errors';
import { Public } from '../../../src/infrastructure/security/decorators/public.decorator';
import { ACCESS_TOKEN_VERIFIER } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { AuditEventPageResponseDto } from '../../../src/modules/audit/audit-event.dto';
import { PlanTermsBodyDto } from '../../../src/modules/catalog/plan-terms/plan-terms.dto';
import { UpdateSubscriptionBodyDto } from '../../../src/modules/catalog/subscription/subscription.dto';
import { ImportFileInvalidError } from '../../../src/modules/data-import/employee-import/employee-import.errors';
import { EmployeeImportPreviewService } from '../../../src/modules/data-import/employee-import/preview/employee-import-preview.service';
import { SeatImportFileInvalidError } from '../../../src/modules/data-import/seat-baseline-import/seat-baseline-import.errors';
import { SeatBaselineImportService } from '../../../src/modules/data-import/seat-baseline-import/seat-baseline-import.service';
import { bodyOf } from '../../support/api-body';
import { bearer, principal, TokenAsPrincipalVerifier } from '../../support/http-contract-app';

/**
 * SEC-UPGRADE-RV-01: the regression surface of the three security upgrades of ea73c2f — Zod 4.4.3 → 4.6.7, the
 * body-parser 2.4.0 override and the multer 2.5.0 override — exercised through the very copies Nest loads, with the
 * real pipe, serializer, parsers, upload routes and filter. The established 400/413/415/422/500 matrix
 * (docs/rules/api-contract.md, P29-N1/N2/N4) is the baseline; nothing here changes business behavior.
 */

const UUID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER_UUID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const PROCESSED = 'The request could not be processed.';
/** Nothing of the parsers, the form or the library reaches the client. */
const LEAK = /SECRET|Unexpected|Multipart|boundary|busboy|multer|Field value|too many|zlib|Z_|stack|entity|parse/i;

const echoSchema = successEnvelopeSchema(z.strictObject({ received: z.record(z.string(), z.unknown()) }));
class EchoResponseDto extends createZodDto(echoSchema) {}

/** The Zod features a DTO relies on, in one strict schema (validated by the real global pipe). */
const featuresSchema = z.strictObject({
  id: z.uuid(),
  at: z.iso.datetime({ offset: true }),
  kind: z.enum(['A', 'B']),
  either: z.union([z.string(), z.number()]),
  count: z.number().int().positive().default(1),
  code: z.string().trim().toUpperCase(),
  note: z.string().nullable(),
  later: z.string().nullable().optional(),
  scores: z.record(z.enum(['low', 'high']), z.number()),
  tags: z.record(z.string(), z.string()),
  matrix: z.array(z.array(z.number().nullable()).max(3)).max(3),
});
class FeaturesBodyDto extends createZodDto(featuresSchema) {}

/** Takes any parsed body, so the shape the URL-encoded parser (qs) gives can be read back. Test module only. */
class FormEchoBodyDto extends createZodDto(z.record(z.string(), z.unknown())) {}

/** A page shaped like the audit trail: the DTO whose records produced the `propertyNames` of F3, with its nulls. */
const auditPage = (before: unknown) => ({
  items: [
    {
      id: UUID,
      occurredAt: '2026-01-01T00:00:00.000Z',
      actorKind: 'OPERATOR',
      actorAppUserId: null,
      actorRoles: [],
      action: 'ACCOUNT.LOCKED',
      resourceType: 'APP_USER',
      resourceId: OTHER_UUID,
      before,
      after: null,
      correlationId: 'req_example',
      operatorReference: null,
    },
  ],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
});

/** Handler calls, so a parser refusal can be shown never to reach a handler. */
const handled: string[] = [];

@Controller({ path: 'upgrade-probe', version: '1' })
class UpgradeProbeController {
  @Post('subscription-update')
  @Public()
  @ApiSuccessResponse(EchoResponseDto, { status: HttpStatus.CREATED, message: 'PROBE.RECEIVED' })
  subscription(@Body() body: UpdateSubscriptionBodyDto) {
    handled.push('subscription-update');
    return { received: body };
  }

  @Post('plan-terms')
  @Public()
  @ApiSuccessResponse(EchoResponseDto, { status: HttpStatus.CREATED, message: 'PROBE.RECEIVED' })
  planTerms(@Body() body: PlanTermsBodyDto) {
    handled.push('plan-terms');
    return { received: body };
  }

  @Post('features')
  @Public()
  @ApiSuccessResponse(EchoResponseDto, { status: HttpStatus.CREATED, message: 'PROBE.RECEIVED' })
  features(@Body() body: FeaturesBodyDto) {
    handled.push('features');
    return { received: body };
  }

  @Post('form-echo')
  @Public()
  @ApiSuccessResponse(EchoResponseDto, { status: HttpStatus.CREATED, message: 'PROBE.RECEIVED' })
  formEcho(@Body() body: FormEchoBodyDto) {
    handled.push('form-echo');
    return { received: body };
  }

  @Get('audit-page')
  @Public()
  @ApiSuccessResponse(AuditEventPageResponseDto, { message: 'PROBE.LISTED' })
  page() {
    return auditPage({ email: 'a@example.com', roles: ['IT_ADMIN'], nested: { at: null } });
  }

  @Get('audit-page-invalid')
  @Public()
  @ApiSuccessResponse(AuditEventPageResponseDto, { message: 'PROBE.LISTED' })
  invalidPage() {
    // An array where the DTO says a record: the serializer must refuse it, not pass it on.
    return auditPage(['not-a-record']);
  }
}

/** The answer to a raw HTTP request: status, text and the parsed envelope. */
interface RawAnswer {
  status: number;
  text: string;
  body: { data?: unknown; error: { code: string; message: string } };
}

interface Captured {
  type: unknown;
  code: unknown;
  constructorName: string;
}

describe('SEC-UPGRADE-RV-01: the security upgrades through the modules Nest loads (e2e)', () => {
  let app: INestApplication<App>;
  const caught: Captured[] = [];
  const employeeUploads = jest.fn();
  const seatUploads = jest.fn();

  beforeAll(async () => {
    // Spied before the application binds its filter: the very exception objects the libraries raise are recorded.
    const original = Reflect.get(HttpExceptionFilter.prototype, 'catch') as (...args: unknown[]) => unknown;
    jest.spyOn(HttpExceptionFilter.prototype, 'catch').mockImplementation(function (
      this: HttpExceptionFilter,
      exception: unknown,
      host: ArgumentsHost,
    ) {
      const candidate = exception as { type?: unknown; code?: unknown; constructor?: { name?: string } };
      caught.push({
        type: candidate?.type,
        code: candidate?.code,
        constructorName: candidate?.constructor?.name ?? '',
      });
      return original.call(this, exception, host);
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [UpgradeProbeController] })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue(new TokenAsPrincipalVerifier())
      .overrideProvider(EmployeeImportPreviewService)
      .useValue({ upload: employeeUploads })
      .overrideProvider(SeatBaselineImportService)
      .useValue({ upload: seatUploads })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, { mountDocs: false });
    // Listening, so raw HTTP requests (exact bytes, a client that leaves) reach the same application.
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    caught.length = 0;
    handled.length = 0;
    // The handler reached the service: the service answers with a coded file error, so no database is involved.
    employeeUploads.mockReset().mockRejectedValue(new ImportFileInvalidError('FILE_EMPTY'));
    seatUploads.mockReset().mockRejectedValue(new SeatImportFileInvalidError('FILE_EMPTY'));
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  const server = () => app.getHttpServer() as Server;
  /** One request with exactly these bytes and headers; the JSON answer parsed. */
  const rawPost = (path: string, headers: Record<string, string>, body: Buffer) =>
    new Promise<RawAnswer>((resolve, reject) => {
      const { port } = server().address() as AddressInfo;
      const call = httpRequest(
        { host: '127.0.0.1', port, method: 'POST', path, headers: { ...headers, 'content-length': body.length } },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ status: response.statusCode ?? 0, text, body: JSON.parse(text) as RawAnswer['body'] });
          });
        },
      );
      call.on('error', reject);
      call.end(body);
    });
  const postJson = (path: string, body: unknown) =>
    request(server())
      .post(`/api/v1/upgrade-probe/${path}`)
      .set('content-type', 'application/json')
      .send(body as object);

  describe('the loaded copies', () => {
    it('are the patched versions, one copy each, and the filter knows multer by the class the upload route throws', () => {
      const nestExpress = dirname(require.resolve('@nestjs/platform-express/package.json'));
      const fromNest = createRequire(join(nestExpress, 'package.json'));
      const express = dirname(fromNest.resolve('express/package.json'));
      const version = (from: string, name: string) =>
        (createRequire(join(from, 'package.json'))(`${name}/package.json`) as { version: string }).version;
      const loaded = (name: string) =>
        new Set(
          Object.keys(require.cache)
            .map((file) => file.replace(/\\/g, '/').match(new RegExp(`/\\.pnpm/(${name}@[^/]+)/`))?.[1])
            .filter(Boolean),
        );

      const root = join(__dirname, '..', '..', '..');
      const bodyParser = dirname(createRequire(join(express, 'package.json')).resolve('body-parser/package.json'));

      expect({
        zod: version(root, 'zod'),
        bodyParser: version(express, 'body-parser'),
        multer: version(nestExpress, 'multer'),
        // SEC-UPGRADE-RV-01-F3: body-parser 2.4.0 declares qs ^6.16.1; the mailer carries the addressparser fixes.
        qsOfBodyParser: version(bodyParser, 'qs'),
        qsOfExpress: version(express, 'qs'),
        nodemailer: version(root, 'nodemailer'),
      }).toEqual({
        zod: '4.6.7',
        bodyParser: '2.4.0',
        multer: '2.5.0',
        qsOfBodyParser: '6.16.1',
        qsOfExpress: '6.16.1',
        nodemailer: '10.1.7',
      });
      expect([...loaded('zod')]).toEqual(['zod@4.6.7']);
      expect([...loaded('body-parser')]).toEqual(['body-parser@2.4.0']);
      expect([...loaded('multer')]).toEqual(['multer@2.5.0']);
      expect([...loaded('qs')]).toEqual(['qs@6.16.1']);
      expect([...loaded('nodemailer')]).toEqual(['nodemailer@10.1.7']);
      // fast-uri reaches the graph only through tooling (Prisma's local dev server, the Nest CLI): the API never loads it.
      expect([...loaded('fast-uri')]).toEqual([]);
      expect(MulterError).toBe((fromNest('multer') as { MulterError: unknown }).MulterError);
    });
  });

  describe('Zod 4.6.7: parse results of the real DTOs behind the F3 schemas', () => {
    it('reads the nullable dates of a subscription update as null, absent or a date — never as an array', async () => {
      const response = await postJson('subscription-update', {
        endDate: null,
        renewalDate: '2026-02-28',
        noticePeriodDays: null,
      }).expect(201);

      expect(bodyOf(response).data).toEqual({
        received: { endDate: null, renewalDate: '2026-02-28', noticePeriodDays: null },
      });
    });

    it.each([
      ['an array where the F3 document showed one', { endDate: ['2026-01-01'] }, 'endDate'],
      ['a date that does not exist', { renewalDate: '2026-02-30' }, 'renewalDate'],
      ['an unknown field', { endDate: null, extra: true }, ''],
    ])('refuses %s in a subscription update with 422 before the handler', async (_name, body, path) => {
      const response = await postJson('subscription-update', body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(bodyOf(response).error.details.issues.map((issue: { path: string }) => issue.path)).toEqual([path]);
      expect(handled).toEqual([]);
    });

    it('reads plan terms with null dates, null text and a nullable nested object', async () => {
      const body = { lastReviewedOn: null, termsUrl: null, installLimit: { maxDevicesPerKey: null, note: 'per seat' } };

      const response = await postJson('plan-terms', body).expect(201);

      expect(bodyOf(response).data).toEqual({ received: body });
      await postJson('plan-terms', { lastReviewedOn: ['2026-01-01'] }).expect(422);
    });

    it('keeps strict objects, defaults, transforms, enums, unions, uuid, date-time, records and nested arrays', async () => {
      const valid = {
        id: UUID,
        at: '2026-01-01T07:00:00+07:00',
        kind: 'B',
        either: 3,
        code: '  abc ',
        note: null,
        scores: { low: 1, high: 2 },
        tags: { team: 'a' },
        matrix: [[1, null], []],
      };

      const response = await postJson('features', valid).expect(201);

      expect(bodyOf(response).data).toEqual({ received: { ...valid, count: 1, code: 'ABC' } });
    });

    it.each([
      ['an id that is not a uuid', { id: 'not-a-uuid' }, 'id'],
      ['a date-time without a time', { at: '2026-01-01' }, 'at'],
      ['a kind outside the enum', { kind: 'C' }, 'kind'],
      ['a union member of neither type', { either: true }, 'either'],
      ['a missing key of an exhaustive record', { scores: { low: 1 } }, 'scores'],
      ['an extra key of an exhaustive record', { scores: { low: 1, high: 2, mid: 3 } }, 'scores'],
      ['a nested array over its bound', { matrix: [[1, 2, 3, 4]] }, 'matrix.0'],
      ['a required nullable left out', { note: undefined }, 'note'],
    ])('refuses %s with 422 naming the field', async (_name, change, path) => {
      const body = {
        id: UUID,
        at: '2026-01-01T00:00:00Z',
        kind: 'A',
        either: 'x',
        code: 'a',
        note: 'n',
        scores: { low: 1, high: 2 },
        tags: {},
        matrix: [],
        ...change,
      };

      const response = await postJson('features', body).expect(422);
      const paths: string[] = bodyOf(response).error.details.issues.map((issue: { path: string }) => issue.path);

      expect(paths.filter((at) => at === path || at.startsWith(`${path}.`))).not.toEqual([]);
      expect(handled).toEqual([]);
    });

    it('serializes the audit page with its records and nulls, and fails closed on an array where a record belongs', async () => {
      const ok = await request(server()).get('/api/v1/upgrade-probe/audit-page').expect(200);
      expect(bodyOf(ok).data).toEqual(auditPage({ email: 'a@example.com', roles: ['IT_ADMIN'], nested: { at: null } }));

      const refused = await request(server()).get('/api/v1/upgrade-probe/audit-page-invalid').expect(500);
      expect(bodyOf(refused).error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(refused.text).not.toContain('not-a-record');
    });
  });

  describe('body-parser 2.4.0: what the JSON and URL-encoded parsers accept and refuse', () => {
    const LIMIT = 100 * 1024;
    const json = JSON.stringify({ endDate: null, renewalDate: '2026-02-28' });
    /** A body that compresses to almost nothing and inflates past the limit. */
    const bomb = JSON.stringify({ endDate: `${'0'.repeat(LIMIT + 16)}` });
    const compressors: Array<[string, (input: Buffer) => Buffer]> = [
      ['gzip', (input) => zlib.gzipSync(input)],
      ['deflate', (input) => zlib.deflateSync(input)],
      ['br', (input) => zlib.brotliCompressSync(input)],
    ];
    const zstd = (zlib as unknown as { zstdCompressSync?: (input: Buffer) => Buffer }).zstdCompressSync;
    /**
     * The compressed bytes themselves, over a plain HTTP request: SuperTest serializes a Buffer as JSON
     * (`{"type":"Buffer",…}`) when the content type is JSON, so it cannot send a compressed JSON body.
     */
    const send = (encoding: string, body: Buffer) =>
      rawPost(
        '/api/v1/upgrade-probe/subscription-update',
        {
          'content-type': 'application/json',
          'content-encoding': encoding,
        },
        body,
      );

    it.each(compressors)('reads a valid %s body as the JSON it holds', async (encoding, compress) => {
      const response = await send(encoding, compress(Buffer.from(json)));

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual({ received: { endDate: null, renewalDate: '2026-02-28' } });
    });

    it('refuses a gzip body cut short with 400, from the zlib error of the real truncated stream', async () => {
      const response = await send('gzip', zlib.gzipSync(Buffer.from(json)).subarray(0, 12));

      expect({ status: response.status, code: response.body.error.code }).toEqual({
        status: 400,
        code: 'HTTP_BAD_REQUEST',
      });
      expect(caught.map((exception) => exception.code)).toEqual(['Z_BUF_ERROR']);
      expect(handled).toEqual([]);
    });

    it.each(compressors)(
      'refuses a %s body that inflates past 100 KiB with 413, before any handler',
      async (encoding, compress) => {
        const compressed = compress(Buffer.from(bomb));
        expect(compressed.length).toBeLessThan(LIMIT / 10);

        const response = await send(encoding, compressed);

        expect({ status: response.status, code: response.body.error.code }).toEqual({
          status: 413,
          code: 'HTTP_PAYLOAD_TOO_LARGE',
        });
        expect(handled).toEqual([]);
        expect(caught.map((exception) => exception.type)).toEqual(['entity.too.large']);
      },
    );

    /** The established answer to an encoding the parsers do not read: 415, nothing of the request, no handler. */
    const expectRefusedEncoding = (response: RawAnswer) => {
      expect({ status: response.status, error: response.body.error }).toEqual({
        status: 415,
        error: expect.objectContaining({ code: 'HTTP_UNSUPPORTED_MEDIA_TYPE', message: PROCESSED }) as unknown,
      });
      expect(response.text).not.toMatch(LEAK);
      expect(response.text).not.toMatch(/zstd|compress|endDate|2026-02-28/i);
      expect(handled).toEqual([]);
    };

    // SEC-UPGRADE-RV-01-F1 (Owner, 25/10/2026): the request contract stays gzip/deflate/br. body-parser 2.4.0 would
    // decode zstd wherever Node can (Node ≥ 22.15: CI, the image, this run); the boundary refuses it before any parser.
    (zstd ? it : it.skip)(
      'refuses real zstd bytes — a valid body and one that would inflate past the limit — with 415 before any parser',
      async () => {
        const compress = zstd as (input: Buffer) => Buffer;

        expectRefusedEncoding(await send('zstd', compress(Buffer.from(json))));
        expectRefusedEncoding(await send('zstd', compress(Buffer.from(bomb))));
        expect(caught.map((exception) => exception.constructorName)).toEqual([
          'UnsupportedMediaTypeException',
          'UnsupportedMediaTypeException',
        ]);
      },
    );

    it.each(['zstd', 'ZSTD', 'compress', 'gzip, br', 'x-unknown'])(
      'refuses a JSON body sent as %s with 415 at the boundary, whatever the runtime can decode',
      async (encoding) => {
        // Plain bytes: the refusal reads the header only, so it holds where Node has no zstd as well.
        expectRefusedEncoding(await send(encoding, Buffer.from(json)));
        expect(caught.map((exception) => exception.constructorName)).toEqual(['UnsupportedMediaTypeException']);
      },
    );

    it.each(['identity', 'IDENTITY', 'GZIP'])('still reads a JSON body whose encoding is %s', async (encoding) => {
      const body = /gzip/i.test(encoding) ? zlib.gzipSync(Buffer.from(json)) : Buffer.from(json);

      const response = await send(encoding, body);

      expect({ status: response.status, data: response.body.data }).toEqual({
        status: 201,
        data: { received: { endDate: null, renewalDate: '2026-02-28' } },
      });
    });

    it('leaves a request without a body and an URL-encoded one with an accepted encoding to the routes', async () => {
      await request(server()).get('/api/v1/health/live').set('content-encoding', 'zstd').expect(200);
      const form = await rawPost(
        '/api/v1/upgrade-probe/subscription-update',
        { 'content-type': 'application/x-www-form-urlencoded', 'content-encoding': 'gzip' },
        zlib.gzipSync(Buffer.from('endDate=2026-01-01')),
      );

      expect(form.status).toBe(201);
    });

    it('refuses JSON keys that look like prototypes as unknown fields, and pollutes nothing', async () => {
      for (const body of [
        '{"__proto__":{"polluted":true},"endDate":null}',
        '{"constructor":{"prototype":{"polluted":true}},"endDate":null}',
      ]) {
        const response = await request(server())
          .post('/api/v1/upgrade-probe/subscription-update')
          .set('content-type', 'application/json')
          .send(body)
          .expect(422);

        expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      }
      expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
      expect(handled).toEqual([]);
    });

    // SEC-UPGRADE-RV-01-F3: the URL-encoded parser runs on qs; an upgrade must not reshape what a form becomes.
    it.each([
      ['a=1&b=2', { a: '1', b: '2' }],
      ['list[]=1&list[]=2', { list: ['1', '2'] }],
      ['user[name]=Ann&user[roles][]=IT&user[roles][]=HR', { user: { name: 'Ann', roles: ['IT', 'HR'] } }],
      ['a=1&a=2', { a: ['1', '2'] }],
      ['a[1]=x&a[0]=y', { a: ['y', 'x'] }],
      ['a[101]=x', { a: { '101': 'x' } }],
      ['a[b][c][d][e][f]=deep', { a: { b: { c: { d: { e: { f: 'deep' } } } } } }],
      // qs 6.16.1 limits `[]` array syntax to the end of a key; a body-parser key reads the same as with 6.16.0.
      ['a[]b=1', { a: ['1'] }],
      ['a.b=1', { 'a.b': '1' }],
      ['name=Nguy%E1%BB%85n+V%C4%83n', { name: 'Nguyễn Văn' }],
      ['empty=&flag', { empty: '', flag: '' }],
      [
        '__proto__[polluted]=1&constructor[prototype][polluted]=1&ok=1',
        { constructor: { prototype: { polluted: '1' } }, ok: '1' },
      ],
    ])('reads the form %s as the same object', async (form, expected) => {
      const response = await request(server())
        .post('/api/v1/upgrade-probe/form-echo')
        .set('content-type', 'application/x-www-form-urlencoded')
        .send(form)
        .expect(201);

      expect(bodyOf(response).data).toEqual({ received: expected });
      expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('lets URL-encoded keys that look like prototypes through to validation, and pollutes nothing', async () => {
      const response = await request(server())
        .post('/api/v1/upgrade-probe/subscription-update')
        .set('content-type', 'application/x-www-form-urlencoded')
        .send('__proto__[polluted]=1&constructor[prototype][polluted]=1&endDate=2026-01-01');

      expect(response.status).toBe(422);
      expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('polluted');
      expect(handled).toEqual([]);
    });

    it.each([
      ['malformed JSON', { 'content-type': 'application/json' }, '{"endDate":', 400, 'SyntaxError', undefined],
      [
        'a JSON charset outside UTF',
        { 'content-type': 'application/json; charset=latin1' },
        json,
        415,
        'charset.unsupported',
      ],
      [
        'an unknown UTF charset',
        { 'content-type': 'application/json; charset=utf-99' },
        json,
        415,
        'charset.unsupported',
      ],
      [
        'a gzip body that is not gzip',
        { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        'SECRET',
        400,
        undefined,
        'Z_DATA_ERROR',
      ],
      [
        '101 URL-encoded parameters',
        { 'content-type': 'application/x-www-form-urlencoded' },
        Array.from({ length: 101 }, (_, i) => `p${i}=1`).join('&'),
        413,
        'parameters.too.many',
      ],
      [
        'URL-encoded nesting 6 deep',
        { 'content-type': 'application/x-www-form-urlencoded' },
        `a${'[b]'.repeat(6)}=1`,
        400,
        'querystring.parse.rangeError',
      ],
    ] as const)(
      'refuses %s with %i, recognizing the error the installed parser really raises',
      async (_name, headers, body, status, type, code = undefined) => {
        let call = request(server()).post('/api/v1/upgrade-probe/subscription-update');
        for (const [name, value] of Object.entries(headers)) call = call.set(name, value);

        const response = await call.send(body);

        expect(response.status).toBe(status);
        expect(bodyOf(response).error.message).toBe(PROCESSED);
        expect(response.text).not.toMatch(LEAK);
        expect(handled).toEqual([]);
        // What reached the filter: the documented `type` (or the zlib code), never a message match.
        const [exception] = caught;
        if (type === 'SyntaxError') expect(exception.constructorName).toBe('BadRequestException');
        else if (type !== undefined) expect(exception.type).toBe(type);
        else expect(exception.code).toBe(code);
      },
    );
  });

  describe('multer 2.5.0: the two upload routes', () => {
    const asAdmin = { Authorization: bearer(principal(['SUPER_ADMIN', 'IT_ADMIN'])) };
    const csv = Buffer.from('code,name\nE1,Ann\n');
    const employees = () => request(server()).post('/api/v1/employee-imports').set(asAdmin);
    const seats = () => request(server()).post('/api/v1/seat-baseline-imports').set(asAdmin);
    const raw = (path: string, contentType: string, body: string) =>
      request(server()).post(path).set(asAdmin).set('content-type', contentType).send(body);

    it('hands the file bytes, and the form fields, to the service of each route', async () => {
      await employees().attach('file', csv, 'people.csv').expect(422);
      await seats()
        .field('subscriptionId', UUID)
        .field('planId', OTHER_UUID)
        .attach('file', csv, 'seats.csv')
        .expect(422);

      const [[, employeeInput]] = employeeUploads.mock.calls as Array<[unknown, { fileName: string; bytes: Buffer }]>;
      const [[, seatInput]] = seatUploads.mock.calls as Array<[unknown, Record<string, unknown>]>;
      expect({ fileName: employeeInput.fileName, bytes: employeeInput.bytes.equals(csv) }).toEqual({
        fileName: 'people.csv',
        bytes: true,
      });
      expect({ ...seatInput, bytes: (seatInput.bytes as Buffer).equals(csv) }).toEqual({
        fileName: 'seats.csv',
        bytes: true,
        subscriptionId: UUID,
        planId: OTHER_UUID,
      });
    });

    it('passes an empty file on to the route, whose service judges it (no parser refusal)', async () => {
      await employees().attach('file', Buffer.alloc(0), 'empty.csv').expect(422);

      const [[, input]] = employeeUploads.mock.calls as Array<[unknown, { bytes: Buffer }]>;
      expect(input.bytes.length).toBe(0);
    });

    it('accepts a text field of exactly 64 bytes and refuses 65 (multer 2.5.0 counts the limit as allowed)', async () => {
      await employees().field('note', 'x'.repeat(64)).attach('file', csv, 'people.csv').expect(422);
      expect(employeeUploads).toHaveBeenCalledTimes(1);

      const refused = await employees().field('note', 'x'.repeat(65)).attach('file', csv, 'people.csv');
      expect({ status: refused.status, code: bodyOf(refused).error.code }).toEqual({
        status: 400,
        code: 'HTTP_BAD_REQUEST',
      });
      expect(employeeUploads).toHaveBeenCalledTimes(1);
    });

    it('accepts two text fields and refuses a third, before the route', async () => {
      await employees().field('a', '1').field('b', '2').attach('file', csv, 'people.csv').expect(422);
      expect(employeeUploads).toHaveBeenCalledTimes(1);

      const refused = await employees()
        .field('a', '1')
        .field('b', '2')
        .field('c', '3')
        .attach('file', csv, 'people.csv');
      expect(refused.status).toBe(400);
      expect(employeeUploads).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'a form cut short (no closing boundary)',
        'multipart/form-data; boundary=XyZ',
        '--XyZ\r\nContent-Disposition: form-data; name="file"; filename="people.csv"\r\n\r\ncode,name\nSECRET',
      ],
      ['a multipart type without a boundary', 'multipart/form-data', '--XyZ\r\n\r\nSECRET\r\n--XyZ--\r\n'],
      [
        'a part with a broken header',
        'multipart/form-data; boundary=XyZ',
        '--XyZ\r\nSECRET-no-colon\r\n\r\nx\r\n--XyZ--\r\n',
      ],
    ])(
      'refuses %s with 400 HTTP_BAD_REQUEST, without a library message or a call to the service',
      async (_name, type, body) => {
        for (const path of ['/api/v1/employee-imports', '/api/v1/seat-baseline-imports']) {
          const response = await raw(path, type, body);

          expect({ path, status: response.status, code: bodyOf(response).error.code }).toEqual({
            path,
            status: 400,
            code: 'HTTP_BAD_REQUEST',
          });
          expect(bodyOf(response).error.message).toBe(PROCESSED);
          expect(response.text).not.toMatch(LEAK);
        }
        expect(employeeUploads).not.toHaveBeenCalled();
        expect(seatUploads).not.toHaveBeenCalled();
      },
    );

    it('leaves a multipart upload to multer whatever its content encoding header says (the allowlist is JSON/URL-encoded only)', async () => {
      await employees().set('content-encoding', 'zstd').attach('file', csv, 'people.csv').expect(422);

      expect(employeeUploads).toHaveBeenCalledTimes(1);
    });

    it('survives a client that leaves in the middle of an upload, and serves the next request', async () => {
      const rejections: unknown[] = [];
      const onRejection = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onRejection);
      const listening = server();
      try {
        const { port } = listening.address() as AddressInfo;
        const socket = connect(port, '127.0.0.1');
        const reached = new Promise<void>((resolve) => listening.once('request', () => resolve()));
        socket.write(
          `POST /api/v1/employee-imports HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${asAdmin.Authorization}\r\n` +
            'Content-Type: multipart/form-data; boundary=XyZ\r\nContent-Length: 100000\r\n\r\n' +
            '--XyZ\r\nContent-Disposition: form-data; name="file"; filename="people.csv"\r\n\r\ncode,name\n',
        );
        await reached;
        socket.destroy();

        await request(listening).get('/api/v1/health/live').expect(200);
        expect(employeeUploads).not.toHaveBeenCalled();
        expect(rejections).toEqual([]);
      } finally {
        process.off('unhandledRejection', onRejection);
      }
    });
  });
});
