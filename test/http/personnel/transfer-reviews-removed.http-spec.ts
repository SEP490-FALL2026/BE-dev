import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

type Call = (server: App) => request.Test;

/**
 * The routes of the review after a transfer and of the closing by the IT Admin are gone, with no answer of their own: they answer 404 like any
 * route that does not exist (`QĐ-110p`, `QĐ-110r`, `QĐ-87h`(3)). The new head decides nothing about the rights of the old department: they are taken back
 * when the grace ends, and the system closes the transfer.
 */
const REMOVED: Array<[string, Call]> = [
  [
    'POST /department-transfers/{id}/closure',
    (s) => request(s).post(`/api/v1/department-transfers/${ID}/closure`).send({}),
  ],
  ['GET /transfer-reviews', (s) => request(s).get('/api/v1/transfer-reviews')],
  ['GET /transfer-reviews/{id}', (s) => request(s).get(`/api/v1/transfer-reviews/${ID}`)],
  ['GET /transfer-reviews/{id}/items', (s) => request(s).get(`/api/v1/transfer-reviews/${ID}/items`)],
  [
    'POST /transfer-reviews/{id}/decisions',
    (s) =>
      request(s)
        .post(`/api/v1/transfer-reviews/${ID}/decisions`)
        .send({ assignmentId: ID, decision: 'NOT_NEEDED', reason: 'No longer needed' }),
  ],
];

describe('the routes of the review after a transfer (HTTP contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(REMOVED)('%s answers 404: the route does not exist any more', async (_name, call) => {
    for (const roles of [['IT_ADMIN'], ['EMPLOYEE'], ['SUPER_ADMIN'], ['MANAGER']]) {
      await call(app.getHttpServer())
        .set('Authorization', bearer(principal(roles)))
        .expect(404);
    }
  });
});
