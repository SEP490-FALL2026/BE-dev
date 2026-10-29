import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

describe('departure notice and Super Admin watch routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['/api/v1/me/departure-notice', '/api/v1/super-admin-watch'])('%s without a token is 401', async (path) => {
    const response = await request(app.getHttpServer()).get(path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s on the state of the Super Admin role with 403', async (_name, direct, derived) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/super-admin-watch')
      .set('Authorization', bearer(principal(direct, derived)))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['the Super Admin', ['SUPER_ADMIN']],
    ['an IT Admin', ['IT_ADMIN']],
  ])('lets %s past the guard of the state of the Super Admin role', async (_name, direct) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/super-admin-watch')
      .set('Authorization', bearer(principal(direct)));

    expect([401, 403]).not.toContain(response.status);
  });

  it.each([
    ['the finance officer', ['FINANCE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
  ])('lets %s past the guard of their own departure notice: it asks for no role', async (_name, direct, derived) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me/departure-notice')
      .set('Authorization', bearer(principal(direct, derived)));

    expect([401, 403]).not.toContain(response.status);
  });
});
