import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

/**
 * `BM-10` is a file and an amount, and a version is one figure for the year (B-6): the routes of the lines of a proposal, of the lines
 * of a version, of their file and of the lines of the budget of a department are gone, whoever calls them.
 */
describe('the routes of the budget lines (HTTP contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['list the lines of a proposal', 'get', `/api/v1/budget-proposals/${ID}/lines`, 'MANAGER'],
    ['list the lines of a version', 'get', `/api/v1/budget-versions/${ID}/lines`, 'FINANCE'],
    ['add lines to a version', 'post', `/api/v1/budget-versions/${ID}/lines`, 'FINANCE'],
    ['change a line of a version', 'put', `/api/v1/budget-versions/${ID}/lines/1`, 'FINANCE'],
    ['load lines into a version from a file', 'post', `/api/v1/budget-versions/${ID}/imports`, 'FINANCE'],
    ['list the lines of the budget of my department', 'get', '/api/v1/budgets/mine/lines?year=2027', 'MANAGER'],
  ] as const)('no longer has the route to %s (B-6)', async (_name, method, path, role) => {
    await request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal([role])))
      .expect(404);
  });
});
