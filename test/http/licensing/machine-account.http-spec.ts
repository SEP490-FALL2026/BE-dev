import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const PATH = `/api/v1/license-assignments/${ID}/machine-account`;
const BODY = { isMachineAccount: true, note: 'Release pipeline' };

/** The route of the flag of a machine account (`QĐ-110m`, P13): the guards, the shape of the body and the id. The rest needs the database. */
describe('the flag of a machine account (HTTP contract, no database)', () => {
  let app: INestApplication<App>;
  const asIt = { Authorization: bearer(principal(['IT_ADMIN'])) };

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('is 401 without a token', async () => {
    const response = await request(app.getHttpServer()).post(PATH).send(BODY).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE']],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN']],
    ['an employee', ['EMPLOYEE']],
    ['an account with no role', []],
  ])('refuses %s with 403: only an IT Admin changes the flag', async (_name, roles) => {
    const response = await request(app.getHttpServer())
      .post(PATH)
      .set('Authorization', bearer(principal(roles)))
      .send(BODY)
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['an id that is not a UUID', '/api/v1/license-assignments/not-a-uuid/machine-account', BODY],
    ['the flag on without a note', PATH, { isMachineAccount: true }],
    ['the flag on with a blank note', PATH, { isMachineAccount: true, note: '   ' }],
    ['a note of 501 characters', PATH, { isMachineAccount: true, note: 'x'.repeat(501) }],
    ['a body with no flag', PATH, { note: 'Release pipeline' }],
    ['a flag that is not a boolean', PATH, { isMachineAccount: 'yes', note: 'Release pipeline' }],
    ['a field it does not know', PATH, { ...BODY, kind: 'SERVICE' }],
  ])('turns away %s, 422', async (_name, path, body) => {
    const response = await request(app.getHttpServer()).post(path).set(asIt).send(body).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
