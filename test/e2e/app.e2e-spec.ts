import { Body, Controller, Get, HttpStatus, INestApplication, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
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
        message: 'COMMON.SUCCESS',
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
        expect(bodyOf(response)).toEqual({ success: true, message: 'COMMON.SUCCESS', data: { status: 'ok' } });
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
    for (const [roles, status] of [
      [['EMPLOYEE'], 403],
      [[], 403],
      [['IT_ADMIN'], 200],
    ] as const) {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
        controllers: [RoleProbeController],
      })
        .overrideProvider(ACCESS_TOKEN_VERIFIER)
        .useValue({ verify: jest.fn().mockResolvedValue(principalWithRoles(...roles)) })
        .compile();
      const roleApp: INestApplication<App> = moduleFixture.createNestApplication();
      configureApplication(roleApp);
      await roleApp.init();

      try {
        const response = await request(roleApp.getHttpServer())
          .get('/api/v1/role-probe')
          .set('authorization', 'Bearer any')
          .expect(status);
        if (status === 403) {
          expect(bodyOf(response)).toMatchObject({ success: false, error: { code: 'AUTHORIZATION.FORBIDDEN' } });
        }
      } finally {
        await roleApp.close();
      }
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
        success: { type: 'boolean', const: false },
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
