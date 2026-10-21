import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const KEYS = '/api/v1/license-keys';
const KEY = 'KEY-SECRET-0001-ABCDE-12345';

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

describe('license key vault routes (e2e, no database)', () => {
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
    ['post', `${KEYS}/imports`],
    ['get', `${KEYS}?subscriptionId=${ID}`],
    ['post', `${KEYS}/${ID}/reveal`],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    app = await appFor(null);

    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the department head', ['MANAGER'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ['an account with no role', [], []],
  ])('refuses %s every route of the vault with 403, and no answer holds a key', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', 'Bearer any');

    for (const response of [
      await as(
        request(server)
          .post(`${KEYS}/imports`)
          .send({ subscriptionId: ID, keys: [KEY] }),
      ),
      await as(request(server).get(`${KEYS}?subscriptionId=${ID}`)),
      await as(request(server).post(`${KEYS}/${ID}/reveal`)),
    ]) {
      expect(response.status).toBe(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      expect(JSON.stringify(response.body)).not.toContain(KEY);
    }
  });

  it.each([
    ['an import with no purchase', 'post', `${KEYS}/imports`, { keys: [KEY] }],
    ['an import with a purchase that is not a UUID', 'post', `${KEYS}/imports`, { subscriptionId: 'x', keys: [KEY] }],
    ['an import with no key', 'post', `${KEYS}/imports`, { subscriptionId: ID, keys: [] }],
    ['an import of keys that is not a list', 'post', `${KEYS}/imports`, { subscriptionId: ID, keys: KEY }],
    ['an import of a key that is not text', 'post', `${KEYS}/imports`, { subscriptionId: ID, keys: [1] }],
    [
      'an import of more than 1000 keys',
      'post',
      `${KEYS}/imports`,
      { subscriptionId: ID, keys: Array.from({ length: 1001 }, (_, index) => `KEY-${index}-ABCDE`) },
    ],
    [
      'an import with a field the route does not know',
      'post',
      `${KEYS}/imports`,
      { subscriptionId: ID, keys: [KEY], x: 1 },
    ],
    ['a list with no purchase', 'get', KEYS, undefined],
    ['a list of a purchase that is not a UUID', 'get', `${KEYS}?subscriptionId=x`, undefined],
    ['a list with a status that does not exist', 'get', `${KEYS}?subscriptionId=${ID}&status=LOST`, undefined],
    ['a list with a page size over 100', 'get', `${KEYS}?subscriptionId=${ID}&pageSize=101`, undefined],
    ['a reveal of an id that is not a UUID', 'post', `${KEYS}/not-a-uuid/reveal`, undefined],
  ] as const)('turns away %s with 422, and no answer holds a key', async (_name, method, path, body) => {
    app = await appFor(principal(['IT_ADMIN']));
    const req = request(app.getHttpServer())[method](path).set('Authorization', 'Bearer any');

    const response = await (body === undefined ? req : req.send(body)).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain(KEY);
  });

  it('has no route that deletes, rewrites or exports a key, or reads one with a GET', async () => {
    app = await appFor(principal(['IT_ADMIN']));
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', 'Bearer any');

    await as(request(server).delete(`${KEYS}/${ID}`)).expect(404);
    await as(request(server).patch(`${KEYS}/${ID}`).send({})).expect(404);
    await as(request(server).get(`${KEYS}/${ID}`)).expect(404);
    await as(request(server).get(`${KEYS}/${ID}/reveal`)).expect(404);
    await as(request(server).get(`${KEYS}/export`)).expect(404);
  });
});
