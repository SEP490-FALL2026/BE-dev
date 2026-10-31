import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const GROUNDS = { type: 'DECISION', reference: 'QD-12/2026', issuer: 'HR Department', issuedOn: '2026-10-01' };

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  [
    'POST /long-leaves',
    (server) =>
      request(server)
        .post('/api/v1/long-leaves')
        .send({ employeeId: ID, startedOn: '2026-06-01', approvedReturnOn: '2026-09-01', grounds: GROUNDS }),
  ],
  ['GET /long-leaves', (server) => request(server).get('/api/v1/long-leaves')],
  ['GET /long-leaves/{id}', (server) => request(server).get(`/api/v1/long-leaves/${ID}`)],
  ['GET /long-leaves/{id}/changes', (server) => request(server).get(`/api/v1/long-leaves/${ID}/changes`)],
  [
    'POST /long-leaves/{id}/return-date-changes',
    (server) =>
      request(server)
        .post(`/api/v1/long-leaves/${ID}/return-date-changes`)
        .send({ newApprovedReturnOn: '2026-09-30', grounds: GROUNDS }),
  ],
  [
    'POST /long-leaves/{id}/returns',
    (server) => request(server).post(`/api/v1/long-leaves/${ID}/returns`).send({ returnedOn: '2026-09-01' }),
  ],
];

/** The roles the guard of each route lets through: the Super Admin writes (`QĐ-87a`), the IT Admin reads a minimal projection (F12). */
const ALLOWED: Record<string, readonly string[]> = {
  'POST /long-leaves': ['SUPER_ADMIN'],
  'GET /long-leaves': ['SUPER_ADMIN', 'IT_ADMIN'],
  'GET /long-leaves/{id}': ['SUPER_ADMIN', 'IT_ADMIN'],
  'GET /long-leaves/{id}/changes': ['SUPER_ADMIN'],
  'POST /long-leaves/{id}/return-date-changes': ['SUPER_ADMIN'],
  'POST /long-leaves/{id}/returns': ['SUPER_ADMIN'],
};

describe('long leave routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('every route needs a signed-in person of the role that may use it (US-03-03; F40, F12)', () => {
    it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
      const response = await call(app.getHttpServer()).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['the Super Admin', ['SUPER_ADMIN'], []],
      ['the IT Admin', ['IT_ADMIN'], []],
      ['the finance officer', ['FINANCE'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head, whose role is derived', [], ['MANAGER']],
      ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ])('refuses %s on the routes it is not for with 403', async (_name, direct, derived) => {
      for (const [route, call] of ROUTES) {
        if (ALLOWED[route].some((role) => (direct as string[]).includes(role))) continue;
        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal(direct, derived)))
          .expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });

    it('lets the IT Admin through only on what it reads or does technically: never on the events (F40, F12)', async () => {
      for (const [route, call] of ROUTES) {
        const response = await call(app.getHttpServer()).set('Authorization', bearer(principal(['IT_ADMIN'])));
        const refused = response.status === 403 && bodyOf(response).error.code === 'AUTHORIZATION.FORBIDDEN';
        expect({ route, refused }).toEqual({ route, refused: !ALLOWED[route].includes('IT_ADMIN') });
      }
    });
  });

  describe('validation before any work', () => {
    const asAdmin = () => ({ Authorization: bearer(principal(['SUPER_ADMIN'])) });
    const START = { employeeId: ID, startedOn: '2026-06-01', approvedReturnOn: '2026-09-01', grounds: GROUNDS };

    it.each([
      ['no day of return', { employeeId: ID, startedOn: '2026-06-01', grounds: GROUNDS }],
      ['a start that is not a date', { ...START, startedOn: '01/06/2026' }],
      ['an employee that is not an id', { ...START, employeeId: 'E1' }],
      ['the reason for the leave', { ...START, reason: 'Family' }],
      ['a medical field', { ...START, medical: 'x' }],
      ['a field inside the basis the route does not know', { ...START, grounds: { ...GROUNDS, note: 'x' } }],
    ])('refuses %s with 422', async (_name, payload) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/long-leaves')
        .set(asAdmin())
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a leave id that is not an id', (server: App) => request(server).get('/api/v1/long-leaves/not-an-id')],
      ['a state that does not exist', (server: App) => request(server).get('/api/v1/long-leaves?status=DONE')],
      [
        'a flag that is not true or false',
        (server: App) => request(server).get('/api/v1/long-leaves?overdueReturn=maybe'),
      ],
      ['a page size over the limit', (server: App) => request(server).get('/api/v1/long-leaves?pageSize=101')],
      [
        'a new day that is not a date',
        (server: App) =>
          request(server)
            .post(`/api/v1/long-leaves/${ID}/return-date-changes`)
            .send({ newApprovedReturnOn: 'tomorrow' }),
      ],
      [
        'a return with the reason for the leave',
        (server: App) =>
          request(server).post(`/api/v1/long-leaves/${ID}/returns`).send({ returnedOn: '2026-09-01', reason: 'x' }),
      ],
    ])('refuses %s with 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asAdmin()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
