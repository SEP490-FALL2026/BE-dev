import { Test, TestingModule } from '@nestjs/testing';
import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AppModule } from './../src/app.module';
import { configureApplication, createOpenApiDocument } from './../src/bootstrap';
import { ApiSuccessResponse } from './../src/infrastructure/http/decorators/api-success-response.decorator';
import { successEnvelopeSchema } from './../src/infrastructure/http/dto/success-envelope.dto';
import { Public } from './../src/infrastructure/security/decorators/public.decorator';

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
  @ApiSuccessResponse(ContractProbeResponseDto, { status: 201 })
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
}

@Controller({ path: 'protected-probe', version: '1' })
class ProtectedProbeController {
  @Get()
  getProbe(): { status: 'protected' } {
    return { status: 'protected' };
  }
}

describe('Application foundation (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedProbeController, ContractProbeController],
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
        expect(response.body).toMatchObject({
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
        const body = response.body as {
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

  it('accepts only a safe caller-provided request ID', async () => {
    await request(app!.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('x-request-id', 'web-01J_SAFE.request')
      .expect(404)
      .expect('x-request-id', 'web-01J_SAFE.request');

    const response = await request(app!.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('x-request-id', 'unsafe request id')
      .expect(404);

    expect(response.headers['x-request-id']).not.toBe('unsafe request id');
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
        expect(response.body).toMatchObject({
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
        expect(response.body).toMatchObject({
          success: false,
          error: { code: 'HTTP_INTERNAL_SERVER_ERROR' },
        });
        expect(JSON.stringify(response.body)).not.toContain('not-a-boolean');
      });
  });

  it('returns a stable code for an invalid access token', () => {
    return request(app!.getHttpServer())
      .get('/api/v1/protected-probe')
      .set('authorization', 'Bearer malformed-token')
      .expect(401)
      .expect((response) => {
        expect(response.body).toMatchObject({
          success: false,
          error: { code: 'INVALID_ACCESS_TOKEN' },
        });
      });
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
