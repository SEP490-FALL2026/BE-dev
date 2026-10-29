import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

describe('department tools route (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('without a token is 401', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/departments/${ID}/tools-in-use`).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])(
    'refuses %s with 403: only the IT Admin and a department head read the tools of a department',
    async (_name, direct, derived) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/departments/${ID}/tools-in-use`)
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    },
  );

  it.each([
    ['an id that is not a UUID', '/api/v1/departments/not-a-uuid/tools-in-use'],
    ['page 0', `/api/v1/departments/${ID}/tools-in-use?page=0`],
    ['a page size of 101', `/api/v1/departments/${ID}/tools-in-use?pageSize=101`],
    ['an unknown parameter', `/api/v1/departments/${ID}/tools-in-use?x=1`],
  ])('turns away %s, 422', async (_name, path) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
