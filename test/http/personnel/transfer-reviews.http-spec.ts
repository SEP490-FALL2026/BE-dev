import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  ['GET /transfer-reviews', (server) => request(server).get('/api/v1/transfer-reviews')],
  ['GET /transfer-reviews/{id}', (server) => request(server).get(`/api/v1/transfer-reviews/${ID}`)],
  ['GET /transfer-reviews/{id}/items', (server) => request(server).get(`/api/v1/transfer-reviews/${ID}/items`)],
  [
    'POST /transfer-reviews/{id}/decisions',
    (server) =>
      request(server)
        .post(`/api/v1/transfer-reviews/${ID}/decisions`)
        .send({ assignmentId: ID, decision: 'STILL_NEEDED' }),
  ],
];

describe('transfer review routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  describe('validation before any work (a signed-in person, whatever their role)', () => {
    const signedIn = bearer(principal(['EMPLOYEE']));
    const decide = (body: object) => (server: App) =>
      request(server).post(`/api/v1/transfer-reviews/${ID}/decisions`).send(body);

    it.each([
      ['a review id that is not an id', (server: App) => request(server).get('/api/v1/transfer-reviews/not-an-id')],
      [
        'an items list of a review that is not an id',
        (server: App) => request(server).get('/api/v1/transfer-reviews/not-an-id/items'),
      ],
      ['a state that does not exist', (server: App) => request(server).get('/api/v1/transfer-reviews?status=DONE')],
      [
        'an overdue flag that is not a flag',
        (server: App) => request(server).get('/api/v1/transfer-reviews?overdue=maybe'),
      ],
      [
        'a department that is not an id',
        (server: App) => request(server).get('/api/v1/transfer-reviews?departmentId=x'),
      ],
      ['a page size over the limit', (server: App) => request(server).get('/api/v1/transfer-reviews?pageSize=101')],
      [
        'an items page size over the limit',
        (server: App) => request(server).get(`/api/v1/transfer-reviews/${ID}/items?pageSize=101`),
      ],
      ['a decision the route does not know', decide({ assignmentId: ID, decision: 'MAYBE' })],
      ['the pending state as a decision', decide({ assignmentId: ID, decision: 'PENDING' })],
      ['a decision with no tool', decide({ decision: 'STILL_NEEDED', reason: 'x' })],
      ['a decision with no reason', decide({ assignmentId: ID, decision: 'STILL_NEEDED' })],
      ['a reason that is only blanks', decide({ assignmentId: ID, decision: 'NOT_NEEDED', reason: '   ' })],
      ['a reason that is too long', decide({ assignmentId: ID, decision: 'NOT_NEEDED', reason: 'x'.repeat(501) })],
      ['the retired decision of a new tool', decide({ assignmentId: ID, decision: 'NEEDS_NEW_TOOL', reason: 'x' })],
      [
        'the retired note of a new tool',
        decide({ assignmentId: ID, decision: 'STILL_NEEDED', reason: 'x', newToolNote: 'x' }),
      ],
      ['a field the route does not know', decide({ assignmentId: ID, decision: 'STILL_NEEDED', reason: 'x', term: 3 })],
    ])('refuses %s with 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set('Authorization', signedIn).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
