import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

const OPERATIONS = [
  'usageSourceCreate',
  'usageSourceList',
  'usageSourceGet',
  'usageSourceUpdate',
  'usageImportUpload',
  'usageImportGet',
  'usageImportRowList',
  'usageImportCancel',
  'usageImportConfirm',
  'usageUnmatchedIdentityList',
  'usageUnmatchedIdentityResolve',
  'usageUnmatchedIdentityDismiss',
  'usageIdentityMappingList',
  'usageIdentityMappingEnd',
  'usageNoAssignmentFindingList',
];

describe('vendor usage routes (http contract, no database)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createHttpContractApp();
    document = createOpenApiDocument(app);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  it('exports the operations of the sources and the imports', () => {
    const exported = Object.values(document.paths).flatMap((item) =>
      Object.values(item ?? {}).flatMap((operation) =>
        typeof operation === 'object' && operation !== null && 'operationId' in operation
          ? [(operation as { operationId: string }).operationId]
          : [],
      ),
    );

    for (const operation of OPERATIONS) expect(exported).toContain(operation);
  });

  it.each([
    ['post', '/api/v1/usage-sources'],
    ['get', '/api/v1/usage-sources'],
    ['get', `/api/v1/usage-sources/${ID}`],
    ['patch', `/api/v1/usage-sources/${ID}`],
    ['post', '/api/v1/usage-imports'],
    ['get', `/api/v1/usage-imports/${ID}`],
    ['get', `/api/v1/usage-imports/${ID}/rows`],
    ['post', `/api/v1/usage-imports/${ID}/cancel`],
    ['post', `/api/v1/usage-imports/${ID}/confirm`],
    ['get', '/api/v1/usage-unmatched-identities'],
    ['post', `/api/v1/usage-unmatched-identities/${ID}/resolve`],
    ['post', `/api/v1/usage-unmatched-identities/${ID}/dismiss`],
    ['get', '/api/v1/usage-identity-mappings'],
    ['post', `/api/v1/usage-identity-mappings/${ID}/end`],
    ['get', '/api/v1/usage-no-assignment-findings'],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the department head', ['MANAGER']],
    ['Finance', ['FINANCE']],
    ['an employee', ['EMPLOYEE']],
    ['the Super Admin', ['SUPER_ADMIN']],
  ])('QĐ-101i: %s never reads or changes the vendor usage (403)', async (_name, roles) => {
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', bearer(principal(roles)));

    for (const response of [
      await as(request(server).get('/api/v1/usage-sources')),
      await as(request(server).get(`/api/v1/usage-sources/${ID}`)),
      await as(request(server).post('/api/v1/usage-sources').send({})),
      await as(request(server).get(`/api/v1/usage-imports/${ID}`)),
      await as(request(server).get(`/api/v1/usage-imports/${ID}/rows`)),
      await as(request(server).post(`/api/v1/usage-imports/${ID}/cancel`)),
      await as(request(server).post(`/api/v1/usage-imports/${ID}/confirm`).send({ previewVersion: 1 })),
      await as(request(server).get('/api/v1/usage-unmatched-identities')),
      await as(request(server).post(`/api/v1/usage-unmatched-identities/${ID}/resolve`).send({ employeeId: ID })),
      await as(request(server).get('/api/v1/usage-identity-mappings')),
      await as(request(server).get('/api/v1/usage-no-assignment-findings')),
    ]) {
      expect(response.status).toBe(403);
    }
  });

  it.each([
    ['a source with no activity definition (INV-11)', { applicationId: ID, name: 'x', timeZone: 'UTC' }],
    [
      'a definition shorter than three characters',
      {
        applicationId: ID,
        name: 'x',
        identifierType: 'EMAIL',
        reportShape: 'AGGREGATE',
        template: { columns: { identifier: 'email' }, eventClasses: {} },
        timeZone: 'UTC',
        activityDefinition: 'ab',
        capabilities: { memberList: true, lastActivity: false, eventDetail: false },
      },
    ],
    ['a time zone that does not exist', { applicationId: ID, name: 'x', timeZone: 'Mars/Olympus' }],
  ])('refuses %s with 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/usage-sources')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses an identifier that is not a UUID and a page size over 100 with 422', async () => {
    const server = app.getHttpServer();
    const asAdmin = (req: request.Test) => req.set('Authorization', bearer(principal(['IT_ADMIN'])));

    await asAdmin(request(server).get('/api/v1/usage-imports/not-a-uuid')).expect(422);
    await asAdmin(request(server).get(`/api/v1/usage-imports/${ID}/rows`).query({ pageSize: 101 })).expect(422);
    await asAdmin(request(server).get('/api/v1/usage-sources').query({ page: 0 })).expect(422);
    await asAdmin(request(server).post(`/api/v1/usage-imports/${ID}/confirm`).send({ previewVersion: 0 })).expect(422);
    await asAdmin(request(server).post(`/api/v1/usage-unmatched-identities/${ID}/dismiss`).send({ note: '' })).expect(
      422,
    );
    await asAdmin(request(server).post(`/api/v1/usage-identity-mappings/${ID}/end`).send({ reason: 'x' })).expect(422);
  });
});
