import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const id = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
describe('retired project routes', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createHttpContractApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each([
    ['get', '/api/v1/projects'],
    ['post', '/api/v1/projects'],
    ['get', `/api/v1/projects/${id}`],
    ['patch', `/api/v1/projects/${id}`],
  ] as const)('%s %s returns 404', async (method, path) => {
    await request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .send({})
      .expect(404);
  });
});
