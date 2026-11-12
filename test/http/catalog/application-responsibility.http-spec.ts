import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const ROUTE = `/api/v1/applications/${ID}/responsibility-transfer`;

describe('application responsibility transfer route (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('QĐ-111g: answers 401 without a token', async () => {
    const response = await request(app.getHttpServer()).post(ROUTE).send({ toItAdminEmployeeId: ID }).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE']],
    ['an employee', ['EMPLOYEE']],
    ['a department head', ['MANAGER']],
    ['the spending approver', ['SPENDING_APPROVER']],
    ['an account with no role', []],
  ])('refuses %s with 403: only an IT Admin or the Super Admin hands an application over', async (_name, roles) => {
    const response = await request(app.getHttpServer())
      .post(ROUTE)
      .set('Authorization', bearer(principal(roles)))
      .send({ toItAdminEmployeeId: ID })
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['no person', ROUTE, {}],
    ['a person that is not a uuid', ROUTE, { toItAdminEmployeeId: 'it-1' }],
    ['an unknown field', ROUTE, { toItAdminEmployeeId: ID, reason: 'x' }],
    [
      'an application id that is not a uuid',
      '/api/v1/applications/not-a-uuid/responsibility-transfer',
      { toItAdminEmployeeId: ID },
    ],
  ])('turns away %s with 422 before any read', async (_name, path, body) => {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
