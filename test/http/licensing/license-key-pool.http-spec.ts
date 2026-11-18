import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const KEYS = '/api/v1/license-keys';
const TASKS = '/api/v1/provisioning-tasks';

/**
 * `BR-MF1-09` / `QĐ-103d` / `QĐ-103v` / Q-10 B, no database: the shape and the guard of the routes of the K4 key pool. The withdrawal of a
 * key is the IT Admin's alone and needs a reason; a key has two statuses (RETIRED is gone); a completion names a key by its id; the way a
 * K4 key goes back to the store is one of two.
 */
describe('the K4 key pool routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const asIt = (req: request.Test) => req.set('Authorization', bearer(principal(['IT_ADMIN'])));

  it('BR-MF1-09: answers 401 to the withdrawal of a key without a token', async () => {
    const response = await request(app.getHttpServer())
      .post(`${KEYS}/${ID}/withdrawal`)
      .send({ reason: 'Broken' })
      .expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE']],
    ['the department head', ['MANAGER']],
    ['an employee', ['EMPLOYEE']],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN']],
    ['an account with no role', []],
  ])('BR-MF1-09: refuses %s the withdrawal of a key with 403', async (_name, roles) => {
    const response = await request(app.getHttpServer())
      .post(`${KEYS}/${ID}/withdrawal`)
      .set('Authorization', bearer(principal(roles)))
      .send({ reason: 'Broken' })
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['a withdrawal with no reason', 'post', `${KEYS}/${ID}/withdrawal`, {}],
    ['a withdrawal with a blank reason', 'post', `${KEYS}/${ID}/withdrawal`, { reason: '   ' }],
    ['a withdrawal with a reason over 500 characters', 'post', `${KEYS}/${ID}/withdrawal`, { reason: 'x'.repeat(501) }],
    ['a withdrawal with a field the route does not know', 'post', `${KEYS}/${ID}/withdrawal`, { reason: 'x', at: 1 }],
    ['a withdrawal of an id that is not a UUID', 'post', `${KEYS}/not-a-uuid/withdrawal`, { reason: 'x' }],
    [
      'a list filtered by RETIRED, a status that is gone',
      'get',
      `${KEYS}?subscriptionId=${ID}&status=RETIRED`,
      undefined,
    ],
    [
      'a list filtered by withdrawn that is not true or false',
      'get',
      `${KEYS}?subscriptionId=${ID}&withdrawn=yes`,
      undefined,
    ],
    [
      'a completion naming a key that is not a UUID',
      'post',
      `${TASKS}/${ID}/complete`,
      { evidence: 'x', licenseKeyId: 'k' },
    ],
    [
      'a revocation completion with a way of the key that does not exist',
      'post',
      `${TASKS}/${ID}/revocation-completion`,
      { completion: 'KEY_DEACTIVATED', evidence: 'x', keyDisposition: 'DESTROY' },
    ],
    [
      'a revocation completion with a withdrawal reason over 500 characters',
      'post',
      `${TASKS}/${ID}/revocation-completion`,
      { completion: 'KEY_DEACTIVATED', evidence: 'x', keyDisposition: 'WITHDRAW', withdrawalReason: 'x'.repeat(501) },
    ],
  ] as const)('BR-MF1-09: turns away %s with 422', async (_name, method, path, body) => {
    const req = asIt(request(app.getHttpServer())[method](path));

    const response = await (body === undefined ? req : req.send(body)).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('BR-MF1-09: has no route that puts a withdrawn key back in the store or deletes one', async () => {
    const server = app.getHttpServer();

    await asIt(request(server).delete(`${KEYS}/${ID}/withdrawal`)).expect(404);
    await asIt(request(server).post(`${KEYS}/${ID}/restore`).send({})).expect(404);
    await asIt(request(server).patch(`${KEYS}/${ID}/withdrawal`).send({})).expect(404);
  });
});
