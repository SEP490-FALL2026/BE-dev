import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';

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

/** The routes only the IT Admin may call (US-03-08 AC-9): anyone else, a department head included, is refused. */
const IT_ADMIN_ONLY: Array<[string, Call]> = [
  [
    'POST /license-assignments/{id}/responsible-changes',
    (s) =>
      request(s)
        .post(`/api/v1/license-assignments/${ID}/responsible-changes`)
        .send({ employeeId: OTHER, effectiveFrom: '2026-10-15' }),
  ],
  ['GET /service-account-duties', (s) => request(s).get('/api/v1/service-account-duties')],
  ['POST /department-transfers/{id}/closure', (s) => request(s).post(`/api/v1/department-transfers/${ID}/closure`)],
];

/** The routes of the move of a service account to another department are gone (`QĐ-89c`): they answer 404 like any route that does not exist. */
const REMOVED: Array<[string, Call]> = [
  [
    'POST /license-assignments/{id}/department-moves',
    (s) => request(s).post(`/api/v1/license-assignments/${ID}/department-moves`).send({}),
  ],
  ['GET /service-account-moves', (s) => request(s).get('/api/v1/service-account-moves')],
  [
    'POST /service-account-moves/{id}/confirmations',
    (s) => request(s).post(`/api/v1/service-account-moves/${ID}/confirmations`),
  ],
  [
    'POST /service-account-moves/{id}/cancellation',
    (s) => request(s).post(`/api/v1/service-account-moves/${ID}/cancellation`).send({ reason: 'x' }),
  ],
];

describe('service account handover routes (e2e, no database)', () => {
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

  it.each(REMOVED)('%s answers 404: the route does not exist any more', async (_name, call) => {
    app = await appFor(principal(['IT_ADMIN']));

    const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(404);

    expect(response.status).toBe(404);
  });

  it.each(IT_ADMIN_ONLY)('%s without a token is 401', async (_name, call) => {
    app = await appFor(principal(['IT_ADMIN']));

    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s on every route only the IT Admin may call with 403 (AC-9)', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    for (const [route, call] of IT_ADMIN_ONLY) {
      const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asIt = { Authorization: 'Bearer any' };
    it.each([
      ['a duty list with a person that is not a UUID', '/api/v1/service-account-duties?employeeId=x'],
      ['a duty list with an overdue flag that is not one', '/api/v1/service-account-duties?overdue=maybe'],
      ['a duty list with a page size of 101', '/api/v1/service-account-duties?pageSize=101'],
      ['a duty list with an unknown parameter', '/api/v1/service-account-duties?x=1'],
    ])('turns away %s, 422', async (_name, path) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await request(app.getHttpServer()).get(path).set(asIt).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([['a closure of an id that is not a UUID', '/api/v1/department-transfers/not-a-uuid/closure', {}]])(
      'turns away %s, 422',
      async (_name, path, body) => {
        app = await appFor(principal(['IT_ADMIN']));

        const response = await request(app.getHttpServer()).post(path).set(asIt).send(body).expect(422);

        expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      },
    );
  });
});
