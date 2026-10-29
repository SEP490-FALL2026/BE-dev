import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

describe('Super Admin transfer route (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const transfer = (server: App) =>
    request(server).post('/api/v1/super-admin-transfers').send({ successorAppUserId: ID });

  it('needs a signed-in account', async () => {
    const response = await transfer(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['an IT Admin', ['IT_ADMIN'], []],
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role, such as the Super Admin who already handed the role over', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403 (US-01-09 AC-6)', async (_name, direct, derived) => {
    const response = await transfer(app.getHttpServer())
      .set('Authorization', bearer(principal(direct, derived)))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['no successor', {}],
    ['a successor that is not an id', { successorAppUserId: 'U2' }],
    ['an unknown field', { successorAppUserId: ID, keepRole: true }],
  ])('turns away a transfer with %s, 422 VALIDATION_ERROR', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/super-admin-transfers')
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('has no other way to change who holds the role: no PUT, PATCH or DELETE on the route', async () => {
    for (const method of ['put', 'patch', 'delete'] as const) {
      const response = await request(app.getHttpServer())
        [method]('/api/v1/super-admin-transfers')
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .send({});

      expect(response.status).toBe(404);
    }
  });
});
