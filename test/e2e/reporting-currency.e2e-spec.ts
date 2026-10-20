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

describe('reporting currency routes (e2e, no database)', () => {
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

  it.each([
    ['GET', (s: App) => request(s).get('/api/v1/reporting-currency')],
    ['PUT', (s: App) => request(s).put('/api/v1/reporting-currency').send({ currency: 'USD' })],
  ])('%s without a token is 401', async (_name, call) => {
    app = await appFor(principal(['SUPER_ADMIN']));

    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the IT Admin', ['IT_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s on both routes with 403: only the Super Admin sets it (AC-6)', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    for (const call of [
      (s: App) => request(s).get('/api/v1/reporting-currency'),
      (s: App) => request(s).put('/api/v1/reporting-currency').send({ currency: 'USD' }),
    ]) {
      const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each([
    ['no currency', {}],
    ['a currency in lower case', { currency: 'usd' }],
    ['a currency of two letters', { currency: 'US' }],
    ['a currency that is a number', { currency: 840 }],
    ['a field that is not known', { currency: 'USD', locked: false }],
  ])('turns away a PUT with %s, 422 VALIDATION_ERROR', async (_name, body) => {
    app = await appFor(principal(['SUPER_ADMIN']));

    const response = await request(app.getHttpServer())
      .put('/api/v1/reporting-currency')
      .set('Authorization', 'Bearer any')
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('has no route that deletes the reporting currency or changes it through another verb: 404', async () => {
    app = await appFor(principal(['SUPER_ADMIN']));

    for (const [method, path] of [
      ['delete', '/api/v1/reporting-currency'],
      ['patch', '/api/v1/reporting-currency'],
      ['post', '/api/v1/reporting-currency'],
      ['put', '/api/v1/time-zone'],
    ] as const) {
      const response = await request(app.getHttpServer())[method](path).set('Authorization', 'Bearer any').expect(404);
      expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
    }
  });
});
