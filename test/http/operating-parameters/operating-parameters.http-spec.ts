import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { ENUM_OPTIONS_MAX } from '../../../src/modules/operating-parameters/parameter-definitions.policy';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  ['GET /operating-parameters', (server) => request(server).get('/api/v1/operating-parameters')],
  [
    'PUT /operating-parameters/{key}',
    (server) => request(server).put('/api/v1/operating-parameters/APPROVAL_SLA_WORKING_DAYS').send({ value: 3 }),
  ],
  [
    'GET /operating-parameters/{key}/history',
    (server) => request(server).get('/api/v1/operating-parameters/APPROVAL_SLA_WORKING_DAYS/history'),
  ],
  ['GET /non-working-dates', (server) => request(server).get('/api/v1/non-working-dates')],
  [
    'POST /non-working-dates',
    (server) => request(server).post('/api/v1/non-working-dates').send({ date: '2030-01-01', reason: 'New year' }),
  ],
  [
    'PATCH /non-working-dates/{date}',
    (server) => request(server).patch('/api/v1/non-working-dates/2030-01-01').send({ reason: 'Renamed' }),
  ],
  ['DELETE /non-working-dates/{date}', (server) => request(server).delete('/api/v1/non-working-dates/2030-01-01')],
];

describe('operating parameter routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['an IT Admin', ['IT_ADMIN'], []],
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403 on every route (US-01-04 AC-6)', async (_name, direct, derived) => {
    for (const [route, call] of ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal([...direct, ...derived])))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asAdmin = () => ({ Authorization: bearer(principal(['SUPER_ADMIN'])) });

    it.each([
      ['a key in lower case', '/api/v1/operating-parameters/approval_sla', { value: 3 }],
      ['no value', '/api/v1/operating-parameters/APPROVAL_SLA_WORKING_DAYS', {}],
      ['an unknown field', '/api/v1/operating-parameters/APPROVAL_SLA_WORKING_DAYS', { value: 3, unit: 'days' }],
    ])('turns away a parameter change with %s, 422', async (_name, path, body) => {
      const response = await request(app.getHttpServer()).put(path).set(asAdmin()).send(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a date that is not a date', '2030-02-31'],
      ['a date in the wrong shape', '03/10/2030'],
    ])('turns away a non-working date with %s, 422', async (_name, date) => {
      await request(app.getHttpServer())
        .post('/api/v1/non-working-dates')
        .set(asAdmin())
        .send({ date, reason: 'x' })
        .expect(422);
      await request(app.getHttpServer())
        .delete(`/api/v1/non-working-dates/${date.replaceAll('/', '-')}`)
        .set(asAdmin())
        .expect(422);
    });
  });

  describe('the time zone is chosen once, at installation (US-01-04 AC-11)', () => {
    it.each([
      ['PUT', '/api/v1/operating-parameters/TIME_ZONE'],
      ['PATCH', '/api/v1/organization'],
      ['PUT', '/api/v1/organization/time-zone'],
      ['PATCH', '/api/v1/organization/time-zone'],
    ])('has no %s %s: not even the Super Admin can change it', async (method, path) => {
      const response = await request(app.getHttpServer())
        [method.toLowerCase() as 'put' | 'patch'](path)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .send({ value: 'UTC' });

      expect([404, 422]).toContain(response.status);
      expect(bodyOf(response).error.code).toMatch(/^(HTTP_NOT_FOUND|PARAMETER\.NOT_FOUND)$/);
    });
  });
});

type SchemaNode = {
  $ref?: string;
  allOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  items?: SchemaNode;
  enum?: unknown[];
  maxItems?: number;
  additionalProperties?: unknown;
};
type OperationNode = { responses: Record<string, { content: { 'application/json': { schema: SchemaNode } } }> };

describe('the document says what an operating parameter is (QĐ93-PARAM-LABEL)', () => {
  let document: OpenAPIObject;
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
    document = createOpenApiDocument(app);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  const resolve = (node: SchemaNode): SchemaNode => {
    if (node.$ref) {
      const name = node.$ref.replace('#/components/schemas/', '');

      return resolve(document.components?.schemas?.[name] ?? {});
    }
    if (node.allOf) return resolve(node.allOf[0]);

    return node;
  };
  const itemOf = (method: 'get' | 'put', path: string, status: string): SchemaNode => {
    const operation = (document.paths[path] as unknown as Record<string, OperationNode>)[method];
    const data = resolve(operation.responses[status].content['application/json'].schema).properties?.data as SchemaNode;
    const body = resolve(data);

    return resolve(body.properties?.items?.items ?? body);
  };

  it.each([
    ['list', 'get', '/api/v1/operating-parameters', '200'],
    ['set', 'put', '/api/v1/operating-parameters/{key}', '200'],
  ] as const)(
    'gives the %s response a label, a group with its name and a unit label',
    (_name, method, path, status) => {
      const item = itemOf(method, path, status);

      expect(Object.keys(item.properties ?? {}).sort()).toEqual([
        'changedAt',
        'constraints',
        'default',
        'description',
        'group',
        'groupLabel',
        'isDefault',
        'key',
        'label',
        'unit',
        'unitLabel',
        'value',
      ]);
      expect(item.required).toEqual(expect.arrayContaining(['label', 'group', 'groupLabel', 'unitLabel']));
      expect(item.properties?.group.enum).toEqual([
        'WORKFLOW',
        'BUDGET',
        'PERSONNEL',
        'PROVISIONING',
        'ACCOUNT',
        'DOCUMENT',
        'SUBSCRIPTION',
        'USAGE',
      ]);
    },
  );

  it('types constraints as one of three shapes, told apart by kind, the choices of an enum bounded', () => {
    const constraints = itemOf('get', '/api/v1/operating-parameters', '200').properties?.constraints as SchemaNode;
    const shapes = constraints.oneOf ?? [];

    expect(shapes).toHaveLength(3);
    const byKind = Object.fromEntries(
      shapes.map((shape) => {
        const resolved = resolve(shape);

        return [(resolved.properties?.kind.enum as string[])[0], resolved];
      }),
    );
    expect(Object.keys(byKind).sort()).toEqual(['enum', 'int', 'int-list']);
    expect(Object.keys(byKind.int.properties ?? {}).sort()).toEqual(['kind', 'max', 'min']);
    expect(Object.keys(byKind['int-list'].properties ?? {}).sort()).toEqual(['kind', 'length', 'max', 'min', 'order']);
    expect(Object.keys(byKind.enum.properties ?? {}).sort()).toEqual(['kind', 'optionLabels', 'options']);
    expect(byKind.enum.properties?.options.maxItems).toBe(ENUM_OPTIONS_MAX);
  });
});
