import { ArgumentsHost, Body, Controller, Get, HttpStatus, INestApplication, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import type { Server } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { bodyOf } from '../support/api-body';
import { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../../src/app.module';
import { configureApplication, createOpenApiDocument } from '../../src/bootstrap';
import { EnvironmentVariables } from '../../src/infrastructure/config/env-schema';
import { ApiSuccessResponse } from '../../src/infrastructure/http/decorators/api-success-response.decorator';
import { RawResponse } from '../../src/infrastructure/http/decorators/raw-response.decorator';
import { successEnvelopeSchema } from '../../src/infrastructure/http/dto/success-envelope.dto';
import { ApiException } from '../../src/infrastructure/http/errors/api.exception';
import { HttpExceptionFilter } from '../../src/infrastructure/http/filters/http-exception.filter';
import { AuthenticatedOnly, RequireRoles } from '../../src/infrastructure/security/decorators/access.decorators';
import { Public } from '../../src/infrastructure/security/decorators/public.decorator';
import {
  ACCESS_TOKEN_VERIFIER,
  TokenVerificationUnavailableError,
} from '../../src/infrastructure/security/tokens/access-token-verifier.port';

const ContractProbeRequestSchema = z.strictObject({
  name: z.string().trim().min(1),
  nested: z.strictObject({ count: z.number().int().positive() }),
});
class ContractProbeRequestDto extends createZodDto(ContractProbeRequestSchema) {}

const ContractProbeDataSchema = z.strictObject({ accepted: z.boolean() });
class ContractProbeResponseDto extends createZodDto(successEnvelopeSchema(ContractProbeDataSchema)) {}

@Controller({ path: 'contract-probe', version: '1' })
class ContractProbeController {
  @Post()
  @Public()
  @ApiSuccessResponse(ContractProbeResponseDto, { status: HttpStatus.CREATED })
  validate(@Body() input: ContractProbeRequestDto): z.infer<typeof ContractProbeDataSchema> {
    void input;
    return { accepted: true };
  }

  @Get('invalid-response')
  @Public()
  @ApiSuccessResponse(ContractProbeResponseDto)
  invalidResponse(): unknown {
    return { accepted: 'not-a-boolean' };
  }

  @Get('raw')
  @Public()
  @RawResponse()
  raw(): { plain: true } {
    return { plain: true };
  }

  // A deliberate, coded business error: the wire shape every future 4xx follows.
  @Get('conflict')
  @Public()
  conflict(): never {
    throw new ApiException(HttpStatus.CONFLICT, {
      code: 'CONTRACT_PROBE.CONFLICT',
      message: 'The probe conflicts with existing state.',
      details: { field: 'name' },
    });
  }
}

@Controller({ path: 'protected-probe', version: '1' })
class ProtectedProbeController {
  @Get()
  @AuthenticatedOnly()
  getProbe(): { status: 'protected' } {
    return { status: 'protected' };
  }
}

/** Declares nothing: must fail closed rather than become public or private by accident. */
@Controller({ path: 'undeclared-probe', version: '1' })
class UndeclaredProbeController {
  @Get()
  get(): { status: 'reachable' } {
    return { status: 'reachable' };
  }
}

/** Exercises @RequireRoles, which no production route uses until slice 1b. Test module only. */
@Controller({ path: 'role-probe', version: '1' })
class RoleProbeController {
  @Get()
  @RequireRoles('IT_ADMIN')
  get(): { status: 'allowed' } {
    return { status: 'allowed' };
  }
}

function principalWithRoles(...roles: string[]) {
  return {
    subject: 'u1',
    appUserId: 'u1',
    sessionId: 's1',
    employeeId: 'e1',
    directRoles: roles,
    derivedRoles: [],
    roles,
  };
}

describe('Application foundation (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedProbeController, ContractProbeController, UndeclaredProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('exposes a versioned liveness endpoint', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect({
        success: true,
        message: 'HEALTH.LIVENESS_CHECKED',
        data: { status: 'ok' },
      });
  });

  it('denies protected routes by default', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/protected-probe')
      .expect(401)
      .expect((response) => {
        expect(bodyOf(response)).toMatchObject({
          success: false,
          error: { code: 'AUTHENTICATION_REQUIRED' },
        });
      });
  });

  it('returns the stable not-found error envelope', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404)
      .expect((response) => {
        const body = bodyOf(response) as {
          success: boolean;
          error: { code: string; requestId: string };
        };
        expect(body).toMatchObject({
          success: false,
          error: {
            code: 'HTTP_NOT_FOUND',
          },
        });
        expect(typeof body.error.requestId).toBe('string');
        expect(body.error.requestId.length).toBeGreaterThan(0);
      });
  });

  it('ignores a caller-provided request ID when no trusted proxy is configured', async () => {
    // TRUST_PROXY_HOPS defaults to 0, so this app is not behind a proxy and the inbound
    // header is untrusted input. Honouring it would let any caller pin every request to
    // one correlation id, or reuse an id already present in somebody else's audit trail.
    // Whether the header is well-formed is irrelevant: it is the trust that is missing.
    for (const candidate of ['web-01J_SAFE.request', 'unsafe request id']) {
      const response = await request(app!.getHttpServer())
        .get('/api/v1/does-not-exist')
        .set('x-request-id', candidate)
        .expect(404);

      expect(response.headers['x-request-id']).not.toBe(candidate);
      expect(response.headers['x-request-id']).toEqual(expect.any(String));
    }
  });

  it('cannot be tricked into trusting a caller that asserts its own proxy headers', async () => {
    const response = await request(app!.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('x-request-id', 'caller-chosen-id')
      .set('x-forwarded-for', '203.0.113.9')
      .set('x-real-ip', '203.0.113.9')
      .expect(404);

    expect(response.headers['x-request-id']).not.toBe('caller-chosen-id');
  });

  it('returns a raw body unwrapped while its sibling stays enveloped', async () => {
    // Asserting the sibling in the same test is the point: it proves the opt-out is scoped
    // to one handler rather than having switched the envelope off for the whole app.
    await request(app!.getHttpServer())
      .get('/api/v1/contract-probe/raw')
      .expect(200)
      .expect((response) => {
        expect(bodyOf(response)).toEqual({ plain: true });
      });

    await request(app!.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect((response) => {
        expect(bodyOf(response)).toEqual({
          success: true,
          message: 'HEALTH.LIVENESS_CHECKED',
          data: { status: 'ok' },
        });
      });
  });
  it('returns a request ID for successful responses', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect((response) => {
        expect(response.headers['x-request-id']).toEqual(expect.any(String));
      });
  });

  it('validates strict nested Zod request DTOs', async () => {
    await request(app!.getHttpServer())
      .post('/api/v1/contract-probe')
      .send({ name: 'valid', nested: { count: 1 } })
      .expect(201)
      .expect({
        success: true,
        message: 'COMMON.SUCCESS',
        data: { accepted: true },
      });

    await request(app!.getHttpServer())
      .post('/api/v1/contract-probe')
      .send({ name: 'invalid', nested: { count: 1, unexpected: true } })
      .expect(422)
      .expect((response) => {
        expect(bodyOf(response)).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            details: {
              issues: [{ code: 'unrecognized_keys', path: 'nested' }],
            },
          },
        });
      });
  });

  describe('the JSON body limit of the parser (P29-N1)', () => {
    // Written out, not read from the code: the documented limit is 100 KiB of JSON (docs/rules/api-contract.md).
    const LIMIT = 100 * 1024;
    const MARKER = 'SECRET-BODY-MARKER';
    /** A probe body of exactly `bytes` bytes that the probe accepts when the parser lets it through. */
    const probeBody = (bytes: number) => {
      const [head, tail] = ['{"name":"', '","nested":{"count":1}}'];

      return head + MARKER + 'x'.repeat(bytes - head.length - tail.length - MARKER.length) + tail;
    };
    const post = (path: string, body: string) =>
      request(app!.getHttpServer()).post(path).set('content-type', 'application/json').send(body);

    it('reads a body of exactly the limit', async () => {
      expect(Buffer.byteLength(probeBody(LIMIT))).toBe(LIMIT);

      await post('/api/v1/contract-probe', probeBody(LIMIT)).expect(201);
    });

    it.each([
      ['a public route', '/api/v1/contract-probe'],
      ['the public sign-in route', '/api/v1/auth/login'],
      ['a protected route, before any token is read', '/api/v1/applications'],
    ])(
      'answers one byte more on %s with 413 HTTP_PAYLOAD_TOO_LARGE and nothing of the parser or the body',
      async (_name, path) => {
        const response = await post(path, probeBody(LIMIT + 1));

        expect(response.status).toBe(413);
        expect(bodyOf(response)).toEqual({
          success: false,
          error: {
            code: 'HTTP_PAYLOAD_TOO_LARGE',
            message: 'The request could not be processed.',
            requestId: response.headers['x-request-id'],
          },
        });
        expect(response.text).not.toMatch(/SECRET-BODY-MARKER|entity|limit|stack|102400/i);
      },
    );
  });

  describe('the other refusals of the request parsers (P29-N4)', () => {
    const SECRET = 'SECRET-FIELD-VALUE';
    const LOGIN = '/api/v1/auth/login';
    const post = (headers: Record<string, string>, body: string | Buffer) => {
      let call = request(app!.getHttpServer()).post(LOGIN);
      for (const [name, value] of Object.entries(headers)) call = call.set(name, value);

      return call.send(body);
    };
    /** Nothing of the body, the header values or the parser reaches the client. */
    const LEAK =
      /SECRET-FIELD-VALUE|latin1|koi8|compress|unexpected|unsupported (?:charset|content)|parse|depth|parameters|stack|zlib|Z_/i;
    const form = (pairs: number) => Array.from({ length: pairs }, (_, index) => `p${index}=${SECRET}`).join('&');
    const nested = (levels: number) => `a${'[b]'.repeat(levels)}=${SECRET}`;

    it.each([
      ['malformed JSON', { 'content-type': 'application/json' }, `{"email":"${SECRET}"`, 400, 'HTTP_BAD_REQUEST'],
      [
        'a JSON charset other than UTF',
        { 'content-type': 'application/json; charset=latin1' },
        `{"email":"${SECRET}"}`,
        415,
        'HTTP_UNSUPPORTED_MEDIA_TYPE',
      ],
      [
        'a JSON charset that does not exist',
        { 'content-type': 'application/json; charset=utf-99' },
        `{"email":"${SECRET}"}`,
        415,
        'HTTP_UNSUPPORTED_MEDIA_TYPE',
      ],
      [
        'a content encoding the parser does not read',
        { 'content-type': 'application/json', 'content-encoding': 'compress' },
        `{"email":"${SECRET}"}`,
        415,
        'HTTP_UNSUPPORTED_MEDIA_TYPE',
      ],
      [
        'a gzip body that is not gzip',
        { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        SECRET,
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'a deflate body that is not deflate',
        { 'content-type': 'application/json', 'content-encoding': 'deflate' },
        SECRET,
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'a brotli body that is not brotli',
        { 'content-type': 'application/json', 'content-encoding': 'br' },
        Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00, 0x13]),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'a gzip body cut short',
        { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        gzipSync(`{"email":"${SECRET}"}`).subarray(0, 12),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'far too many URL-encoded parameters',
        { 'content-type': 'application/x-www-form-urlencoded' },
        form(1001),
        413,
        'HTTP_PAYLOAD_TOO_LARGE',
      ],
      [
        'one URL-encoded parameter over the limit of 100',
        { 'content-type': 'application/x-www-form-urlencoded' },
        form(101),
        413,
        'HTTP_PAYLOAD_TOO_LARGE',
      ],
      [
        'URL-encoded nesting 40 deep',
        { 'content-type': 'application/x-www-form-urlencoded' },
        nested(40),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'URL-encoded nesting one level over the depth of 5',
        { 'content-type': 'application/x-www-form-urlencoded' },
        nested(6),
        400,
        'HTTP_BAD_REQUEST',
      ],
      [
        'a URL-encoded charset other than UTF-8 or ISO-8859-1',
        { 'content-type': 'application/x-www-form-urlencoded; charset=koi8-r' },
        `a=${SECRET}`,
        415,
        'HTTP_UNSUPPORTED_MEDIA_TYPE',
      ],
    ])(
      'refuses %s with its own status and code, and returns nothing of the request',
      async (_name, headers, body, status, code) => {
        const response = await post(headers, body);

        expect({ status: response.status, code: bodyOf(response).error.code }).toEqual({ status, code });
        expect(bodyOf(response).error.message).toBe('The request could not be processed.');
        expect(response.text).not.toMatch(LEAK);
      },
    );

    it.each([
      ['exactly 100 URL-encoded parameters', form(100)],
      ['URL-encoded nesting exactly 5 deep', nested(5)],
    ])('lets %s through the parser to the validation of the route', async (_name, body) => {
      const response = await post({ 'content-type': 'application/x-www-form-urlencoded' }, body);

      expect({ status: response.status, code: bodyOf(response).error.code }).toEqual({
        status: 422,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  it('fails closed when a response violates its Zod wire schema', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/contract-probe/invalid-response')
      .expect(500)
      .expect((response) => {
        expect(bodyOf(response)).toMatchObject({
          success: false,
          error: { code: 'INTERNAL_SERVER_ERROR' },
        });
        expect(JSON.stringify(bodyOf(response))).not.toContain('not-a-boolean');
      });
  });

  it('rejects a token signed with a different key without touching the database', () => {
    const forged = `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwic2lkIjoieSJ9.${Buffer.from('not-the-signature').toString('base64url')}`;

    return request(app!.getHttpServer())
      .get('/api/v1/protected-probe')
      .set('authorization', `Bearer ${forged}`)
      .expect(401)
      .expect((response) => {
        expect(bodyOf(response)).toMatchObject({ success: false, error: { code: 'INVALID_ACCESS_TOKEN' } });
      });
  });

  it('requires a Bearer token on /me', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/me')
      .expect(401)
      .expect((response) => {
        expect(bodyOf(response)).toMatchObject({ success: false, error: { code: 'AUTHENTICATION_REQUIRED' } });
      });
  });

  it('rejects unknown fields and oversize values on login with 422 before any lookup', async () => {
    await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.vn', password: 'x', role: 'SUPER_ADMIN' })
      .expect(422)
      .expect((response) => {
        expect(bodyOf(response)).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
      });
    await request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.vn', password: 'p'.repeat(257) })
      .expect(422);
  });

  it('answers a coded 409 with details and no internal fields', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/contract-probe/conflict')
      .expect(409)
      .expect((response) => {
        expect(bodyOf(response)).toMatchObject({
          success: false,
          error: { code: 'CONTRACT_PROBE.CONFLICT', details: { field: 'name' } },
        });
        expect(Object.keys(bodyOf(response).error).sort()).toEqual(['code', 'details', 'message', 'requestId']);
      });
  });

  it('fails closed with 500 when a route declares no access rule, even without a token', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/undeclared-probe')
      .expect(500)
      .expect((response) => {
        expect(bodyOf(response)).toMatchObject({ success: false, error: { code: 'INTERNAL_SERVER_ERROR' } });
        expect(JSON.stringify(bodyOf(response))).not.toContain('reachable');
      });
  });

  it('enforces @RequireRoles: 403 for the wrong role, 200 for the right one', async () => {
    // One application for the three cases (P28-13): the verifier answers by token, so each request carries its roles;
    // compiling the whole AppModule once per case made the test outlast its timeout on a loaded machine.
    const rolesByToken: Record<string, string[]> = { employee: ['EMPLOYEE'], none: [], 'it-admin': ['IT_ADMIN'] };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RoleProbeController],
    })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue({ verify: jest.fn((token: string) => Promise.resolve(principalWithRoles(...rolesByToken[token]))) })
      .compile();
    const roleApp: INestApplication<App> = moduleFixture.createNestApplication();
    configureApplication(roleApp);
    await roleApp.init();

    try {
      for (const [token, status] of [
        ['employee', 403],
        ['none', 403],
        ['it-admin', 200],
      ] as const) {
        const response = await request(roleApp.getHttpServer())
          .get('/api/v1/role-probe')
          .set('authorization', `Bearer ${token}`)
          .expect(status);
        if (status === 403) {
          expect(bodyOf(response)).toMatchObject({ success: false, error: { code: 'AUTHORIZATION.FORBIDDEN' } });
        }
      }
    } finally {
      await roleApp.close();
    }
  });

  it('AUTH.1: accepts the Bearer scheme in any case and hands the exact token to the verifier; refuses the rest', async () => {
    const verify = jest.fn().mockResolvedValue(principalWithRoles());
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedProbeController],
    })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue({ verify })
      .compile();
    const caseApp: INestApplication<App> = moduleFixture.createNestApplication();
    configureApplication(caseApp);
    await caseApp.init();

    try {
      for (const header of ['Bearer Good.Token', 'bearer Good.Token', 'BEARER Good.Token', 'bEaReR Good.Token']) {
        verify.mockClear();
        await request(caseApp.getHttpServer()).get('/api/v1/protected-probe').set('authorization', header).expect(200);
        expect({ header, tokens: verify.mock.calls.map(([token]: unknown[]) => token) }).toEqual({
          header,
          tokens: ['Good.Token'],
        });
      }
      for (const header of ['Basic Good.Token', 'Bearer', 'Bearer  Good.Token', 'Bearer Good Token', 'Bearer\tGood']) {
        verify.mockClear();
        const response = await request(caseApp.getHttpServer())
          .get('/api/v1/protected-probe')
          .set('authorization', header)
          .expect(401);
        expect({ header, code: bodyOf(response).error.code, verified: verify.mock.calls.length }).toEqual({
          header,
          code: 'AUTHENTICATION_REQUIRED',
          verified: 0,
        });
      }
    } finally {
      await caseApp.close();
    }
  });

  it('answers 503 without describing the infrastructure when the authentication service is unreachable', async () => {
    // The token here is fine. Only the authentication service is unreachable, so the caller must be
    // told to retry rather than to sign in again — and must learn nothing about why.
    const outage = new TokenVerificationUnavailableError(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:8443'), { code: 'ECONNREFUSED' }),
    );
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedProbeController],
    })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue({ verify: jest.fn().mockRejectedValue(outage) })
      .compile();

    const unavailableApp: INestApplication<App> = moduleFixture.createNestApplication();
    configureApplication(unavailableApp);
    await unavailableApp.init();

    try {
      await request(unavailableApp.getHttpServer())
        .get('/api/v1/protected-probe')
        .set('authorization', 'Bearer good-token')
        .expect(503)
        .expect((response) => {
          expect(bodyOf(response)).toMatchObject({
            success: false,
            error: { code: 'TOKEN_VERIFICATION_UNAVAILABLE' },
          });
          const wire = JSON.stringify(bodyOf(response));
          expect(wire).not.toContain('10.0.0.5');
          expect(wire).not.toContain('ECONNREFUSED');
        });
    } finally {
      await unavailableApp.close();
    }
  });

  it('documents the actual success and error wire envelopes in OpenAPI', () => {
    const document = createOpenApiDocument(app!);
    const operation = document.paths['/api/v1/health/live']?.get;
    const schemas = document.components?.schemas as Record<string, unknown>;

    expect(operation?.responses?.['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/HealthResponseDto' },
        },
      },
    });
    expect(operation?.responses?.['500']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorEnvelopeDto' },
        },
      },
    });
    expect(schemas.HealthResponseDto).toMatchObject({
      required: ['success', 'message', 'data'],
      properties: {
        success: { enum: [true] },
        message: { type: 'string' },
        data: {
          type: 'object',
          nullable: true,
          required: ['status'],
        },
      },
    });
    expect(schemas.ErrorEnvelopeDto).toMatchObject({
      required: ['success', 'error'],
      properties: {
        // OpenAPI 3.0 has no `const`: the single allowed value is a one-value enum (H2a).
        success: { type: 'boolean', enum: [false] },
        error: {
          required: ['code', 'message', 'requestId'],
        },
      },
    });
  });
});

describe('Global guard order (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  /**
   * Rate limiting must reject a flood before token verification runs, so an
   * unauthenticated caller cannot drive expensive verification work per request.
   *
   * If AuthenticationGuard were registered first, every request would short-circuit
   * with 401 and the throttler would never count any of them, so the request after
   * the limit would still be 401 rather than 429. That is what makes this assertion
   * pin the ordering rather than merely observe it.
   */
  it('rate limits an unauthenticated flood before verifying tokens', async () => {
    const server = app!.getHttpServer();
    const limit = app!.get(ConfigService<EnvironmentVariables, true>).get('RATE_LIMIT_LIMIT', { infer: true });

    for (let attempt = 0; attempt < limit; attempt += 1) {
      await request(server).get('/api/v1/protected-probe').expect(401);
    }

    await request(server)
      .get('/api/v1/protected-probe')
      .expect(429)
      .expect((response) => {
        expect(bodyOf(response)).toMatchObject({
          success: false,
          error: { code: 'HTTP_TOO_MANY_REQUESTS' },
        });
      });
  }, 60_000);
});

describe('a request whose client leaves before its body is read (P29-N4)', () => {
  let app: INestApplication<App> | undefined;

  afterEach(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  it('is classified without a write to the closed socket or an unexpected-error log, and the next request is served', async () => {
    type Seen = { type: unknown; writes: number; unexpected: number };
    let settle!: (seen: Seen) => void;
    const caught = new Promise<Seen>((resolve) => (settle = resolve));
    // Read without binding: the spy below calls it with the filter Nest built as `this`.
    const original = Reflect.get(HttpExceptionFilter.prototype, 'catch');
    // Spied before the application binds its filter, so the very filter instance Nest calls is observed.
    jest.spyOn(HttpExceptionFilter.prototype, 'catch').mockImplementation(function (
      this: HttpExceptionFilter,
      exception: unknown,
      host: ArgumentsHost,
    ) {
      const response = host.switchToHttp().getResponse<Response>();
      const writes = [jest.spyOn(response, 'setHeader'), jest.spyOn(response, 'status'), jest.spyOn(response, 'json')];
      const unexpected = jest.spyOn(this['logger'], 'error');
      original.call(this, exception, host);
      settle({
        type: (exception as { type?: unknown }).type,
        writes: writes.reduce((total, spy) => total + spy.mock.calls.length, 0),
        unexpected: unexpected.mock.calls.length,
      });
    });
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      configureApplication(app, { mountDocs: false });
      await app.listen(0, '127.0.0.1');
      const server = app.getHttpServer() as Server;
      const { port } = server.address() as AddressInfo;

      // The client leaves once the server has the headers and is reading the body: an order, never a sleep.
      const socket = connect(port, '127.0.0.1');
      server.once('request', () => socket.destroy());
      socket.write(
        'POST /api/v1/auth/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n' +
          'Content-Length: 100\r\n\r\n{"email":',
      );

      expect(await caught).toEqual({ type: 'request.aborted', writes: 0, unexpected: 0 });
      await request(server).get('/api/v1/health/live').expect(200);
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  }, 30_000);
});
