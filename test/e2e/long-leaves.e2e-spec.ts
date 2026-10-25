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
    'POST /long-leaves',
    (server) =>
      request(server)
        .post('/api/v1/long-leaves')
        .send({ employeeId: ID, startedOn: '2026-06-01', approvedReturnOn: '2026-09-01', grounds: GROUNDS }),
  ],
  ['GET /long-leaves', (server) => request(server).get('/api/v1/long-leaves')],
  ['GET /long-leaves/{id}', (server) => request(server).get(`/api/v1/long-leaves/${ID}`)],
  ['GET /long-leaves/{id}/changes', (server) => request(server).get(`/api/v1/long-leaves/${ID}/changes`)],
  [
    'POST /long-leaves/{id}/return-date-changes',
    (server) =>
      request(server)
        .post(`/api/v1/long-leaves/${ID}/return-date-changes`)
        .send({ newApprovedReturnOn: '2026-09-30', grounds: GROUNDS }),
  ],
  [
    'POST /long-leaves/{id}/returns',
    (server) => request(server).post(`/api/v1/long-leaves/${ID}/returns`).send({ returnedOn: '2026-09-01' }),
  ],
];

describe('long leave routes (e2e, no database)', () => {
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

  describe('every route needs a signed-in IT Admin (US-03-03)', () => {
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
    const START = { employeeId: ID, startedOn: '2026-06-01', approvedReturnOn: '2026-09-01', grounds: GROUNDS };

    it.each([
      ['no day of return', { employeeId: ID, startedOn: '2026-06-01', grounds: GROUNDS }],
      ['a start that is not a date', { ...START, startedOn: '01/06/2026' }],
      ['an employee that is not an id', { ...START, employeeId: 'E1' }],
      ['the reason for the leave', { ...START, reason: 'Family' }],
      ['a medical field', { ...START, medical: 'x' }],
      ['a field inside the basis the route does not know', { ...START, grounds: { ...GROUNDS, note: 'x' } }],
    ])('refuses %s with 422', async (_name, payload) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await request(app.getHttpServer())
        .post('/api/v1/long-leaves')
        .set(asAdmin())
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a leave id that is not an id', (server: App) => request(server).get('/api/v1/long-leaves/not-an-id')],
      ['a state that does not exist', (server: App) => request(server).get('/api/v1/long-leaves?status=DONE')],
      [
        'a flag that is not true or false',
        (server: App) => request(server).get('/api/v1/long-leaves?overdueReturn=maybe'),
      ],
      ['a page size over the limit', (server: App) => request(server).get('/api/v1/long-leaves?pageSize=101')],
      [
        'a new day that is not a date',
        (server: App) =>
          request(server)
            .post(`/api/v1/long-leaves/${ID}/return-date-changes`)
            .send({ newApprovedReturnOn: 'tomorrow' }),
      ],
      [
        'a return with the reason for the leave',
        (server: App) =>
          request(server).post(`/api/v1/long-leaves/${ID}/returns`).send({ returnedOn: '2026-09-01', reason: 'x' }),
      ],
    ])('refuses %s with 422', async (_name, call) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await call(app.getHttpServer()).set(asAdmin()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
