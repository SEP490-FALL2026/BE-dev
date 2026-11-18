import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const PATH = '/api/v1/budget-review-periods';
const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

/**
 * The routes of the close of a month (`RV-1`): who may call them, and what the body, the query and the id must carry, judged before anything is read (e2e, no
 * database). The figures, that a month is closed once (409), and that a manager reads only the Cost Center of their own department are proved by
 * `budget-review.integration-spec.ts`.
 */
describe('the routes of the close of a month (e2e, no database)', () => {
  let app: INestApplication<App>;
  const as = (roles: string[]) => bearer(principal(roles));
  const close = (body: object, roles: string[] = ['FINANCE']) =>
    request(app.getHttpServer()).post(PATH).set('Authorization', as(roles)).send(body);
  const list = (query: object, roles: string[] = ['FINANCE']) =>
    request(app.getHttpServer()).get(PATH).query(query).set('Authorization', as(roles));
  const sign = (id: string, body: object = {}, roles: string[] = ['FINANCE']) =>
    request(app.getHttpServer()).post(`${PATH}/${id}/signature`).set('Authorization', as(roles)).send(body);
  const one = (id: string, query: object = {}, roles: string[] = ['FINANCE']) =>
    request(app.getHttpServer()).get(`${PATH}/${id}`).query(query).set('Authorization', as(roles));

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token', async () => {
    const response = await request(app.getHttpServer()).get(PATH).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('lets only Finance close a month', async () => {
    for (const roles of [['EMPLOYEE'], ['IT_ADMIN'], ['SPENDING_APPROVER'], ['MANAGER'], ['SUPER_ADMIN']]) {
      const response = await close({ year: 2026, month: 10 }, roles).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('lets Finance, the spending approver and the manager of a department read the periods, and nobody else', async () => {
    for (const roles of [['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN']]) {
      expect(bodyOf(await list({}, roles).expect(403)).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      expect(bodyOf(await one(ID, {}, roles).expect(403)).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('refuses a body with no month, a month that is not one, a year out of range, a string, and a key it does not know, before reading anything', async () => {
    for (const body of [
      {},
      { year: 2026 },
      { month: 10 },
      { year: 2026, month: 13 },
      { year: 2026, month: 0 },
      { year: 1999, month: 10 },
      { year: '2026', month: 10 },
      { year: 2026, month: 10.5 },
      { year: 2026, month: 10, unknown: 'x' },
    ]) {
      const response = await close(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('refuses a page too large, a year out of range, an id that is not one and a key it does not know', async () => {
    for (const response of [
      await list({ pageSize: 101 }).expect(422),
      await list({ year: 1999 }).expect(422),
      await list({ unknown: 'x' }).expect(422),
      await one('not-an-id').expect(422),
      await one(ID, { pageSize: 101 }).expect(422),
      await one(ID, { page: 0 }).expect(422),
    ]) {
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });
  it('lets only Finance sign, and refuses an id that is not one, an empty note and a key it does not know, before reading anything', async () => {
    for (const roles of [['EMPLOYEE'], ['SPENDING_APPROVER'], ['MANAGER'], ['IT_ADMIN'], ['SUPER_ADMIN']]) {
      expect(bodyOf(await sign(ID, {}, roles).expect(403)).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
    for (const response of [
      await sign('not-an-id').expect(422),
      await sign(ID, { note: '' }).expect(422),
      await sign(ID, { note: 'x'.repeat(2001) }).expect(422),
      await sign(ID, { unknown: 'x' }).expect(422),
    ]) {
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });
});
