import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const LINE = { taxType: 'GTGT', ratePercent: '10', deductible: true };
const VALID_PROFILE = { group: 'T2', lines: [LINE] };

type Call = (server: App) => request.Test;

/** The route only Finance may call (US-12-09 AC-6). */
const WRITE_ROUTES: Array<[string, Call]> = [
  ['PUT /vendors/{id}/tax-profile', (s) => request(s).put(`/api/v1/vendors/${ID}/tax-profile`).send(VALID_PROFILE)],
];

/** The routes the IT Admin and Finance may read. */
const READ_ROUTES: Array<[string, Call]> = [
  ['GET /vendors', (s) => request(s).get('/api/v1/vendors')],
  ['GET /vendors/{id}/tax-profile', (s) => request(s).get(`/api/v1/vendors/${ID}/tax-profile`)],
  ['GET /vendors/{id}/tax-profile/history', (s) => request(s).get(`/api/v1/vendors/${ID}/tax-profile/history`)],
  [
    'GET /vendors/{id}/tax-estimate',
    (s) => request(s).get(`/api/v1/vendors/${ID}/tax-estimate?netAmount=1000.00&currency=USD`),
  ],
];

describe('vendor tax profile routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([...WRITE_ROUTES, ...READ_ROUTES])('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the IT Admin, who reads but does not declare', ['IT_ADMIN'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s on the route that declares a tax profile with 403', async (_name, direct, derived) => {
    for (const [route, call] of WRITE_ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal([...direct, ...derived])))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  it.each([
    ['the Super Admin', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head, who sees no tax profile', [], ['MANAGER']],
    ['the spending approver', [], ['SPENDING_APPROVER']],
  ])('refuses %s on every route that reads vendors and tax profiles with 403', async (_name, direct, derived) => {
    for (const [route, call] of READ_ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal([...direct, ...derived])))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asFinance = () => ({ Authorization: bearer(principal(['FINANCE'])) });
    const put = (body: unknown, id = ID) =>
      request(app.getHttpServer())
        .put(`/api/v1/vendors/${id}/tax-profile`)
        .set(asFinance())
        .send(body as object);

    it.each([
      ['no lines', { group: 'T2' }],
      ['a group that is not one', { group: 'T4', lines: [] }],
      ['lines that are not a list', { lines: LINE }],
      ['a line without a name', { lines: [{ ratePercent: '10', deductible: true }] }],
      ['a line without a rate', { lines: [{ taxType: 'GTGT', deductible: true }] }],
      ['a line without the deductible flag', { lines: [{ taxType: 'GTGT', ratePercent: '10' }] }],
      ['a rate that is a JSON number', { lines: [{ taxType: 'GTGT', ratePercent: 10, deductible: true }] }],
      ['a deductible flag that is not a boolean', { lines: [{ ...LINE, deductible: 'yes' }] }],
      ['a payer typed in', { lines: [{ ...LINE, payer: 'BUYER_REMITS' }] }],
      ['a tax amount typed in', { lines: [{ ...LINE, taxAmount: '100' }] }],
      ['an unknown field', { lines: [], status: 'DECLARED' }],
    ])('turns away a PUT with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await put(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['PUT', (s: App) => request(s).put('/api/v1/vendors/not-a-uuid/tax-profile').send(VALID_PROFILE)],
      ['GET profile', (s: App) => request(s).get('/api/v1/vendors/not-a-uuid/tax-profile')],
      ['GET history', (s: App) => request(s).get('/api/v1/vendors/not-a-uuid/tax-profile/history')],
      ['GET estimate', (s: App) => request(s).get('/api/v1/vendors/not-a-uuid/tax-estimate?netAmount=1&currency=USD')],
    ])('turns away %s with an id that is not a UUID, 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asFinance()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['an estimate without an amount', `/api/v1/vendors/${ID}/tax-estimate?currency=USD`],
      ['an estimate without a currency', `/api/v1/vendors/${ID}/tax-estimate?netAmount=1`],
      ['an estimate with a currency in lower case', `/api/v1/vendors/${ID}/tax-estimate?netAmount=1&currency=usd`],
      ['an estimate with an unknown parameter', `/api/v1/vendors/${ID}/tax-estimate?netAmount=1&currency=USD&x=1`],
      ['a list with a status that is not one', '/api/v1/vendors?taxProfile=GONE'],
      ['a list with page 0', '/api/v1/vendors?page=0'],
      ['a list with a page size of 101', '/api/v1/vendors?pageSize=101'],
      ['a history with an unknown parameter', `/api/v1/vendors/${ID}/tax-profile/history?x=1`],
    ])('turns away %s, 422', async (_name, path) => {
      const response = await request(app.getHttpServer()).get(path).set(asFinance()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('nothing is deleted and nothing is filed', () => {
    it('has no route that deletes a vendor or a tax profile, or one that files or pays tax: 404, even for Finance', async () => {
      for (const [method, path] of [
        ['delete', `/api/v1/vendors/${ID}`],
        ['delete', `/api/v1/vendors/${ID}/tax-profile`],
        ['post', `/api/v1/vendors/${ID}/tax-filings`],
        ['post', `/api/v1/vendors/${ID}/tax-payments`],
      ] as const) {
        const response = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', bearer(principal(['FINANCE'])))
          .expect(404);
        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
