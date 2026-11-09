import request from 'supertest';
import type { OpenAPIObject } from '@nestjs/swagger';
import { API_COVERAGE_MANIFEST } from '../../support/api-coverage-manifest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { createHttpContractApp } from '../../support/http-contract-app';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';
import { operationsOf, routeHandlersOf, type InventoryOperation } from '../../support/openapi-inventory';

/** The only routes anyone may call without signing in. Adding to this list is a security decision. */
const PUBLIC_ALLOWLIST = [
  'AuthController.login',
  'AuthController.logout',
  'AuthController.redeemInvitation',
  'AuthController.refresh',
  'AuthController.requestPasswordReset',
  'AuthController.resetPassword',
  'DeviceEnrollmentController.create',
  'HealthController.getLiveness',
  'HealthController.getReadiness',
];

/** the operations, their access and the routes that are not there */
describe('API inventory (e2e): the operations, their access and the routes that are not there', () => {
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

  it('every route handler declares exactly one access rule', () => {
    const handlers = routeHandlersOf(app);

    expect(handlers.length).toBeGreaterThan(0);
    expect(handlers.filter((handler) => handler.declarations.length !== 1).map((handler) => handler.name)).toEqual([]);
  });

  it('the public routes are exactly the allowlist (no registration route exists)', () => {
    const publicRoutes = routeHandlersOf(app)
      .filter((handler) => handler.declarations[0] === 'public')
      .map((handler) => handler.name)
      .sort();

    expect(publicRoutes).toEqual([...PUBLIC_ALLOWLIST].sort());
    expect([...API_COVERAGE_MANIFEST].filter((key) => /register|signup|sign-up/i.test(key))).toEqual([]);
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
