import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

describe('reporting currency routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['GET', (s: App) => request(s).get('/api/v1/reporting-currency')],
    ['PUT', (s: App) => request(s).put('/api/v1/reporting-currency').send({ currency: 'USD' })],
  ])('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the IT Admin', ['IT_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s on both routes with 403: only the Super Admin sets it (AC-6)', async (_name, direct, derived) => {
    for (const call of [
      (s: App) => request(s).get('/api/v1/reporting-currency'),
      (s: App) => request(s).put('/api/v1/reporting-currency').send({ currency: 'USD' }),
    ]) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each([
    ['no currency', {}],
    ['a currency in lower case', { currency: 'usd' }],
    ['a currency of two letters', { currency: 'US' }],
    ['a currency that is a number', { currency: 840 }],
    ['a field that is not known', { currency: 'USD', locked: false }],
  ])('turns away a PUT with %s, 422 VALIDATION_ERROR', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/reporting-currency')
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('has no route that deletes the reporting currency or changes it through another verb: 404', async () => {
    for (const [method, path] of [
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
});
