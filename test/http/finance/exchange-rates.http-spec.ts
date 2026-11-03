import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

type Call = (server: App) => request.Test;

const NEW_RATE = { currency: 'USD', rateDate: '2026-09-01', rate: '25000' };

const WRITE_ROUTE: [string, Call] = [
  'POST /exchange-rates',
  (server) => request(server).post('/api/v1/exchange-rates').send(NEW_RATE),
];
const READ_ROUTES: Array<[string, Call]> = [
  ['GET /exchange-rates', (server) => request(server).get('/api/v1/exchange-rates')],
  ['GET /currencies', (server) => request(server).get('/api/v1/currencies')],
];

describe('currency and exchange rate routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([WRITE_ROUTE, ...READ_ROUTES])('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  describe('who may write a rate (US-04-05 AC-4)', () => {
    it.each([
      ['an IT Admin, who may read rates but not write them', ['IT_ADMIN'], []],
      ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head, whose role is derived', [], ['MANAGER']],
      ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ])('refuses %s with 403', async (_name, direct, derived) => {
      const response = await WRITE_ROUTE[1](app.getHttpServer())
        .set('Authorization', bearer(principal([...direct, ...derived])))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  describe('who may read rates and currencies', () => {
    it.each([
      ['the Super Admin', ['SUPER_ADMIN'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['a department head', [], ['MANAGER']],
      ['the spending approver', [], ['SPENDING_APPROVER']],
    ])('refuses %s with 403 on both read routes', async (_name, direct, derived) => {
      for (const [route, call] of READ_ROUTES) {
        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal([...direct, ...derived])))
          .expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });
  });

  describe('validation', () => {
    const asFinance = () => ({ Authorization: bearer(principal(['FINANCE'])) });

    it.each([
      ['no currency', { rateDate: '2026-09-01', rate: '25000' }],
      ['a lower-case currency', { currency: 'usd', rateDate: '2026-09-01', rate: '25000' }],
      ['a four-letter currency', { currency: 'USDX', rateDate: '2026-09-01', rate: '25000' }],
      ['no date', { currency: 'USD', rate: '25000' }],
      ['a date that is not a calendar date', { currency: 'USD', rateDate: '2026-02-30', rate: '25000' }],
      ['a date with a time', { currency: 'USD', rateDate: '2026-09-01T10:00:00Z', rate: '25000' }],
      ['no rate', { currency: 'USD', rateDate: '2026-09-01' }],
      ['a rate that is a JSON number', { currency: 'USD', rateDate: '2026-09-01', rate: 25000 }],
      ['a rate in exponent form', { currency: 'USD', rateDate: '2026-09-01', rate: '2.5e4' }],
      ['a rate with a thousands separator', { currency: 'USD', rateDate: '2026-09-01', rate: '25,000' }],
      ['an unknown field', { currency: 'USD', rateDate: '2026-09-01', rate: '25000', source: 'PUBLIC' }],
    ])('turns away a new rate with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/exchange-rates')
        .set(asFinance())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a currency that is not a code', '?currency=dollar'],
      ['a date that is not a date', '?from=yesterday'],
      ['a page size of 101', '?pageSize=101'],
      ['page 0', '?page=0'],
      ['an unknown parameter', '?organizationId=x'],
    ])('turns away a rate list with %s, 422', async (_name, query) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/exchange-rates${query}`)
        .set(asFinance())
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('a recorded rate is never changed or removed', () => {
    it('has no route that replaces, edits or deletes one: PUT, PATCH and DELETE are 404, even for Finance', async () => {
      const id = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

      for (const path of ['/api/v1/exchange-rates', `/api/v1/exchange-rates/${id}`]) {
        for (const send of [
          (target: string) => request(app.getHttpServer()).put(target).send(NEW_RATE),
          (target: string) => request(app.getHttpServer()).patch(target).send({ rate: '1' }),
          (target: string) => request(app.getHttpServer()).delete(target),
        ]) {
          const response = await send(path)
            .set('Authorization', bearer(principal(['FINANCE'])))
            .expect(404);
          expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
        }
      }
    });
  });
});
