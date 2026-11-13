import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const APP = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';
const PROPOSALS = '/api/v1/department-software-proposals';

describe('the proposals to add to the list of software of a department (e2e, no database)', () => {
  let app: INestApplication<App>;
  const as = (roles: string[]) => ({ Authorization: bearer(principal(roles)) });

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['proposing', 'post', PROPOSALS],
    ['the list', 'get', PROPOSALS],
    ['an acceptance', 'post', `${PROPOSALS}/${ID}/acceptance`],
    ['a rejection', 'post', `${PROPOSALS}/${ID}/rejection`],
  ] as const)('without a token %s is 401', async (_name, method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['an employee', ['EMPLOYEE']],
    ['an IT Admin, who decides and does not propose', ['IT_ADMIN']],
    ['the Super Admin', ['SUPER_ADMIN']],
    ['Finance', ['FINANCE']],
    ['an account with no role', []],
  ])('refuses %s with 403: only the head of a department proposes', async (_name, roles) => {
    const response = await request(app.getHttpServer())
      .post(PROPOSALS)
      .set(as(roles))
      .send({ applicationId: APP, reason: 'The team needs it' })
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['an employee', ['EMPLOYEE']],
    ['the Super Admin', ['SUPER_ADMIN']],
    ['Finance', ['FINANCE']],
  ])('refuses %s with 403: only an IT Admin or a head reads the proposals', async (_name, roles) => {
    const response = await request(app.getHttpServer()).get(PROPOSALS).set(as(roles)).expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['an employee', ['EMPLOYEE']],
    ['a department head, who proposes and does not decide', ['MANAGER']],
    ['the Super Admin', ['SUPER_ADMIN']],
    ['Finance', ['FINANCE']],
  ])('refuses %s with 403: only an IT Admin accepts or rejects', async (_name, roles) => {
    for (const [path, body] of [
      [`${PROPOSALS}/${ID}/acceptance`, {}],
      [`${PROPOSALS}/${ID}/rejection`, { reason: 'No need' }],
    ] as const) {
      const response = await request(app.getHttpServer()).post(path).set(as(roles)).send(body).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each([
    ['no reason', { applicationId: APP }],
    ['a blank reason', { applicationId: APP, reason: '   ' }],
    ['a reason of 501 characters', { applicationId: APP, reason: 'x'.repeat(501) }],
    ['an application that is not a UUID', { applicationId: 'excel', reason: 'The team needs it' }],
    ['a plan that is not a UUID', { applicationId: APP, planId: 'pro', reason: 'The team needs it' }],
    [
      'a department in the body: the head proposes for their own',
      { applicationId: APP, departmentId: ID, reason: 'x' },
    ],
    ['a field it does not know', { applicationId: APP, reason: 'The team needs it', price: 1 }],
    ['an empty body', {}],
  ])('turns away a proposal with %s, 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(PROPOSALS)
      .set(as(['MANAGER']))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['no reason', {}],
    ['a blank reason', { reason: '  ' }],
    ['a reason of 501 characters', { reason: 'x'.repeat(501) }],
    ['a field it does not know', { reason: 'No need', accept: true }],
  ])('turns away a rejection with %s, 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(`${PROPOSALS}/${ID}/rejection`)
      .set(as(['IT_ADMIN']))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['an acceptance', 'acceptance'],
    ['a rejection', 'rejection'],
  ])('turns away an id that is not a UUID on %s, 422', async (_name, action) => {
    const response = await request(app.getHttpServer())
      .post(`${PROPOSALS}/not-a-uuid/${action}`)
      .set(as(['IT_ADMIN']))
      .send({ reason: 'No need' })
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['page 0', '?page=0'],
    ['a page size of 101', '?pageSize=101'],
    ['a state it does not have', '?state=OPEN'],
    ['a department that is not a UUID', '?departmentId=design'],
    ['an unknown parameter', '?x=1'],
  ])('turns away %s on the list, 422', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get(`${PROPOSALS}${query}`)
      .set(as(['IT_ADMIN']))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
