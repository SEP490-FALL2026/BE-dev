import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';

type Call = (server: App) => request.Test;

/** The routes only the IT Admin may call: anyone else, a department head included, is refused. */
const IT_ADMIN_ONLY: Array<[string, Call]> = [
  ['POST /department-transfers/{id}/closure', (s) => request(s).post(`/api/v1/department-transfers/${ID}/closure`)],
];

/**
 * The routes of the service accounts are gone, with no answer of their own: they answer 404 like any route that does not exist
 * (`QĐ-110m`, `QĐ-89c`). A pipeline or a bot is the flag of a machine account on the seat of an IT Admin (`POST /license-assignments/{id}/machine-account`).
 */
const REMOVED: Array<[string, Call]> = [
  [
    'POST /access-requests/service-accounts',
    (s) =>
      request(s)
        .post('/api/v1/access-requests/service-accounts')
        .send({ planId: ID, businessReason: 'Work', purpose: 'Build', expectedIdentifier: 'ci-bot' }),
  ],
  [
    'POST /access-requests/{id}/service-account-review',
    (s) => request(s).post(`/api/v1/access-requests/${ID}/service-account-review`).send({ decision: 'ACCEPT' }),
  ],
  [
    'POST /license-assignments/{id}/responsible-changes',
    (s) =>
      request(s)
        .post(`/api/v1/license-assignments/${ID}/responsible-changes`)
        .send({ employeeId: OTHER, effectiveFrom: '2026-10-15' }),
  ],
  ['GET /service-account-duties', (s) => request(s).get('/api/v1/service-account-duties')],
  [
    'POST /license-assignments/{id}/department-moves',
    (s) => request(s).post(`/api/v1/license-assignments/${ID}/department-moves`).send({}),
  ],
  ['GET /service-account-moves', (s) => request(s).get('/api/v1/service-account-moves')],
  [
    'POST /service-account-moves/{id}/confirmations',
    (s) => request(s).post(`/api/v1/service-account-moves/${ID}/confirmations`),
  ],
  [
    'POST /service-account-moves/{id}/cancellation',
    (s) => request(s).post(`/api/v1/service-account-moves/${ID}/cancellation`).send({ reason: 'x' }),
  ],
];

describe('the routes of the service accounts (HTTP contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(REMOVED)('%s answers 404: the route does not exist any more', async (_name, call) => {
    for (const roles of [['IT_ADMIN'], ['EMPLOYEE'], ['SUPER_ADMIN']]) {
      await call(app.getHttpServer())
        .set('Authorization', bearer(principal(roles)))
        .expect(404);
    }
  });

  it.each(IT_ADMIN_ONLY)('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s on every route only the IT Admin may call with 403', async (_name, direct, derived) => {
    for (const [route, call] of IT_ADMIN_ONLY) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal([...direct, ...derived])))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  it('turns away a closure of an id that is not a UUID, 422', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/department-transfers/not-a-uuid/closure')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({})
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
