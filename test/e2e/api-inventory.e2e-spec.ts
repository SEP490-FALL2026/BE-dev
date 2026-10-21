import { INestApplication } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import request from 'supertest';
import { z } from 'zod';
import { App } from 'supertest/types';
import { Test } from '@nestjs/testing';
import { DECORATORS } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../../src/app.module';
import { configureApplication, createOpenApiDocument } from '../../src/bootstrap';
import {
  DEFAULT_SUCCESS_MESSAGE,
  SUCCESS_MESSAGE_METADATA,
} from '../../src/infrastructure/http/decorators/api-success-response.decorator';
import {
  IS_AUTHENTICATED_ONLY_METADATA,
  REQUIRED_ROLES_METADATA,
} from '../../src/infrastructure/security/decorators/access.decorators';
import { IS_PUBLIC_METADATA } from '../../src/infrastructure/security/decorators/public.decorator';
import { API_COVERAGE_MANIFEST } from '../support/api-coverage-manifest';

/** The only routes anyone may call without signing in. Adding to this list is a security decision. */
const PUBLIC_ALLOWLIST = [
  'AuthController.login',
  'AuthController.logout',
  'AuthController.redeemInvitation',
  'AuthController.refresh',
  'AuthController.requestPasswordReset',
  'AuthController.resetPassword',
  'HealthController.getLiveness',
  'HealthController.getReadiness',
];

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** The one bearer scheme the document registers (`DocumentBuilder.addBearerAuth()`). */
const BEARER_REQUIREMENT = [{ bearer: [] }];

/** Internal requirement and decision codes belong in specs, not in the public API description. */
const INTERNAL_CODE = /\b(?:US|AC|FR|OQ|R|N|T)-\d|QĐ-|⟹/;

/** Visits every object node of the document with its JSON pointer, so a failure names the exact place. */
/**
 * CP0-09: the exact patterns the schema generator (zod) emits next to `format: uuid` and `format: date-time`, written out
 * as literals so the test does not ask the cleanup code what "redundant" means.
 */
const GENERATED_UUID_PATTERN =
  '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
const GENERATED_DATE_TIME_PATTERN = String.raw`^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$`;
const GENERATED_DATE_TIME_WITH_OFFSET_PATTERN = String.raw`^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$`;
/** The business rules the document keeps: codes, message keys and identifiers (written out, not derived). */
const BUSINESS_PATTERNS = [
  '^[A-Z][A-Z0-9_]{0,99}$',
  String.raw`^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$`,
  String.raw`^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)*$`,
  '^[A-Za-z0-9][A-Za-z0-9._-]*$',
  // An ISO 4217 currency code (finance).
  '^[A-Z]{3}$',
];

function visit(node: unknown, at: string, onNode: (value: Record<string, unknown>, at: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => visit(child, `${at}/${index}`, onNode));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const value = node as Record<string, unknown>;
  onNode(value, at);
  for (const [key, child] of Object.entries(value)) visit(child, `${at}/${key}`, onNode);
}

describe('API inventory (e2e)', () => {
  let app: INestApplication<App>;
  let operations: {
    key: string;
    operationId: string | undefined;
    summary: string | undefined;
    security: unknown;
    responses: Record<string, { description?: string; content?: Record<string, { schema?: unknown }> }>;
  }[];
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, { mountDocs: false });
    await app.init();

    document = createOpenApiDocument(app);
    operations = Object.entries(document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.flatMap((method) => {
        const operation = item[method];
        return operation
          ? [
              {
                key: `${method.toUpperCase()} ${path}`,
                operationId: operation.operationId,
                summary: operation.summary,
                security: operation.security,
                responses: operation.responses as Record<
                  string,
                  { description?: string; content?: Record<string, { schema?: unknown }> }
                >,
              },
            ]
          : [];
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('the operations exported in OpenAPI are exactly the operations in the coverage manifest', () => {
    const exported = operations.map((operation) => operation.key).sort();
    const manifest = [...API_COVERAGE_MANIFEST].sort();

    // Set equality, never a count: an operation added without a manifest entry, or a manifest
    // entry whose operation was removed, must each fail here.
    expect(exported).toEqual(manifest);
  });

  it('every exported operation has a unique operationId', () => {
    const ids = operations.map((operation) => operation.operationId);

    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(['invitations', 'lock', 'unlock'])(
    'documents 422 VALIDATION_ERROR for an invalid UUID on POST /app-users/{id}/%s',
    (action) => {
      const operation = document.paths[`/api/v1/app-users/{id}/${action}`]?.post;
      const response = operation?.responses['422'];
      if (!response || '$ref' in response) throw new Error('Expected an explicit 422 response');
      expect(response.description).toContain('VALIDATION_ERROR');
      expect(response.content?.['application/json']?.schema).toEqual({
        $ref: '#/components/schemas/ErrorEnvelopeDto',
      });
    },
  );

  it('requires the same reason body on lock and unlock, shown with a placeholder example', () => {
    for (const action of ['lock', 'unlock']) {
      const operation = document.paths[`/api/v1/app-users/{id}/${action}`]?.post;
      const refused = operation?.responses['422'];
      if (!refused || '$ref' in refused) throw new Error(`Expected an explicit 422 response on ${action}`);

      expect(operation?.requestBody).toEqual({
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/AccountStatusChangeBodyDto' } } },
      });
      expect(refused.description).toMatch(/reason/i);
    }
    expect(document.components?.schemas?.AccountStatusChangeBodyDto).toEqual({
      type: 'object',
      properties: {
        reason: { type: 'string', minLength: 1, maxLength: 1000, example: '<reason-or-authority-reference>' },
      },
      required: ['reason'],
      additionalProperties: false,
    });
  });

  interface RouteHandler {
    name: string;
    target: object;
    controller: object;
    declarations: string[];
    operationId: string | undefined;
  }

  function routeHandlers(): RouteHandler[] {
    const reflector = app.get(Reflector);
    const handlers: RouteHandler[] = [];

    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype as (new () => object) | null;
        if (!controller?.prototype) continue;

        for (const method of Object.getOwnPropertyNames(controller.prototype)) {
          const handler = (controller.prototype as Record<string, unknown>)[method];
          if (typeof handler !== 'function' || reflector.get(METHOD_METADATA, handler) === undefined) continue;

          const kinds: Array<[symbol, string]> = [
            [IS_PUBLIC_METADATA, 'public'],
            [IS_AUTHENTICATED_ONLY_METADATA, 'authenticated'],
            [REQUIRED_ROLES_METADATA, 'roles'],
          ];
          const own = kinds.filter(([key]) => reflector.get(key, handler) !== undefined).map(([, kind]) => kind);
          const onClass = kinds.filter(([key]) => reflector.get(key, controller) !== undefined).map(([, kind]) => kind);

          handlers.push({
            name: `${controller.name}.${method}`,
            target: handler,
            controller,
            declarations: own.length > 0 ? own : onClass,
            operationId: reflector.get<{ operationId?: string } | undefined>(DECORATORS.API_OPERATION, handler)
              ?.operationId,
          });
        }
      }
    }

    return handlers;
  }

  it('every route handler declares exactly one access rule', () => {
    const handlers = routeHandlers();

    expect(handlers.length).toBeGreaterThan(0);
    expect(handlers.filter((handler) => handler.declarations.length !== 1).map((handler) => handler.name)).toEqual([]);
  });

  it('the public routes are exactly the allowlist (no registration route exists)', () => {
    const publicRoutes = routeHandlers()
      .filter((handler) => handler.declarations[0] === 'public')
      .map((handler) => handler.name)
      .sort();

    expect(publicRoutes).toEqual([...PUBLIC_ALLOWLIST].sort());
    expect([...API_COVERAGE_MANIFEST].filter((key) => /register|signup|sign-up/i.test(key))).toEqual([]);
  });

  describe('OpenAPI presentation (H2a)', () => {
    /** Effective access of each operation, read from the same metadata the guards read. */
    function accessByOperation(): Map<string, string> {
      const access = new Map<string, string>();
      for (const handler of routeHandlers()) {
        if (handler.operationId) access.set(handler.operationId, handler.declarations[0]);
      }
      return access;
    }

    it('registers exactly one bearer scheme and no document-wide requirement', () => {
      expect(document.components?.securitySchemes).toEqual({
        bearer: { scheme: 'bearer', bearerFormat: 'JWT', type: 'http' },
      });
      expect((document as { security?: unknown }).security).toBeUndefined();
    });

    it('every operation maps to one handler, and its security matches the access the guard enforces', () => {
      const access = accessByOperation();
      const mismatches = operations.flatMap((operation) => {
        const declared = access.get(operation.operationId ?? '');
        if (declared === undefined) return [`${operation.key}: no handler`];
        const expected = declared === 'public' ? undefined : BEARER_REQUIREMENT;
        return JSON.stringify(operation.security) === JSON.stringify(expected)
          ? []
          : [`${operation.key} (${declared}): security ${JSON.stringify(operation.security)}`];
      });

      expect(mismatches).toEqual([]);
    });

    it('every operation has a short summary of its own, not its operationId split into words', () => {
      const words = (id: string) => id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      const problems = operations.flatMap((operation) => {
        const summary = operation.summary?.trim() ?? '';
        if (summary === '') return [`${operation.key}: no summary`];
        if (summary.length > 70) return [`${operation.key}: summary longer than 70 characters`];
        if (summary.toLowerCase() === words(operation.operationId ?? ''))
          return [`${operation.key}: summary = operationId`];
        return [];
      });
      const summaries = operations.map((operation) => operation.summary?.trim());

      expect(problems).toEqual([]);
      expect(new Set(summaries).size).toBe(summaries.length);
    });

    it('the schema generator still emits exactly these uuid and date-time patterns (an upgrade alarm)', () => {
      // If zod changes them, this fails first: the cleanup and the expectations below must then be reviewed together.
      for (const [schema, expected] of [
        [z.uuid(), GENERATED_UUID_PATTERN],
        [z.iso.datetime(), GENERATED_DATE_TIME_PATTERN],
        [z.iso.datetime({ offset: true }), GENERATED_DATE_TIME_WITH_OFFSET_PATTERN],
      ] as const) {
        expect((z.toJSONSchema(schema) as { pattern: string }).pattern).toBe(expected);
      }
    });

    it('uses OpenAPI 3.0 keywords only and no pattern that just repeats a uuid or date-time format', () => {
      // CP0-09: the expectation is independent of the cleanup code: literal generator patterns, counted directly.
      const problems: string[] = [];
      const patterns = new Set<string>();
      let formatted = 0;
      visit(document, '#', (node, at) => {
        if ('const' in node && typeof node.type === 'string') problems.push(`${at}: const`);
        if (typeof node.pattern === 'string') patterns.add(node.pattern);
        if (node.format === 'uuid' || node.format === 'date-time') {
          formatted += 1;
          if ('pattern' in node) problems.push(`${at}: pattern next to format ${String(node.format)}`);
        }
      });

      expect(problems).toEqual([]);
      expect(formatted).toBeGreaterThan(0);
      for (const generated of [
        GENERATED_UUID_PATTERN,
        GENERATED_DATE_TIME_PATTERN,
        GENERATED_DATE_TIME_WITH_OFFSET_PATTERN,
      ]) {
        expect(patterns.has(generated)).toBe(false);
      }
      // Business patterns stay, exactly these.
      expect([...patterns].sort()).toEqual([...BUSINESS_PATTERNS].sort());
    });

    it('shows credentials as short placeholders and never a token-like or secret-like example', () => {
      const examples: Array<{ at: string; value: unknown }> = [];
      visit(document, '#', (node, at) => {
        if ('example' in node) examples.push({ at, value: node.example });
      });
      const exampleAt = (suffix: string) => examples.find((example) => example.at.endsWith(suffix))?.value;
      const session = '/components/schemas/SessionTokenResponseDto/properties/data/properties';

      expect(exampleAt(`${session}/accessToken`)).toBe('<access-token>');
      expect(exampleAt(`${session}/refreshToken`)).toBe('<refresh-token>');
      expect(exampleAt('/components/schemas/RefreshTokenBodyDto/properties/refreshToken')).toBe('<refresh-token>');
      expect(exampleAt('/components/schemas/LoginBodyDto/properties/password')).toBe('<password>');
      const risky = examples.filter(({ value }) => {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        return /eyJ[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{32,}|secret/i.test(text);
      });
      expect(risky).toEqual([]);
    });

    it('describes the guard answers of protected operations once, without internal codes', () => {
      const access = accessByOperation();
      const protectedOperations = operations.filter(
        (operation) => access.get(operation.operationId ?? '') !== 'public',
      );
      const descriptionsOf = (status: string) =>
        new Set(protectedOperations.map((operation) => operation.responses[status]?.description));
      const leaks: string[] = [];
      visit(document, '#', (node, at) => {
        if (typeof node.description === 'string' && INTERNAL_CODE.test(node.description)) leaks.push(at);
      });

      expect(descriptionsOf('401').size).toBe(1);
      expect(descriptionsOf('503').size).toBe(1);
      expect(leaks).toEqual([]);
    });
  });

  describe('wire messages and declared responses (H2b)', () => {
    const ERROR_ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelopeDto' };
    const errorSchemaOf = (response: { content?: Record<string, { schema?: unknown }> } | undefined) =>
      response?.content?.['application/json']?.schema;
    /** Operations that read no path, query or body input, so no request can fail validation. */
    const WITHOUT_VALIDATION = [
      'approvalRoleList',
      'currencyList',
      'departmentWarningList',
      'healthGetLiveness',
      'healthGetReadiness',
      'meGet',
      'onboardingChecklistGet',
      'operatingParameterList',
      'reportingCurrencyGet',
      'seatBaselineClose',
      'seatBaselineGet',
      'standardToolsetMine',
    ];
    const NEW_422 = [
      'costCenterList',
      'employeeImportCancel',
      'employeeImportGet',
      'employeeImportPreviewRefresh',
      'employeeImportRowList',
    ];

    it('no mounted handler falls back to COMMON.SUCCESS, and the four named operations have their own message', () => {
      const reflector = app.get(Reflector);
      const messages = new Map(
        routeHandlers().map((handler) => [
          handler.operationId,
          reflector.get<string | undefined>(SUCCESS_MESSAGE_METADATA, handler.target as () => unknown),
        ]),
      );
      const fallbacks = [...messages].filter(([, message]) => message === DEFAULT_SUCCESS_MESSAGE).map(([id]) => id);

      expect(fallbacks).toEqual([]);
      expect({
        appUserList: messages.get('appUserList'),
        appUserGet: messages.get('appUserGet'),
        healthGetLiveness: messages.get('healthGetLiveness'),
        healthGetReadiness: messages.get('healthGetReadiness'),
      }).toEqual({
        appUserList: 'APP_USER.LISTED',
        appUserGet: 'APP_USER.RETRIEVED',
        healthGetLiveness: 'HEALTH.LIVENESS_CHECKED',
        healthGetReadiness: 'HEALTH.READINESS_CHECKED',
      });
    });

    it('declares 422 VALIDATION_ERROR on every operation with input, including the five that lacked it', () => {
      const without = operations
        .filter((operation) => !operation.responses['422'])
        .map((operation) => operation.operationId)
        .sort();
      const broken = operations
        .filter((operation) => NEW_422.includes(operation.operationId ?? ''))
        .filter(
          (operation) =>
            JSON.stringify(errorSchemaOf(operation.responses['422'])) !== JSON.stringify(ERROR_ENVELOPE) ||
            !operation.responses['422']?.description?.includes('VALIDATION_ERROR'),
        )
        .map((operation) => operation.key);

      expect(without).toEqual(WITHOUT_VALIDATION);
      expect(broken).toEqual([]);
    });

    it('declares the global rate limit (429 HTTP_TOO_MANY_REQUESTS) on all operations, public and protected', () => {
      const missing = operations
        .filter((operation) => {
          const response = operation.responses['429'];
          return (
            JSON.stringify(errorSchemaOf(response)) !== JSON.stringify(ERROR_ENVELOPE) ||
            !response?.description?.includes('HTTP_TOO_MANY_REQUESTS')
          );
        })
        .map((operation) => operation.key);

      expect(operations).toHaveLength(143);
      expect(missing).toEqual([]);
    });

    it('keeps the account lockout branch next to the global limit where both can answer 429', () => {
      const description = (id: string) =>
        operations.find((operation) => operation.operationId === id)?.responses['429']?.description ?? '';

      for (const id of ['authLogin', 'meChangePassword']) {
        expect(description(id)).toContain('AUTH.LOGIN_TEMPORARILY_BLOCKED');
        expect(description(id)).toContain('HTTP_TOO_MANY_REQUESTS');
      }
      for (const id of ['authRequestPasswordReset', 'authResetPassword']) {
        expect(description(id)).toContain('HTTP_TOO_MANY_REQUESTS');
        expect(description(id)).not.toContain('AUTH.LOGIN_TEMPORARILY_BLOCKED');
      }
    });

    it('no mounted route opts out of the global throttler, so the 429 above is true everywhere', () => {
      const skips = (target: object) =>
        Reflect.getMetadataKeys(target).some(
          (key) => typeof key === 'string' && key.startsWith('THROTTLER:SKIP') && Reflect.getMetadata(key, target),
        );

      expect(routeHandlers().filter((handler) => skips(handler.target) || skips(handler.controller))).toEqual([]);
    });

    it('keeps the guard and unavailable codes the client already handles (Q8)', () => {
      const guard503 = operations.find((operation) => operation.operationId === 'meGet')?.responses['503'];
      const login503 = operations.find((operation) => operation.operationId === 'authLogin')?.responses['503'];

      expect(guard503?.description).toContain('TOKEN_VERIFICATION_UNAVAILABLE');
      expect(guard503?.description).toContain('SERVICE_UNAVAILABLE');
      expect(login503?.description).not.toContain('TOKEN_VERIFICATION_UNAVAILABLE');
    });
  });

  it('the removed catalog sample serves no route', async () => {
    for (const path of [
      '/api/v1/catalog-applications',
      '/api/v1/catalog-applications/4f24d10d-63ad-49b1-a7a1-c988765990ae',
    ]) {
      await request(app.getHttpServer()).get(path).expect(404);
    }
    await request(app.getHttpServer()).post('/api/v1/catalog-applications').send({}).expect(404);
  });
});
