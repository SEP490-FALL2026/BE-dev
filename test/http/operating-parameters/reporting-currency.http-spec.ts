import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

describe('reporting currency route (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET without a token is 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/reporting-currency').expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the IT Admin', ['IT_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403: only the Super Admin reads it (AC-6)', async (_name, direct, derived) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/reporting-currency')
      .set('Authorization', bearer(principal([...direct, ...derived])))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it('QĐ-111an: has no route that sets, changes or deletes the reporting currency: the route is gone, 404 and not 410, for every other verb', async () => {
    for (const [method, path] of [
      ['put', '/api/v1/reporting-currency'],
      ['delete', '/api/v1/reporting-currency'],
      ['patch', '/api/v1/reporting-currency'],
      ['post', '/api/v1/reporting-currency'],
      ['put', '/api/v1/time-zone'],
    ] as const) {
      const response = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .expect(404);
      expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
    }
  });

  it('QĐ-111an: has no route of exchange rates: 404 for the list and for a new rate', async () => {
    for (const method of ['get', 'post'] as const) {
      const response = await request(app.getHttpServer())
        [method]('/api/v1/exchange-rates')
        .set('Authorization', bearer(principal(['FINANCE', 'SUPER_ADMIN'])))
        .expect(404);
      expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
    }
  });
});
