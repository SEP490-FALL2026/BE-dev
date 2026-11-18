import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const URL = '/api/v1/invoice-discrepancies';
const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

const closing = (over: Record<string, unknown> = {}) => ({
  outcome: 'EXPLAINED',
  reason: 'Mua thêm hợp lệ',
  differenceAmount: { amount: '0' },
  ...over,
});

/**
 * The routes of the cases of invoices that differ (`RC-1`, `QĐ-111y`): who may call each, and what a body or a query must carry, judged before
 * anything is read (e2e, no database). What a case holds, who sees it and how it closes are proved by `invoice-discrepancy.integration-spec.ts`.
 */
describe('the routes of the cases of invoices that differ (e2e, no database)', () => {
  let app: INestApplication<App>;
  const as = (roles: string[]) => bearer(principal(roles));

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token on every route', async () => {
    for (const response of [
      await request(app.getHttpServer()).get(URL).expect(401),
      await request(app.getHttpServer()).get(`${URL}/${ID}`).expect(401),
      await request(app.getHttpServer()).post(`${URL}/${ID}/closure`).send(closing()).expect(401),
    ]) {
      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    }
  });

  it('lets only Finance and the IT Admin read, and only Finance close', async () => {
    for (const roles of [['EMPLOYEE'], ['SUPER_ADMIN'], ['SPENDING_APPROVER']]) {
      for (const path of ['', `/${ID}`]) {
        const refused = await request(app.getHttpServer())
          .get(`${URL}${path}`)
          .set('Authorization', as(roles))
          .expect(403);
        expect(bodyOf(refused).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      }
    }
    for (const roles of [['IT_ADMIN'], ['EMPLOYEE'], ['SUPER_ADMIN']]) {
      const refused = await request(app.getHttpServer())
        .post(`${URL}/${ID}/closure`)
        .set('Authorization', as(roles))
        .send(closing())
        .expect(403);
      expect(bodyOf(refused).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each([
    ['no reason', closing({ reason: undefined })],
    ['a blank reason', closing({ reason: '   ' })],
    ['a reason of 1001 characters', closing({ reason: 'x'.repeat(1001) })],
    ['no outcome', closing({ outcome: undefined })],
    ['an outcome the case does not have', closing({ outcome: 'FALSE_ALARM' })],
    ['no difference', closing({ differenceAmount: undefined })],
    ['a difference that is not an object', closing({ differenceAmount: '0' })],
    ['a difference that carries a currency', closing({ differenceAmount: { amount: '0', currency: 'VND' } })],
    ['a field the closing does not have', closing({ note: 'x' })],
  ])('refuses a closing with %s with 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(`${URL}/${ID}/closure`)
      .set('Authorization', as(['FINANCE']))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a case whose id is not an id with 422, on the read and on the closing', async () => {
    for (const response of [
      await request(app.getHttpServer())
        .get(`${URL}/caso`)
        .set('Authorization', as(['FINANCE']))
        .expect(422),
      await request(app.getHttpServer())
        .post(`${URL}/caso/closure`)
        .set('Authorization', as(['FINANCE']))
        .send(closing())
        .expect(422),
    ]) {
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it.each([
    ['a page size of 101', { pageSize: 101 }],
    ['a page of 0', { page: 0 }],
    ['a state that is not one', { state: 'DONE' }],
    ['an outcome that is not one', { outcome: 'FALSE_ALARM' }],
    ['a filter the list does not have', { vendorId: ID }],
  ])('refuses a list with %s with 422', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get(URL)
      .query(query)
      .set('Authorization', as(['FINANCE']))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
