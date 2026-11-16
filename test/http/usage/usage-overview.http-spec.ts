import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const FORBIDDEN_PROPERTY = /^(fullName|avatar|avatarUrl|photo|photoUrl|picture|workPhone)$/i;

type Schema = { $ref?: string; properties?: Record<string, Schema>; items?: Schema; [key: string]: unknown };

describe('the usage reads of the IT Admin (http contract, no database)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createHttpContractApp();
    document = createOpenApiDocument(app);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  const asAdmin = (req: request.Test) => req.set('Authorization', bearer(principal(['IT_ADMIN'])));

  /** Every property name in the response of an operation, followed through the schemas it refers to. */
  function propertiesOfResponses(operation: object): string[] {
    const named = (document.components?.schemas ?? {}) as Record<string, Schema>;
    const names = new Set<string>();
    const seen = new Set<string>();
    const walk = (schema: Schema | undefined): void => {
      if (!schema || typeof schema !== 'object') return;
      if (schema.$ref) {
        const key = schema.$ref.split('/').pop() ?? '';
        if (seen.has(key)) return;
        seen.add(key);

        return walk(named[key]);
      }
      for (const [name, inner] of Object.entries(schema.properties ?? {})) {
        names.add(name);
        walk(inner);
      }
      walk(schema.items);
      for (const variant of ['anyOf', 'oneOf', 'allOf'] as const) {
        for (const inner of (schema[variant] as Schema[] | undefined) ?? []) walk(inner);
      }
    };
    const responses = (operation as { responses?: Record<string, { content?: Record<string, { schema?: Schema }> }> })
      .responses;
    for (const response of Object.values(responses ?? {})) {
      for (const content of Object.values(response.content ?? {})) walk(content.schema);
    }

    return [...names];
  }

  it('QĐ-111aw: no response of a route of the usage carries a full name or a photo', () => {
    const usageOperations = Object.entries(document.paths).flatMap(([path, item]) =>
      path.includes('usage')
        ? Object.entries(item ?? {}).flatMap(([method, operation]) =>
            typeof operation === 'object' && operation !== null && 'responses' in operation
              ? [{ route: `${method.toUpperCase()} ${path}`, operation: operation as object }]
              : [],
          )
        : [],
    );

    expect(usageOperations.length).toBeGreaterThan(15);
    const offenders = usageOperations.flatMap(({ route, operation }) =>
      propertiesOfResponses(operation)
        .filter((name) => FORBIDDEN_PROPERTY.test(name))
        .map((name) => `${route}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  describe('GET /usage-overview (usageOverviewList)', () => {
    it('is exported, with a page size no larger than 100 and no personal property', () => {
      const operation = document.paths['/api/v1/usage-overview']?.get as unknown as {
        operationId: string;
        parameters: Array<{ name: string; schema?: { maximum?: number } }>;
      };

      expect(operation.operationId).toBe('usageOverviewList');
      expect(operation.parameters.find((parameter) => parameter.name === 'pageSize')?.schema?.maximum).toBe(100);
      expect(operation.parameters.map((parameter) => parameter.name)).not.toContain('departmentScope');
    });

    it('answers 401 without a token and 403 to everyone but the IT Admin', async () => {
      const server = app.getHttpServer();

      expect(bodyOf(await request(server).get('/api/v1/usage-overview').expect(401)).error.code).toBe(
        'AUTHENTICATION_REQUIRED',
      );
      for (const roles of [['MANAGER'], ['FINANCE'], ['EMPLOYEE'], ['SUPER_ADMIN']]) {
        await request(server)
          .get('/api/v1/usage-overview')
          .set('Authorization', bearer(principal(roles)))
          .expect(403);
      }
    });

    it('refuses what is not a query of the series with 422', async () => {
      const server = app.getHttpServer();

      for (const query of [
        { granularity: 'YEAR' },
        { groupBy: 'EMPLOYEE' },
        { departmentId: 'not-a-uuid' },
        { from: '2026-02-30' },
        { pageSize: 101 },
        { page: 0 },
        { orderBy: 'activeDays' },
      ]) {
        await asAdmin(request(server).get('/api/v1/usage-overview').query(query)).expect(422);
      }
    });

    it('offers no way to sort or rank the people by what they did: the query has no order and the points carry no person', () => {
      const operation = document.paths['/api/v1/usage-overview']?.get as unknown as {
        parameters: Array<{ name: string }>;
      };

      expect(operation.parameters.map((parameter) => parameter.name).sort()).toEqual(
        [
          'applicationId',
          'departmentId',
          'employeeId',
          'from',
          'granularity',
          'groupBy',
          'page',
          'pageSize',
          'sourceId',
          'sourceKind',
          'to',
        ].sort(),
      );
    });
  });

  describe('the usage of one person (usageEmployeeSoftwareList, usageEmployeeSoftwareGet)', () => {
    const LIST = `/api/v1/employees/${ID}/usage-software`;
    const DETAIL = `${LIST}/${ID}`;

    it('exports both operations, each with the range and no way to sort or rank', () => {
      const list = document.paths['/api/v1/employees/{id}/usage-software']?.get as unknown as {
        operationId: string;
        parameters: Array<{ name: string; schema?: { maximum?: number } }>;
      };
      const detail = document.paths['/api/v1/employees/{id}/usage-software/{applicationId}']?.get as unknown as {
        operationId: string;
        parameters: Array<{ name: string }>;
      };

      expect(list.operationId).toBe('usageEmployeeSoftwareList');
      expect(detail.operationId).toBe('usageEmployeeSoftwareGet');
      expect(list.parameters.map((parameter) => parameter.name).sort()).toEqual(
        ['from', 'id', 'page', 'pageSize', 'to'].sort(),
      );
      expect(list.parameters.find((parameter) => parameter.name === 'pageSize')?.schema?.maximum).toBe(100);
      expect(detail.parameters.map((parameter) => parameter.name).sort()).toEqual([
        'applicationId',
        'from',
        'id',
        'to',
      ]);
    });

    it('answers 401 without a token and 403 to everyone but the IT Admin', async () => {
      const server = app.getHttpServer();

      for (const path of [LIST, DETAIL]) {
        expect(bodyOf(await request(server).get(path).expect(401)).error.code).toBe('AUTHENTICATION_REQUIRED');
        for (const roles of [['MANAGER'], ['FINANCE'], ['EMPLOYEE'], ['SUPER_ADMIN']]) {
          await request(server)
            .get(path)
            .set('Authorization', bearer(principal(roles)))
            .expect(403);
        }
      }
    });

    it('refuses what is not valid with 422: an identifier that is not a UUID, a date that does not exist, a page too large', async () => {
      const server = app.getHttpServer();

      await asAdmin(request(server).get('/api/v1/employees/not-a-uuid/usage-software')).expect(422);
      await asAdmin(request(server).get(`${LIST}/not-a-uuid`)).expect(422);
      await asAdmin(request(server).get(LIST).query({ from: '2026-02-30' })).expect(422);
      await asAdmin(request(server).get(LIST).query({ pageSize: 101 })).expect(422);
      await asAdmin(request(server).get(DETAIL).query({ granularity: 'DAY' })).expect(422);
    });
  });
});
