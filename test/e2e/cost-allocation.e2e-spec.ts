import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const CC = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';
const LINE = { costCenterId: CC, ratioPercent: '100' };
const VALID = { lines: [LINE] };

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

/** The route only Finance may call (US-04-08 AC-5). */
const WRITE_ROUTES: Array<[string, Call]> = [
  [
    'PUT /subscriptions/{id}/cost-allocation',
    (s) => request(s).put(`/api/v1/subscriptions/${ID}/cost-allocation`).send(VALID),
  ],
];

/** The routes the IT Admin and Finance may read. */
const READ_ROUTES: Array<[string, Call]> = [
  ['GET /subscriptions/{id}/cost-allocation', (s) => request(s).get(`/api/v1/subscriptions/${ID}/cost-allocation`)],
  [
    'GET /subscriptions/{id}/cost-allocation/history',
    (s) => request(s).get(`/api/v1/subscriptions/${ID}/cost-allocation/history`),
  ],
];

describe('subscription cost allocation routes (e2e, no database)', () => {
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

  it.each([...WRITE_ROUTES, ...READ_ROUTES])('%s without a token is 401', async (_name, call) => {
    app = await appFor(principal(['FINANCE']));

    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the IT Admin, who reads but does not declare', ['IT_ADMIN'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('AC-5: refuses %s on the route that declares a cost allocation with 403', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    for (const [route, call] of WRITE_ROUTES) {
      const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  it.each([
    ['the Super Admin', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head', [], ['MANAGER']],
    ['the spending approver', [], ['SPENDING_APPROVER']],
  ])('refuses %s on every route that reads a cost allocation with 403', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    for (const [route, call] of READ_ROUTES) {
      const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asFinance = () => ({ Authorization: 'Bearer any' });
    const put = (body: unknown, id = ID) =>
      request(app.getHttpServer())
        .put(`/api/v1/subscriptions/${id}/cost-allocation`)
        .set(asFinance())
        .send(body as object);

    it.each([
      ['no lines', {}],
      ['lines that are not a list', { lines: LINE }],
      ['a line without a Cost Center', { lines: [{ ratioPercent: '100' }] }],
      ['a line without a share', { lines: [{ costCenterId: CC }] }],
      ['a Cost Center that is not a UUID', { lines: [{ costCenterId: 'CC-A', ratioPercent: '100' }] }],
      ['a share that is a JSON number', { lines: [{ costCenterId: CC, ratioPercent: 100 }] }],
      ['a total typed in', { lines: [LINE], totalPercent: '100' }],
      ['a field on a line that is not known', { lines: [{ ...LINE, amount: '100' }] }],
      ['more than a hundred lines', { lines: Array.from({ length: 101 }, () => LINE) }],
      ['an unknown field', { lines: [], status: 'DECLARED' }],
    ])('turns away a PUT with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      app = await appFor(principal(['FINANCE']));

      const response = await put(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['PUT', (s: App) => request(s).put('/api/v1/subscriptions/not-a-uuid/cost-allocation').send(VALID)],
      ['GET allocation', (s: App) => request(s).get('/api/v1/subscriptions/not-a-uuid/cost-allocation')],
      ['GET history', (s: App) => request(s).get('/api/v1/subscriptions/not-a-uuid/cost-allocation/history')],
    ])('turns away %s with an id that is not a UUID, 422', async (_name, call) => {
      app = await appFor(principal(['FINANCE']));

      const response = await call(app.getHttpServer()).set(asFinance()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a history with page 0', `/api/v1/subscriptions/${ID}/cost-allocation/history?page=0`],
      ['a history with a page size of 101', `/api/v1/subscriptions/${ID}/cost-allocation/history?pageSize=101`],
      ['a history with an unknown parameter', `/api/v1/subscriptions/${ID}/cost-allocation/history?x=1`],
    ])('turns away %s, 422', async (_name, path) => {
      app = await appFor(principal(['FINANCE']));

      const response = await request(app.getHttpServer()).get(path).set(asFinance()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('nothing is deleted and nothing is reported', () => {
    it('has no route that deletes or posts an allocation, or one that reports on it: 404, even for Finance', async () => {
      app = await appFor(principal(['FINANCE']));

      for (const [method, path] of [
        ['delete', `/api/v1/subscriptions/${ID}/cost-allocation`],
        ['post', `/api/v1/subscriptions/${ID}/cost-allocation`],
        ['get', `/api/v1/subscriptions/${ID}/cost-allocation/report`],
        ['get', '/api/v1/cost-allocations'],
      ] as const) {
        const response = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', 'Bearer any')
          .expect(404);
        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
