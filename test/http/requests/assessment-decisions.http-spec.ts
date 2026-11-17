import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const DEPARTMENT = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

/**
 * The routes IN-1.3 adds to the assessment queue (e2e, no database): the guard and what a query must carry, judged before anything is read. What
 * they hold for each IT Admin is proved by `assessment-decisions.integration-spec.ts`.
 */
describe.each([
  ['the proposals waiting, by department', '/api/v1/assessment-queue/departments', {}],
  ['the assessments decided', '/api/v1/assessment-decisions', { departmentId: DEPARTMENT }],
  ['the proposals waiting, filtered by department', '/api/v1/assessment-queue', { departmentId: DEPARTMENT }],
])('%s (e2e, no database)', (_name, url, validQuery) => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token', async () => {
    const response = await request(app.getHttpServer()).get(url).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the Super Admin, who never does business work', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['Finance', ['FINANCE'], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403', async (_who, direct, derived) => {
    const response = await request(app.getHttpServer())
      .get(url)
      .query(validQuery)
      .set('Authorization', bearer(principal([...direct, ...derived])))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['a page of 0', { page: 0 }],
    ['a page size of 101', { pageSize: 101 }],
    ['a query the route does not know', { state: 'COMPLETED' }],
    ['a person to filter by', { employeeId: DEPARTMENT }],
  ])('refuses %s with 422', async (_what, query) => {
    const response = await request(app.getHttpServer())
      .get(url)
      .query(query)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});

describe.each([
  ['the assessments decided', '/api/v1/assessment-decisions'],
  ['the proposals waiting, filtered by department', '/api/v1/assessment-queue'],
])('the department filter of %s (e2e, no database)', (_name, url) => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['a department that is not an id', 'design'],
    ['an empty department', ''],
  ])('refuses %s with 422', async (_what, departmentId) => {
    const response = await request(app.getHttpServer())
      .get(url)
      .query({ departmentId })
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
