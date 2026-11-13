import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';
const LIST = `/api/v1/departments/${ID}/software-list`;
const CHANGES = `${LIST}/changes`;
const ME = '/api/v1/me/department-software-list';

describe('the list of software of a department (e2e, no database)', () => {
  let app: INestApplication<App>;
  const as = (roles: string[]) => ({ Authorization: bearer(principal(roles)) });

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['the list of a department', 'get', LIST],
    ['the changes of the list', 'post', CHANGES],
    ['the list of my department', 'get', ME],
  ] as const)('without a token %s is 401', async (_name, method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['an employee', ['EMPLOYEE']],
    ['a department head', ['MANAGER']],
    ['the Super Admin, who reads the list and does not write it', ['SUPER_ADMIN']],
    ['Finance', ['FINANCE']],
    ['an account with no role', []],
  ])('refuses %s with 403: only an IT Admin changes the list', async (_name, roles) => {
    const response = await request(app.getHttpServer())
      .post(CHANGES)
      .set(as(roles))
      .send({ add: [{ applicationId: OTHER }] })
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['an id that is not a UUID', '/api/v1/departments/not-a-uuid/software-list'],
    ['page 0', `${LIST}?page=0`],
    ['a page size of 101', `${LIST}?pageSize=101`],
    ['an unknown parameter', `${LIST}?x=1`],
  ])('turns away %s on the list of a department, 422', async (_name, path) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set(as(['IT_ADMIN']))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['page 0', `${ME}?page=0`],
    ['a page size of 101', `${ME}?pageSize=101`],
    ['an unknown parameter', `${ME}?departmentId=${ID}`],
  ])('turns away %s on the list of my department, 422 (nobody names another department)', async (_name, path) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set(as(['EMPLOYEE']))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  const place = (index: number) => ({ applicationId: `3f0c7d54-9e1b-4f6a-8d2c-${String(index).padStart(12, '0')}` });
  it.each([
    ['an empty body', {}],
    ['empty lists', { add: [], remove: [] }],
    ['more than 50 places to add', { add: Array.from({ length: 51 }, (_, index) => place(index)) }],
    [
      'more than 50 entries to take out',
      { remove: Array.from({ length: 51 }, (_, index) => place(index).applicationId) },
    ],
    ['the same place twice', { add: [{ applicationId: OTHER }, { applicationId: OTHER, planId: null }] }],
    ['the same entry twice', { remove: [OTHER, OTHER] }],
    ['an application that is not a UUID', { add: [{ applicationId: 'excel' }] }],
    ['a blank note', { add: [{ applicationId: OTHER, note: '   ' }] }],
    ['a note of 501 characters', { add: [{ applicationId: OTHER, note: 'x'.repeat(501) }] }],
    ['a field it does not know', { add: [{ applicationId: OTHER, price: 1 }] }],
    ['an unknown key', { add: [{ applicationId: OTHER }], extra: true }],
  ])('turns away %s, 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(CHANGES)
      .set(as(['IT_ADMIN']))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
