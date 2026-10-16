import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

function principal(direct: string[], derived: string[] = []) {
  return {
    subject: 'u1',
    appUserId: 'u1',
    sessionId: 's1',
    employeeId: 'e1',
    directRoles: direct,
    derivedRoles: derived,
    roles: [...direct, ...derived],
  };
}

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  ['GET /approval-roles', (server) => request(server).get('/api/v1/approval-roles')],
  [
    'PUT /approval-roles/{role}',
    (server) => request(server).put('/api/v1/approval-roles/SPENDING_APPROVER').send({ employeeId: ID }),
  ],
];

describe('approval role routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  async function appFor(identity: ReturnType<typeof principal> | null): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue({ verify: jest.fn().mockResolvedValue(identity) })
      .compile();
    const created = moduleRef.createNestApplication<INestApplication<App>>();
    configureApplication(created, { mountDocs: false });
    await created.init();

    return created;
  }

  afterEach(async () => {
    await app?.close();
  });

  it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
    app = await appFor(principal(['SUPER_ADMIN']));

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
    app = await appFor(principal(direct, derived));

    for (const [route, call] of ROUTES) {
      const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asAdmin = () => ({ Authorization: 'Bearer any' });

    it.each([
      ['a role that is not one', '/api/v1/approval-roles/CEO', { employeeId: ID }],
      ['a person that is not an id', '/api/v1/approval-roles/SPENDING_APPROVER', { employeeId: 'E-1' }],
      ['no person', '/api/v1/approval-roles/SPENDING_APPROVER', {}],
      ['an unknown field', '/api/v1/approval-roles/SPENDING_APPROVER', { employeeId: ID, requestId: ID }],
    ])('turns away %s, 422 VALIDATION_ERROR', async (_name, path, body) => {
      app = await appFor(principal(['SUPER_ADMIN']));

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
      for (const identity of [principal(['SUPER_ADMIN']), principal([], ['SPENDING_APPROVER'])]) {
        app = await appFor(identity);

        const response = await request(app.getHttpServer())
          [method.toLowerCase() as 'post' | 'delete'](path)
          .set('Authorization', 'Bearer any')
          .send({})
          .expect(404);

        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
        await app.close();
      }
    });
  });
});
