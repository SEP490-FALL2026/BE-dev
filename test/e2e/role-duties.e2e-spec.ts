import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

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

describe('departure notice and Super Admin watch routes (e2e, no database)', () => {
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

  it.each(['/api/v1/me/departure-notice', '/api/v1/super-admin-watch'])('%s without a token is 401', async (path) => {
    app = await appFor(principal(['IT_ADMIN']));

    const response = await request(app.getHttpServer()).get(path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s on the state of the Super Admin role with 403', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    const response = await request(app.getHttpServer())
      .get('/api/v1/super-admin-watch')
      .set('Authorization', 'Bearer any')
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['the Super Admin', ['SUPER_ADMIN']],
    ['an IT Admin', ['IT_ADMIN']],
  ])('lets %s past the guard of the state of the Super Admin role', async (_name, direct) => {
    app = await appFor(principal(direct));

    const response = await request(app.getHttpServer())
      .get('/api/v1/super-admin-watch')
      .set('Authorization', 'Bearer any');

    expect([401, 403]).not.toContain(response.status);
  });

  it.each([
    ['the finance officer', ['FINANCE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
  ])('lets %s past the guard of their own departure notice: it asks for no role', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/departure-notice')
      .set('Authorization', 'Bearer any');

    expect([401, 403]).not.toContain(response.status);
  });
});
