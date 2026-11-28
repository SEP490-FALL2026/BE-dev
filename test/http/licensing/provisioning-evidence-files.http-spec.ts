import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { ProvisioningEvidenceFilesService } from '../../../src/modules/licensing/provisioning/evidence-files/provisioning-evidence-files.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const BASE = '/api/v1/provisioning-tasks';
const LIST = `${BASE}/${ID}/evidence-files`;
const LINK = `${LIST}/${ID}/links`;

describe('provisioning evidence HTTP contracts (no database)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        {
          token: ProvisioningEvidenceFilesService,
          useValue: {
            list: () => Promise.resolve([]),
            link: () =>
              Promise.resolve({ url: 'https://storage.example/file', expiresAt: new Date('2026-12-01T00:05:00.000Z') }),
          },
        },
      ],
    });
  });
  afterAll(() => app?.close());

  it.each([
    ['get', LIST],
    ['post', LINK],
  ] as const)('requires authentication for %s %s', async (method, path) => {
    expect(bodyOf(await request(app.getHttpServer())[method](path).expect(401)).error.code).toBe(
      'AUTHENTICATION_REQUIRED',
    );
  });

  it.each(['EMPLOYEE', 'MANAGER', 'FINANCE'])('refuses %s both evidence routes', async (role) => {
    for (const [method, path] of [
      ['get', LIST],
      ['post', LINK],
    ] as const) {
      const response = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', bearer(principal([role])))
        .expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each(['IT_ADMIN', 'SUPER_ADMIN'])('allows %s and returns an uncached link', async (role) => {
    const token = bearer(principal([role]));
    const files = await request(app.getHttpServer()).get(LIST).set('Authorization', token).expect(200);
    expect(bodyOf(files).data).toEqual({ items: [] });
    const link = await request(app.getHttpServer()).post(LINK).set('Authorization', token).expect(200);
    expect(link.headers['cache-control']).toBe('no-store');
    expect(bodyOf(link).data).toEqual({ url: 'https://storage.example/file', expiresAt: '2026-12-01T00:05:00.000Z' });
  });

  it.each([
    ['get', `${BASE}/bad-id/evidence-files`],
    ['post', `${LIST}/bad-id/links`],
    ['post', `${BASE}/bad-id/evidence-files/${ID}/links`],
  ] as const)('validates UUIDs for %s %s with the existing 422 contract', async (method, path) => {
    const response = await request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(422);
    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each(['complete', 'revocation-completion', 'access-cut'])(
    'validates evidenceDocumentIds on %s before service execution',
    async (route) => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/${ID}/${route}`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({
          evidence: 'Done',
          evidenceDocumentIds: ['bad-id'],
          ...(route === 'revocation-completion' ? { completion: 'ACCOUNT_REMOVED' } : {}),
          ...(route === 'access-cut' ? { accessCutOn: '2026-11-28' } : {}),
        })
        .expect(422);
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    },
  );

  it(
    'documents evidence refusal examples for all writes and missing-file examples for links',
    () => {
      const paths = createOpenApiDocument(app).paths;
      for (const route of ['complete', 'revocation-completion', 'access-cut']) {
        const response = paths[`${BASE}/{id}/${route}`]?.post?.responses['422'];
        expect(JSON.stringify(response)).toContain('"code":"PROVISIONING_TASK.EVIDENCE_FILE_INVALID"');
        expect(JSON.stringify(response)).toContain('"problem":"PURPOSE_MISMATCH"');
      }
      expect(JSON.stringify(paths[`${BASE}/{id}/evidence-files/{fileId}/links`]?.post?.responses['404'])).toContain(
        '"code":"PROVISIONING_TASK.EVIDENCE_FILE_NOT_FOUND"',
      );
    },
    OPENAPI_DOCUMENT_BUDGET_MS,
  );
});
