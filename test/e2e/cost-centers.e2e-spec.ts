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

/** A Cost Center is created FOR a department (`QĐ-87d(1)`): the department is part of the body. */
const NEW_COST_CENTER = { code: 'CC-DES', name: 'Design', kind: 'UNIT', departmentId: ID };

/** Routes only Finance may use (US-04-09 AC-2); the catalogue itself the Super Admin may also read, and the IT Admin may not (F12, QĐ-87a). */
const FINANCE_ROUTES: Array<[string, Call]> = [
  ['POST /cost-centers', (server) => request(server).post('/api/v1/cost-centers').send(NEW_COST_CENTER)],
  ['PATCH /cost-centers/{id}', (server) => request(server).patch(`/api/v1/cost-centers/${ID}`).send({ name: 'x' })],
  ['POST /cost-centers/{id}/deactivate', (server) => request(server).post(`/api/v1/cost-centers/${ID}/deactivate`)],
  ['GET /cost-centers/{id}/employees', (server) => request(server).get(`/api/v1/cost-centers/${ID}/employees`)],
];
const READ_ROUTE: [string, Call] = ['GET /cost-centers', (server) => request(server).get('/api/v1/cost-centers')];

describe('cost center catalogue routes (e2e, no database)', () => {
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

  describe('every route needs a signed-in account', () => {
    it.each([READ_ROUTE, ...FINANCE_ROUTES])('%s without a token is 401', async (_name, call) => {
      app = await appFor(principal(['FINANCE']));

      const response = await call(app.getHttpServer()).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('who may change the catalogue (US-04-09 AC-2)', () => {
    it.each([
      ['an IT Admin, who has no operation on the catalogue', ['IT_ADMIN'], []],
      ['the Super Admin, who reads the catalogue but does not change it', ['SUPER_ADMIN'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head, whose role is derived', [], ['MANAGER']],
      ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ])('refuses %s on every Finance route with 403', async (_name, direct, derived) => {
      app = await appFor(principal(direct, derived));

      for (const [route, call] of FINANCE_ROUTES) {
        const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });

    it.each([
      ['an IT Admin, whose scope is the technical work of departments (F12)', ['IT_ADMIN'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head', [], ['MANAGER']],
      ['the spending approver', [], ['SPENDING_APPROVER']],
    ])(
      'refuses %s the catalogue itself with 403: only Finance and the Super Admin read it',
      async (_name, direct, derived) => {
        app = await appFor(principal(direct, derived));

        const response = await request(app.getHttpServer())
          .get('/api/v1/cost-centers')
          .set('Authorization', 'Bearer any')
          .expect(403);

        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      },
    );
  });

  describe('validation', () => {
    const asFinance = () => ({ Authorization: 'Bearer any' });

    it.each([
      ['no code', { name: 'Design', kind: 'UNIT', departmentId: ID }],
      ['a code with a space', { code: 'CC DES', name: 'Design', kind: 'UNIT', departmentId: ID }],
      ['a code that starts with a hyphen', { code: '-CC', name: 'Design', kind: 'UNIT', departmentId: ID }],
      ['a code longer than 50 characters', { code: 'C'.repeat(51), name: 'Design', kind: 'UNIT', departmentId: ID }],
      ['no name', { code: 'CC-DES', kind: 'UNIT', departmentId: ID }],
      ['no kind', { code: 'CC-DES', name: 'Design', departmentId: ID }],
      ['no department (QĐ-87d(1))', { code: 'CC-DES', name: 'Design', kind: 'UNIT' }],
      ['a department that is not an id', { code: 'CC-DES', name: 'Design', kind: 'UNIT', departmentId: 'P-OPS' }],
      ['a name that is not text', { code: 'CC-DES', name: 42, kind: 'UNIT', departmentId: ID }],
      ['an unknown field', { code: 'CC-DES', name: 'Design', kind: 'UNIT', departmentId: ID, status: 'INACTIVE' }],
    ])('turns away a new cost center with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      app = await appFor(principal(['FINANCE']));

      const response = await request(app.getHttpServer())
        .post('/api/v1/cost-centers')
        .set(asFinance())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a status that is not one', '?status=DELETED'],
      ['a kind that is not one', '?kind=PROJECT'],
      ['a page size of 101', '?pageSize=101'],
      ['page 0', '?page=0'],
      ['an unknown parameter', '?organizationId=x'],
    ])('turns away a list with %s, 422', async (_name, query) => {
      app = await appFor(principal(['FINANCE']));

      const response = await request(app.getHttpServer())
        .get(`/api/v1/cost-centers${query}`)
        .set(asFinance())
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['rename', (server: App) => request(server).patch('/api/v1/cost-centers/not-a-uuid').send({ name: 'x' })],
      ['deactivate', (server: App) => request(server).post('/api/v1/cost-centers/not-a-uuid/deactivate')],
      ['employee list', (server: App) => request(server).get('/api/v1/cost-centers/not-a-uuid/employees')],
    ])('turns away a %s with an id that is not a UUID, 422', async (_name, call) => {
      app = await appFor(principal(['FINANCE']));

      const response = await call(app.getHttpServer()).set(asFinance()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('a cost center is never deleted', () => {
    it('has no route that deletes one: DELETE is 404, even for Finance', async () => {
      app = await appFor(principal(['FINANCE']));

      for (const path of ['/api/v1/cost-centers', `/api/v1/cost-centers/${ID}`]) {
        const response = await request(app.getHttpServer()).delete(path).set('Authorization', 'Bearer any').expect(404);
        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
