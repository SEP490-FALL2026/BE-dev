import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const DEPARTMENT = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const JOB_TITLE = '6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const PAIR = `/api/v1/standard-toolsets/${DEPARTMENT}/${JOB_TITLE}`;

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

describe('standard toolset routes (e2e, no database)', () => {
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
    ['list', '/api/v1/standard-toolsets'],
    ['mine', '/api/v1/standard-toolsets/mine'],
    ['get', PAIR],
    ['history', `${PAIR}/history`],
  ])('answers 401 to %s without a token', async (_name, path) => {
    app = await appFor(null);

    const response = await request(app.getHttpServer()).get(path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('answers 401 to a change without a token', async () => {
    app = await appFor(null);

    await request(app.getHttpServer()).put(PAIR).send({ planIds: [], reason: 'x' }).expect(401);
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head', ['MANAGER'], []],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ['an account with no role', [], []],
  ])('refuses %s the change of a standard toolset with 403 (AC-8)', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));

    const response = await request(app.getHttpServer())
      .put(PAIR)
      .set('Authorization', 'Bearer any')
      .send({ planIds: [], reason: 'because' })
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['Finance', ['FINANCE']],
    ['an employee', ['EMPLOYEE']],
    ['the Super Admin', ['SUPER_ADMIN']],
  ])('refuses %s the list and the history, which only the IT Admin and a head read', async (_name, direct) => {
    app = await appFor(principal(direct));

    await request(app.getHttpServer()).get('/api/v1/standard-toolsets').set('Authorization', 'Bearer any').expect(403);
    await request(app.getHttpServer()).get(`${PAIR}/history`).set('Authorization', 'Bearer any').expect(403);
  });

  it('refuses a department head the history: it is the IT Admin who answers for the changes', async () => {
    app = await appFor(principal(['MANAGER']));

    await request(app.getHttpServer()).get(`${PAIR}/history`).set('Authorization', 'Bearer any').expect(403);
  });

  it.each([
    ['an id that is not a UUID', '/api/v1/standard-toolsets/not-a-uuid/' + JOB_TITLE, 'get'],
    ['a job title that is not a UUID', `/api/v1/standard-toolsets/${DEPARTMENT}/x`, 'get'],
    ['page 0 of the list', '/api/v1/standard-toolsets?page=0', 'get'],
    ['a page size of 101 in the history', `${PAIR}/history?pageSize=101`, 'get'],
    ['an unknown query parameter', '/api/v1/standard-toolsets?x=1', 'get'],
  ])('turns away %s with 422', async (_name, path) => {
    app = await appFor(principal(['IT_ADMIN']));

    const response = await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer any').expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['no plan list', {}],
    ['plans that are not UUIDs', { planIds: ['x'], reason: 'r' }],
    ['more than a hundred plans', { planIds: Array.from({ length: 101 }, () => DEPARTMENT), reason: 'r' }],
    ['an unknown field', { planIds: [], reason: 'r', extra: 1 }],
    ['a reason over a thousand characters', { planIds: [], reason: 'x'.repeat(1001) }],
  ])('turns away a change with %s with 422', async (_name, body) => {
    app = await appFor(principal(['IT_ADMIN']));

    const response = await request(app.getHttpServer())
      .put(PAIR)
      .set('Authorization', 'Bearer any')
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([['/api/v1/standard-toolsets/suggestions'], ['/api/v1/standard-toolsets/recommended']])(
    'has no route that suggests tools, %s (AC-7)',
    async (path) => {
      app = await appFor(principal(['IT_ADMIN']));

      await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer any').expect(404);
    },
  );

  it('has no route that deletes a toolset (AC-7)', async () => {
    app = await appFor(principal(['IT_ADMIN']));

    await request(app.getHttpServer()).delete(PAIR).set('Authorization', 'Bearer any').expect(404);
  });
});
