import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

const principal = (direct: string[]) => ({
  subject: 'u1',
  appUserId: 'u1',
  sessionId: 's1',
  employeeId: 'e1',
  directRoles: direct,
  derivedRoles: [],
  roles: direct,
});

type Call = (server: App) => request.Test;

const QUEUE_ROUTES: Array<[string, Call]> = [
  ['GET /assignment-expiry-queue', (server) => request(server).get('/api/v1/assignment-expiry-queue')],
  [
    'POST /assignment-expiry-queue/{assignmentId}/revocation',
    (server) => request(server).post(`/api/v1/assignment-expiry-queue/${ID}/revocation`),
  ],
];
const ALL_ROUTES: Array<[string, Call]> = [
  ...QUEUE_ROUTES,
  ['GET /assignment-expiry-reminders', (server) => request(server).get('/api/v1/assignment-expiry-reminders')],
];

describe('assignment expiry routes (e2e, no database)', () => {
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

  it.each(ALL_ROUTES)('%s without a token is 401', async (_name, call) => {
    app = await appFor(principal([]));

    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  describe.each([['FINANCE'], ['DEPARTMENT_HEAD'], ['EMPLOYEE']])('as %s', (role) => {
    it.each(QUEUE_ROUTES)('%s is 403 and reaches no work', async (_name, call) => {
      app = await appFor(principal([role]));

      const response = await call(app.getHttpServer()).set({ Authorization: 'Bearer any' }).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  describe('validation before any work', () => {
    const signedIn = { Authorization: 'Bearer any' };

    it.each([
      [
        'a right id that is not an id',
        'IT_ADMIN',
        (s: App) => request(s).post('/api/v1/assignment-expiry-queue/not-an-id/revocation'),
      ],
      [
        'a queue status that does not exist',
        'IT_ADMIN',
        (s: App) => request(s).get('/api/v1/assignment-expiry-queue?status=DONE'),
      ],
      [
        'a debt flag that is not a flag',
        'IT_ADMIN',
        (s: App) => request(s).get('/api/v1/assignment-expiry-queue?debt=maybe'),
      ],
      [
        'a department that is not an id',
        'IT_ADMIN',
        (s: App) => request(s).get('/api/v1/assignment-expiry-queue?departmentId=x'),
      ],
      [
        'a queue page size over the limit',
        'IT_ADMIN',
        (s: App) => request(s).get('/api/v1/assignment-expiry-queue?pageSize=101'),
      ],
      [
        'a scope that does not exist',
        'EMPLOYEE',
        (s: App) => request(s).get('/api/v1/assignment-expiry-reminders?scope=everyone'),
      ],
      [
        'an audience that does not exist',
        'EMPLOYEE',
        (s: App) => request(s).get('/api/v1/assignment-expiry-reminders?audience=ALL'),
      ],
      [
        'a reminder page size over the limit',
        'EMPLOYEE',
        (s: App) => request(s).get('/api/v1/assignment-expiry-reminders?pageSize=101'),
      ],
    ])('refuses %s with 422', async (_name, role, call) => {
      app = await appFor(principal([role]));

      const response = await call(app.getHttpServer()).set(signedIn).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
