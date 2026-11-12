import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

describe('IT Admin directory route (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('QĐ-111g: answers 401 without a token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/it-admins').expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE']],
    ['an employee', ['EMPLOYEE']],
    ['a department head', ['MANAGER']],
    ['the spending approver', ['SPENDING_APPROVER']],
  ])('refuses %s with 403: only an IT Admin or the Super Admin reads it', async (_name, roles) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/it-admins')
      .set('Authorization', bearer(principal(roles)))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['page 0', '?page=0'],
    ['a page size of 101', '?pageSize=101'],
    ['a search over 100 characters', `?search=${'x'.repeat(101)}`],
    ['an unknown parameter', '?role=IT_ADMIN'],
  ])('turns away %s with 422', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/it-admins${query}`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
