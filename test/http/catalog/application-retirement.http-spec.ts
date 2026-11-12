import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const BASE = `/api/v1/applications/${ID}`;

describe('application retirement routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['get', `${BASE}/retirement`],
    ['post', `${BASE}/retire`],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head', ['MANAGER'], []],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s the retirement with 403', async (_name, direct, derived) => {
    const server = app.getHttpServer();

    const retire = await request(server)
      .post(`${BASE}/retire`)
      .set('Authorization', bearer(principal([...direct, ...derived])))
      .expect(403);

    expect(bodyOf(retire).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['an employee', ['EMPLOYEE']],
    ['a department head', ['MANAGER']],
    ['the Super Admin', ['SUPER_ADMIN']],
  ])(
    'refuses %s a look at the retirement of an application, which only the IT Admin and Finance have',
    async (_name, direct) => {
      await request(app.getHttpServer())
        .get(`${BASE}/retirement`)
        .set('Authorization', bearer(principal(direct)))
        .expect(403);
    },
  );

  it.each([
    ['an id that is not a UUID', 'post', '/api/v1/applications/not-a-uuid/retire', undefined],
    ['an id that is not a UUID in the look', 'get', '/api/v1/applications/not-a-uuid/retirement', undefined],
  ] as const)('turns away %s with 422', async (_name, method, path, body) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['IT_ADMIN'])));

    const response = await (body === undefined ? req : req.send(body)).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('has no route that confirms a retirement (`QĐ-111g`), brings a retired application back or creates revocations for it', async () => {
    const server = app.getHttpServer();

    await request(server)
      .post(`${BASE}/retirement-confirmations`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({ businessOwnerEmployeeId: ID, note: 'x' })
      .expect(404);
    await request(server)
      .post(`${BASE}/restore`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(404);
    await request(server)
      .delete(`${BASE}/retirement`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(404);
    await request(server)
      .post(`${BASE}/revoke-all`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(404);
  });

  it('has no route of the Business Owner any more (`QĐ-111g`, BO-DEL-1): the warnings and the owners of an application answer 404', async () => {
    const server = app.getHttpServer();

    for (const path of ['/api/v1/business-owner-warnings', `/api/v1/applications/${ID}/business-owners`]) {
      await request(server)
        .get(path)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .expect(404);
    }
  });
});
