import { Body, Controller, Get, HttpStatus, INestApplication, Module, Param, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createOpenApiDocument } from '../../../bootstrap';
import { successEnvelopeSchema } from '../dto/success-envelope.dto';
import { EXAMPLE_REQUEST_ID } from '../openapi-error-examples';
import { ApiErrorResponses, VALIDATION_EXAMPLE } from './api-error-responses.decorator';
import {
  ApiSuccessResponse,
  DEFAULT_SUCCESS_MESSAGE,
  SUCCESS_MESSAGE_METADATA,
} from './api-success-response.decorator';

class ThingResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ id: z.uuid() }))) {}
class ThingIdParamDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}
class ThingBodyDto extends createZodDto(z.strictObject({ name: z.string() })) {}

const NOT_FOUND = { code: 'THING.NOT_FOUND', message: 'The thing does not exist.' };

@Controller('things')
class ThingsController {
  @Get(':id')
  @ApiSuccessResponse(ThingResponseDto, { message: 'THING.FETCHED', description: 'The thing.' })
  @ApiErrorResponses(
    { status: HttpStatus.NOT_FOUND, description: 'No such thing.', examples: [NOT_FOUND] },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Invalid id.', examples: [VALIDATION_EXAMPLE] },
  )
  get(@Param() params: ThingIdParamDto) {
    return params;
  }

  @Post()
  @ApiSuccessResponse(ThingResponseDto, { status: HttpStatus.CREATED, message: 'THING.CREATED' })
  create(@Body() body: ThingBodyDto) {
    return body;
  }

  @Get()
  @ApiSuccessResponse(ThingResponseDto)
  probe() {
    return null;
  }
}

@Module({ controllers: [ThingsController] })
class ThingsModule {}

type MediaType = { schema?: unknown; examples?: Record<string, { summary: string; value: unknown }> };
type Response = { description?: string; content?: Record<string, MediaType> };

describe('response examples in the OpenAPI document', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const response = (path: string, method: 'get' | 'post', status: string): Response =>
    (document.paths[path][method]?.responses as Record<string, Response>)[status];

  beforeAll(async () => {
    app = await NestFactory.create(ThingsModule, { logger: false });
    document = createOpenApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('success', () => {
    it.each([
      ['/things/{id}', 'get', '200', 'THING.FETCHED'],
      ['/things', 'post', '201', 'THING.CREATED'],
    ] as const)(
      '%s %s shows the message its decorator declares and keeps the DTO schema',
      (path, method, status, message) => {
        expect(response(path, method, status).content?.['application/json']?.schema).toEqual({
          allOf: [{ $ref: '#/components/schemas/ThingResponseDto' }, { properties: { message: { example: message } } }],
        });
      },
    );

    it('shows the same value the interceptor answers with, including the fallback', () => {
      const declared = (handler: keyof ThingsController) =>
        Reflect.getMetadata(
          SUCCESS_MESSAGE_METADATA,
          Object.getOwnPropertyDescriptor(ThingsController.prototype, handler)?.value as object,
        ) as string;
      const shown = (path: string, method: 'get' | 'post', status: string) =>
        (
          response(path, method, status).content?.['application/json']?.schema as {
            allOf: [unknown, { properties: { message: { example: string } } }];
          }
        ).allOf[1].properties.message.example;

      expect(shown('/things/{id}', 'get', '200')).toBe(declared('get'));
      expect(shown('/things', 'post', '201')).toBe(declared('create'));
      expect(shown('/things', 'get', '200')).toBe(DEFAULT_SUCCESS_MESSAGE);
      expect(declared('probe')).toBe(DEFAULT_SUCCESS_MESSAGE);
    });

    it('still registers the response DTO as a component', () => {
      expect(document.components?.schemas?.ThingResponseDto).toBeDefined();
    });
  });

  describe('errors', () => {
    it('shows the declared examples by code, on the unchanged error envelope schema', () => {
      expect(response('/things/{id}', 'get', '404').content?.['application/json']).toEqual({
        schema: { $ref: '#/components/schemas/ErrorEnvelopeDto' },
        examples: {
          'THING.NOT_FOUND': {
            summary: NOT_FOUND.message,
            value: { success: false, error: { ...NOT_FOUND, requestId: EXAMPLE_REQUEST_ID } },
          },
        },
      });
    });

    it('shows a validation failure with the shape of its details', () => {
      expect(response('/things/{id}', 'get', '422').content?.['application/json']?.examples).toEqual({
        VALIDATION_ERROR: {
          summary: 'Request validation failed.',
          value: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed.',
              details: { issues: [{ code: 'invalid_type', path: '<field>' }] },
              requestId: EXAMPLE_REQUEST_ID,
            },
          },
        },
      });
    });

    it.each([
      ['/things/{id}', 'get', '429', 'HTTP_TOO_MANY_REQUESTS'],
      ['/things', 'post', '400', 'HTTP_BAD_REQUEST'],
      ['/things', 'post', '413', 'HTTP_PAYLOAD_TOO_LARGE'],
      ['/things', 'post', '415', 'HTTP_UNSUPPORTED_MEDIA_TYPE'],
    ] as const)('the global %s %s %s shows %s with the filter’s message', (path, method, status, code) => {
      expect(response(path, method, status).content?.['application/json']?.examples).toEqual({
        [code]: {
          summary: 'The request could not be processed.',
          value: {
            success: false,
            error: { code, message: 'The request could not be processed.', requestId: EXAMPLE_REQUEST_ID },
          },
        },
      });
    });
  });
});
