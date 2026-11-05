import { Reflector } from '@nestjs/core';
import { z } from 'zod';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  DEFAULT_SUCCESS_MESSAGE,
  SUCCESS_MESSAGE_METADATA,
} from '../../../src/infrastructure/http/decorators/api-success-response.decorator';
import { findOpenApi30Violations } from '../../../src/infrastructure/http/openapi-dialect';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { createHttpContractApp } from '../../support/http-contract-app';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';
import {
  BEARER_REQUIREMENT,
  BUSINESS_PATTERNS,
  GENERATED_DATE_TIME_PATTERN,
  GENERATED_DATE_TIME_WITH_OFFSET_PATTERN,
  GENERATED_UUID_PATTERN,
  INTERNAL_CODE,
  operationsOf,
  routeHandlersOf,
  type InventoryOperation,
  visit,
} from '../../support/openapi-inventory';

/** OpenAPI presentation and wire messages */
describe('API inventory (e2e): openapi presentation and wire messages', () => {
  let app: INestApplication<App>;
  let operations: InventoryOperation[];
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createHttpContractApp();

    document = createOpenApiDocument(app);
    operations = operationsOf(document);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app.close();
  });

  describe('OpenAPI presentation (H2a)', () => {
    /** Effective access of each operation, read from the same metadata the guards read. */
    function accessByOperation(): Map<string, string> {
      const access = new Map<string, string>();
      for (const handler of routeHandlersOf(app)) {
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
      // OPENAPI-EXAMPLE.1-F3: every keyword and shape, not only `const` (type arrays, propertyNames, numeric bounds…).
      expect(findOpenApi30Violations(document)).toEqual([]);
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
      'aiAccessRequestSummarySource',
      'currencyList',
      'employeeDashboardGet',
      'healthGetLiveness',
      'healthGetReadiness',
      'itAdminDashboardGet',
      'managerDashboardGet',
      'meDepartureNoticeGet',
      'meGet',
      'notificationMarkAllRead',
      'notificationUnreadCount',
      'onboardingChecklistGet',
      'operatingParameterList',
      'reportingCurrencyGet',
      'seatBaselineClose',
      'seatBaselineGet',
      'superAdminDashboardGet',
      'superAdminWatchGet',
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
        routeHandlersOf(app).map((handler) => [
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

      expect(operations).toHaveLength(316);
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

      expect(routeHandlersOf(app).filter((handler) => skips(handler.target) || skips(handler.controller))).toEqual([]);
    });

    it('keeps the guard and unavailable codes the client already handles (Q8)', () => {
      const guard503 = operations.find((operation) => operation.operationId === 'meGet')?.responses['503'];
      const login503 = operations.find((operation) => operation.operationId === 'authLogin')?.responses['503'];

      expect(guard503?.description).toContain('TOKEN_VERIFICATION_UNAVAILABLE');
      expect(guard503?.description).toContain('SERVICE_UNAVAILABLE');
      expect(login503?.description).not.toContain('TOKEN_VERIFICATION_UNAVAILABLE');
    });
  });
});
