import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

describe('Business Owner routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['GET /business-owner-warnings', '/api/v1/business-owner-warnings'],
    ['GET /applications/{id}/business-owners', `/api/v1/applications/${ID}/business-owners`],
  ])('%s without a token is 401', async (_name, path) => {
    const response = await request(app.getHttpServer()).get(path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s the alert that a Business Owner has left with 403', async (_name, direct, derived) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/business-owner-warnings')
      .set('Authorization', bearer(principal([...direct, ...derived])))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['the Super Admin', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head', [], ['MANAGER']],
  ])('refuses %s the history of Business Owners with 403', async (_name, direct, derived) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/applications/${ID}/business-owners`)
      .set('Authorization', bearer(principal([...direct, ...derived])))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  describe('validation', () => {
    const asIt = () => ({ Authorization: bearer(principal(['IT_ADMIN'])) });

    it.each([
      ['page 0', '/api/v1/business-owner-warnings?page=0'],
      ['a page size of 101', '/api/v1/business-owner-warnings?pageSize=101'],
      ['an unknown parameter', '/api/v1/business-owner-warnings?x=1'],
      ['a history of an id that is not a UUID', '/api/v1/applications/not-a-uuid/business-owners'],
    ])('turns away %s, 422', async (_name, path) => {
      const response = await request(app.getHttpServer()).get(path).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('nothing is deleted or granted', () => {
    it('has no route that deletes a Business Owner period or that grants or revokes the owner as a role: 404', async () => {
      for (const [method, path] of [
        ['delete', `/api/v1/applications/${ID}/business-owners`],
        ['post', `/api/v1/applications/${ID}/business-owners`],
        ['post', `/api/v1/business-owner-warnings/${ID}/closures`],
      ] as const) {
        const response = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', bearer(principal(['IT_ADMIN'])))
          .expect(404);
        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
