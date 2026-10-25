import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const GROUNDS = { type: 'DECISION', reference: 'QD-12/2026', issuer: 'HR Department', issuedOn: '2026-10-01' };

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
  [
    'POST /offboarding-cases',
    (server) =>
      request(server)
        .post('/api/v1/offboarding-cases')
        .send({ employeeId: ID, lastWorkingDay: '2026-11-03', grounds: GROUNDS }),
  ],
  ['GET /offboarding-cases', (server) => request(server).get('/api/v1/offboarding-cases')],
  ['GET /offboarding-cases/{id}', (server) => request(server).get(`/api/v1/offboarding-cases/${ID}`)],
  ['GET /offboarding-cases/{id}/rights', (server) => request(server).get(`/api/v1/offboarding-cases/${ID}/rights`)],
  ['GET /offboarding-cases/{id}/changes', (server) => request(server).get(`/api/v1/offboarding-cases/${ID}/changes`)],
  [
    'GET /offboarding-cases/{id}/open-requests',
    (server) => request(server).get(`/api/v1/offboarding-cases/${ID}/open-requests`),
  ],
  [
    'GET /offboarding-cases/{id}/open-grant-tasks',
    (server) => request(server).get(`/api/v1/offboarding-cases/${ID}/open-grant-tasks`),
  ],
  [
    'POST /offboarding-cases/{id}/last-day-changes',
    (server) =>
      request(server)
        .post(`/api/v1/offboarding-cases/${ID}/last-day-changes`)
        .send({ lastWorkingDay: '2026-11-10', reason: 'x' }),
  ],
  [
    'POST /offboarding-cases/{id}/cancellation',
    (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/cancellation`).send({ reason: 'x' }),
  ],
  [
    'POST /offboarding-cases/{id}/departure',
    (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/departure`).send({}),
  ],
  [
    'POST /offboarding-cases/{id}/account-lock',
    (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/account-lock`).send({ note: 'khóa' }),
  ],
  [
    'POST /offboarding-cases/{id}/revocations',
    (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/revocations`).send({ count: 1, reason: 'x' }),
  ],
  ['POST /offboarding-cases/{id}/closure', (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/closure`)],
];

describe('offboarding case routes (e2e, no database)', () => {
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

  describe('every route needs a signed-in IT Admin (US-03-04)', () => {
    it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await call(app.getHttpServer()).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
      ['the finance officer', ['FINANCE'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head, whose role is derived', [], ['MANAGER']],
      ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ])('refuses %s on every route with 403', async (_name, direct, derived) => {
      app = await appFor(principal(direct, derived));

      for (const [route, call] of ROUTES) {
        const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });
  });

  describe('validation before any work', () => {
    const asAdmin = () => ({ Authorization: 'Bearer any' });
    const RECORD = { employeeId: ID, lastWorkingDay: '2026-11-03', grounds: GROUNDS };

    it.each([
      ['no employee', { lastWorkingDay: '2026-11-03', grounds: GROUNDS }],
      ['an employee that is not an id', { ...RECORD, employeeId: 'E1' }],
      ['a last day that is not a date', { ...RECORD, lastWorkingDay: '03/11/2026' }],
      ['a mode that is not a flag', { ...RECORD, abrupt: 'yes' }],
      ['a successor of no kind', { ...RECORD, successor: { employeeId: ID } }],
      ['a field the route does not know', { ...RECORD, reasonForLeaving: 'x' }],
      ['a field inside the basis the route does not know', { ...RECORD, grounds: { ...GROUNDS, note: 'x' } }],
    ])('refuses %s with 422', async (_name, payload) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await request(app.getHttpServer())
        .post('/api/v1/offboarding-cases')
        .set(asAdmin())
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a case id that is not an id', (server: App) => request(server).get('/api/v1/offboarding-cases/not-an-id')],
      ['a state that does not exist', (server: App) => request(server).get('/api/v1/offboarding-cases?state=DONE')],
      [
        'a flag that is not true or false',
        (server: App) => request(server).get('/api/v1/offboarding-cases?pastLastDay=maybe'),
      ],
      ['a page size over the limit', (server: App) => request(server).get('/api/v1/offboarding-cases?pageSize=101')],
      [
        'a role that is not one of the roles that need someone to take over',
        (server: App) => request(server).get('/api/v1/offboarding-cases?roleFlag=ADMIN'),
      ],
      [
        'the open requests of a case that is not an id',
        (server: App) => request(server).get('/api/v1/offboarding-cases/not-an-id/open-requests'),
      ],
      [
        'the open grant tasks with a page size over the limit',
        (server: App) => request(server).get(`/api/v1/offboarding-cases/${ID}/open-grant-tasks?pageSize=101`),
      ],
      [
        'a new day that is not a date',
        (server: App) =>
          request(server).post(`/api/v1/offboarding-cases/${ID}/last-day-changes`).send({ lastWorkingDay: 'tomorrow' }),
      ],
      [
        'revocations with no count',
        (server: App) => request(server).post(`/api/v1/offboarding-cases/${ID}/revocations`).send({ reason: 'x' }),
      ],
      [
        'revocations naming a seat that is not an id',
        (server: App) =>
          request(server)
            .post(`/api/v1/offboarding-cases/${ID}/revocations`)
            .send({ count: 1, reason: 'x', assignmentIds: ['seat'] }),
      ],
      [
        'a lock of the account with an empty note',
        (server: App) => request(server).post(`/api/v1/offboarding-cases/${ID}/account-lock`).send({ note: '  ' }),
      ],
      [
        'a departure on a day that is not a date',
        (server: App) =>
          request(server).post(`/api/v1/offboarding-cases/${ID}/departure`).send({ departedOn: 'today' }),
      ],
    ])('refuses %s with 422', async (_name, call) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await call(app.getHttpServer()).set(asAdmin()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
