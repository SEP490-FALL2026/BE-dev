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

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  ['GET /operating-parameters', (server) => request(server).get('/api/v1/operating-parameters')],
  [
    'PUT /operating-parameters/{key}',
    (server) => request(server).put('/api/v1/operating-parameters/APPROVAL_SLA_WORKING_DAYS').send({ value: 3 }),
  ],
  [
    'GET /operating-parameters/{key}/history',
    (server) => request(server).get('/api/v1/operating-parameters/APPROVAL_SLA_WORKING_DAYS/history'),
  ],
  ['GET /non-working-dates', (server) => request(server).get('/api/v1/non-working-dates')],
  [
    'POST /non-working-dates',
    (server) => request(server).post('/api/v1/non-working-dates').send({ date: '2030-01-01', reason: 'New year' }),
  ],
  [
    'PATCH /non-working-dates/{date}',
    (server) => request(server).patch('/api/v1/non-working-dates/2030-01-01').send({ reason: 'Renamed' }),
  ],
  ['DELETE /non-working-dates/{date}', (server) => request(server).delete('/api/v1/non-working-dates/2030-01-01')],
];

describe('operating parameter routes (e2e, no database)', () => {
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
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403 on every route (US-01-04 AC-6)', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    for (const [route, call] of ROUTES) {
      const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asAdmin = () => ({ Authorization: 'Bearer any' });

    it.each([
      ['a key in lower case', '/api/v1/operating-parameters/approval_sla', { value: 3 }],
      ['no value', '/api/v1/operating-parameters/APPROVAL_SLA_WORKING_DAYS', {}],
      ['an unknown field', '/api/v1/operating-parameters/APPROVAL_SLA_WORKING_DAYS', { value: 3, unit: 'days' }],
    ])('turns away a parameter change with %s, 422', async (_name, path, body) => {
      app = await appFor(principal(['SUPER_ADMIN']));

      const response = await request(app.getHttpServer()).put(path).set(asAdmin()).send(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a date that is not a date', '2030-02-31'],
      ['a date in the wrong shape', '03/10/2030'],
    ])('turns away a non-working date with %s, 422', async (_name, date) => {
      app = await appFor(principal(['SUPER_ADMIN']));

      await request(app.getHttpServer())
        .post('/api/v1/non-working-dates')
        .set(asAdmin())
        .send({ date, reason: 'x' })
        .expect(422);
      await request(app.getHttpServer())
        .delete(`/api/v1/non-working-dates/${date.replaceAll('/', '-')}`)
        .set(asAdmin())
        .expect(422);
    });
  });

  describe('the time zone is chosen once, at installation (US-01-04 AC-11)', () => {
    it.each([
      ['PUT', '/api/v1/operating-parameters/TIME_ZONE'],
      ['PATCH', '/api/v1/organization'],
      ['PUT', '/api/v1/organization/time-zone'],
      ['PATCH', '/api/v1/organization/time-zone'],
    ])('has no %s %s: not even the Super Admin can change it', async (method, path) => {
      app = await appFor(principal(['SUPER_ADMIN']));

      const response = await request(app.getHttpServer())
        [method.toLowerCase() as 'put' | 'patch'](path)
        .set('Authorization', 'Bearer any')
        .send({ value: 'UTC' });

      expect([404, 422]).toContain(response.status);
      expect(bodyOf(response).error.code).toMatch(/^(HTTP_NOT_FOUND|PARAMETER\.NOT_FOUND)$/);
    });
  });
});
