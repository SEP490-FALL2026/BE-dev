import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const URL = '/api/v1/grant-queue';

/**
 * The queue of approved requests (`grantQueueList`, `QĐ-111m`): the guard, and what a query must carry, judged before anything is read
 * (e2e, no database). What the queue holds for each IT Admin, and where each grant stands, is proved by
 * `grant-queue.integration-spec.ts`.
 */
describe('the queue of approved requests to carry out (e2e, no database)', () => {
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
    ['a department head, whose role is derived', [], ['MANAGER']],
  ])('refuses %s with 403', async (_name, direct, derived) => {
    const response = await request(app.getHttpServer())
      .get(URL)
      .set('Authorization', bearer(principal([...direct, ...derived])))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['a state the queue does not know', { state: 'COMPLETED' }],
    ['a state in lower case', { state: 'waiting' }],
    ['a plan that is not an id', { planId: 'figma' }],
    ['a person that is not an id', { beneficiaryEmployeeId: 'lan' }],
    ['a department, which the server takes from who asks', { departmentId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' }],
    ['a page of 0', { page: 0 }],
    ['a page size of 101', { pageSize: 101 }],
  ])('refuses listing with %s with 422', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get(URL)
      .query(query)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
