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

describe('Super Admin transfer route (e2e, no database)', () => {
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

  const transfer = (server: App) =>
    request(server).post('/api/v1/super-admin-transfers').send({ successorAppUserId: ID });

  it('needs a signed-in account', async () => {
    app = await appFor(principal(['SUPER_ADMIN']));

    const response = await transfer(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['an IT Admin', ['IT_ADMIN'], []],
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role, such as the Super Admin who already handed the role over', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403 (US-01-09 AC-6)', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    const response = await transfer(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['no successor', {}],
    ['a successor that is not an id', { successorAppUserId: 'U2' }],
    ['an unknown field', { successorAppUserId: ID, keepRole: true }],
  ])('turns away a transfer with %s, 422 VALIDATION_ERROR', async (_name, body) => {
    app = await appFor(principal(['SUPER_ADMIN']));

    const response = await request(app.getHttpServer())
      .post('/api/v1/super-admin-transfers')
      .set('Authorization', 'Bearer any')
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('has no other way to change who holds the role: no PUT, PATCH or DELETE on the route', async () => {
    app = await appFor(principal(['SUPER_ADMIN']));

    for (const method of ['put', 'patch', 'delete'] as const) {
      const response = await request(app.getHttpServer())
        [method]('/api/v1/super-admin-transfers')
        .set('Authorization', 'Bearer any')
        .send({});

      expect(response.status).toBe(404);
    }
  });
});
