import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  ['GET /approval-roles', (server) => request(server).get('/api/v1/approval-roles')],
  [
    'PUT /approval-roles/{role}',
    (server) => request(server).put('/api/v1/approval-roles/CONFLICT_SUBSTITUTE').send({ employeeId: ID }),
  ],
];

describe('approval role routes (e2e, no database)', () => {
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
    ['an IT Admin', ['IT_ADMIN'], []],
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver himself, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403 on every route (US-01-03 AC-4)', async (_name, direct, derived) => {
    for (const [route, call] of ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal([...direct, ...derived])))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asAdmin = () => ({ Authorization: bearer(principal(['SUPER_ADMIN'])) });

    it.each([
      ['a role that is not one', '/api/v1/approval-roles/CEO', { employeeId: ID }],
      [
        'SPENDING_APPROVER, a granted role since QĐ-93a',
        '/api/v1/approval-roles/SPENDING_APPROVER',
        { employeeId: ID },
      ],
      ['a person that is not an id', '/api/v1/approval-roles/CONFLICT_SUBSTITUTE', { employeeId: 'E-1' }],
      ['no person', '/api/v1/approval-roles/FALLBACK_APPROVER', {}],
      ['an unknown field', '/api/v1/approval-roles/CONFLICT_SUBSTITUTE', { employeeId: ID, requestId: ID }],
    ])('turns away %s, 422 VALIDATION_ERROR', async (_name, path, body) => {
      const response = await request(app.getHttpServer()).put(path).set(asAdmin()).send(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('nobody delegates (US-01-03 AC-5)', () => {
    it.each([
      ['POST', '/api/v1/approval-roles'],
      ['POST', `/api/v1/requests/${ID}/approvers`],
      ['POST', '/api/v1/approval-roles/SPENDING_APPROVER/delegations'],
      ['DELETE', '/api/v1/approval-roles/SPENDING_APPROVER'],
    ])('has no %s %s: 404 or 405 even for the Super Admin and the spending approver', async (method, path) => {
      for (const identity of [principal(['SUPER_ADMIN']), principal(['SPENDING_APPROVER'])]) {
        const response = await request(app.getHttpServer())
          [method.toLowerCase() as 'post' | 'delete'](path)
          .set('Authorization', bearer(identity))
          .send({})
          .expect(404);

        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
