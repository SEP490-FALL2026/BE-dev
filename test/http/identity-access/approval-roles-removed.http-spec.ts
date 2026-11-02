import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

type Call = (server: App) => request.Test;

/**
 * The configuration of the two approval roles is gone (`qd93-remove-fallback-substitute-approvers`, `QĐ-93b`, `US-12-15` AC-25):
 * the routes answer as a route that does not exist, to a caller who holds the Super Admin role as to one who holds none. The spending
 * approver is a role grant (`POST /app-users/{id}/role-grants`), which these routes never gave.
 */
const ROUTES: Array<[string, Call]> = [
  ['GET /approval-roles', (server) => request(server).get('/api/v1/approval-roles')],
  [
    'PUT /approval-roles/CONFLICT_SUBSTITUTE',
    (server) => request(server).put('/api/v1/approval-roles/CONFLICT_SUBSTITUTE').send({ employeeId: ID }),
  ],
  [
    'PUT /approval-roles/FALLBACK_APPROVER',
    (server) => request(server).put('/api/v1/approval-roles/FALLBACK_APPROVER').send({ employeeId: ID }),
  ],
  [
    'PUT /approval-roles/SPENDING_APPROVER',
    (server) => request(server).put('/api/v1/approval-roles/SPENDING_APPROVER').send({ employeeId: ID }),
  ],
];

describe('the approval role routes that were removed (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(ROUTES)('%s is 404 for the Super Admin', async (_name, call) => {
    const response = await call(app.getHttpServer())
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .expect(404);

    expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
  });

  it.each(ROUTES)('%s is 404 without a token, as a route that does not exist', async (_name, call) => {
    await call(app.getHttpServer()).expect(404);
  });
});
