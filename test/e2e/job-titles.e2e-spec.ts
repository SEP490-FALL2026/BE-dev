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

const ROUTES: Array<[string, Call]> = [
  ['GET /job-titles', (server) => request(server).get('/api/v1/job-titles')],
  ['POST /job-titles', (server) => request(server).post('/api/v1/job-titles').send({ name: 'Designer' })],
  ['PATCH /job-titles/{id}', (server) => request(server).patch(`/api/v1/job-titles/${ID}`).send({ name: 'Designer' })],
  ['POST /job-titles/{id}/deactivate', (server) => request(server).post(`/api/v1/job-titles/${ID}/deactivate`)],
  ['POST /job-titles/{id}/reactivate', (server) => request(server).post(`/api/v1/job-titles/${ID}/reactivate`)],
];

describe('job title catalogue routes (e2e, no database)', () => {
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

  describe('every route needs a signed-in IT Admin (US-02-07 AC-10, AC-11)', () => {
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

  describe('validation', () => {
    const asAdmin = () => ({ Authorization: 'Bearer any' });

    it.each([
      ['no name', {}],
      ['a name that is not text', { name: 42 }],
      ['an unknown field', { name: 'Designer', status: 'INACTIVE' }],
    ])('turns away a new title with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await request(app.getHttpServer())
        .post('/api/v1/job-titles')
        .set(asAdmin())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a status that is not one', '?status=DELETED'],
      ['a page size of 101', '?pageSize=101'],
      ['page 0', '?page=0'],
      ['a search longer than 100 characters', `?search=${'a'.repeat(101)}`],
      ['an unknown parameter', '?organizationId=x'],
    ])('turns away a list with %s, 422', async (_name, query) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await request(app.getHttpServer()).get(`/api/v1/job-titles${query}`).set(asAdmin()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['rename', (server: App) => request(server).patch('/api/v1/job-titles/not-a-uuid').send({ name: 'x' })],
      ['deactivate', (server: App) => request(server).post('/api/v1/job-titles/not-a-uuid/deactivate')],
      ['reactivate', (server: App) => request(server).post('/api/v1/job-titles/not-a-uuid/reactivate')],
    ])('turns away a %s with an id that is not a UUID, 422', async (_name, call) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await call(app.getHttpServer()).set(asAdmin()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('turns away a rename with no name or with an unknown field, 422', async () => {
      app = await appFor(principal(['IT_ADMIN']));

      for (const body of [{}, { name: 'x', status: 'ACTIVE' }]) {
        await request(app.getHttpServer()).patch(`/api/v1/job-titles/${ID}`).set(asAdmin()).send(body).expect(422);
      }
    });
  });

  describe('a title is never deleted (AC-9)', () => {
    it('has no route that deletes one: DELETE is 404, even for an IT Admin', async () => {
      app = await appFor(principal(['IT_ADMIN']));

      for (const path of ['/api/v1/job-titles', `/api/v1/job-titles/${ID}`]) {
        const response = await request(app.getHttpServer()).delete(path).set('Authorization', 'Bearer any').expect(404);
        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
