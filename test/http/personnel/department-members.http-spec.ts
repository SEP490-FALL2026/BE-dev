import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const DEPARTMENT = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const EMPLOYEE = '8a4d2c10-6b3e-4c57-9f01-2d8e7a5b4c33';
const BASE = `/api/v1/departments/${DEPARTMENT}/employees/${EMPLOYEE}`;

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  ['GET /departments/{id}/employees/{employeeId}', (server) => request(server).get(BASE)],
  [
    'GET /departments/{id}/employees/{employeeId}/software-rights',
    (server) => request(server).get(`${BASE}/software-rights`),
  ],
  [
    'GET /departments/{id}/employees/{employeeId}/open-requests',
    (server) => request(server).get(`${BASE}/open-requests`),
  ],
];

describe('department member routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the Super Admin', ['SUPER_ADMIN']],
    ['the IT Admin', ['IT_ADMIN']],
    ['the finance officer', ['FINANCE']],
    ['the spending approver', ['SPENDING_APPROVER']],
    ['an employee', ['EMPLOYEE']],
    ['an account with no role', []],
  ])('refuses %s with 403 before any work (QĐ-41c(2): only a head reads a member)', async (_name, roles) => {
    for (const [route, call] of ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(roles)))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation before any work', () => {
    const asManager = { Authorization: bearer(principal(['MANAGER'])) };

    it.each([
      ['a department that is not an id', `/api/v1/departments/not-an-id/employees/${EMPLOYEE}`],
      ['an employee that is not an id', `/api/v1/departments/${DEPARTMENT}/employees/not-an-id`],
      ['a software page size over the limit', `${BASE}/software-rights?pageSize=101`],
      ['a software page size of zero', `${BASE}/software-rights?pageSize=0`],
      ['a software page that is not a number', `${BASE}/software-rights?page=first`],
      ['an open-request page size over the limit', `${BASE}/open-requests?pageSize=101`],
      ['a parameter the list does not know', `${BASE}/open-requests?state=OPEN`],
    ])('refuses %s with 422', async (_name, path) => {
      const response = await request(app.getHttpServer()).get(path).set(asManager).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
