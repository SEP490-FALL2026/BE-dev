import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const URL = '/api/v1/assessment-queue';

/**
 * The list of the proposals that wait for IT assessment (`assessmentQueueList`, `B-04`): the guard, and what a query must carry,
 * judged before anything is read (e2e, no database). What the list holds for each IT Admin is proved by
 * `assessment-queue.integration-spec.ts`.
 */
describe('the proposals waiting for IT assessment (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token', async () => {
    const response = await request(app.getHttpServer()).get(URL).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the Super Admin, who never does business work', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['Finance', ['FINANCE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403', async (_name, direct, derived) => {
    const response = await request(app.getHttpServer())
      .get(URL)
      .set('Authorization', bearer(principal(direct, derived)))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['a page of 0', { page: 0 }],
    ['a page that is not a number', { page: 'first' }],
    ['a page size of 101', { pageSize: 101 }],
    ['a page size of 0', { pageSize: 0 }],
    ['a query the route does not know', { state: 'COMPLETED' }],
    ['a filter by person', { employeeId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' }],
  ])('refuses listing with %s with 422', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get(URL)
      .query(query)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
