import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  ['GET /handover-duties', (server) => request(server).get('/api/v1/handover-duties')],
  ['GET /handover-duties/{id}', (server) => request(server).get(`/api/v1/handover-duties/${ID}`)],
  [
    'POST /handover-duties/{id}/confirmations',
    (server) => request(server).post(`/api/v1/handover-duties/${ID}/confirmations`).send({ value: 'HANDLED' }),
  ],
];

describe('handover duty routes (e2e, no database)', () => {
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
    it.each([
      ['a handover id that is not an id', (server: App) => request(server).get('/api/v1/handover-duties/not-an-id')],
      ['a scope that does not exist', (server: App) => request(server).get('/api/v1/handover-duties?scope=everyone')],
      ['a state that does not exist', (server: App) => request(server).get('/api/v1/handover-duties?status=DONE')],
      [
        'an overdue flag that is not a flag',
        (server: App) => request(server).get('/api/v1/handover-duties?overdue=maybe'),
      ],
      ['a page size over the limit', (server: App) => request(server).get('/api/v1/handover-duties?pageSize=101')],
      [
        'a value the route does not know',
        (server: App) => request(server).post(`/api/v1/handover-duties/${ID}/confirmations`).send({ value: 'DONE' }),
      ],
      [
        'a confirmation with no value',
        (server: App) => request(server).post(`/api/v1/handover-duties/${ID}/confirmations`).send({}),
      ],
      [
        'a field the route does not know',
        (server: App) =>
          request(server).post(`/api/v1/handover-duties/${ID}/confirmations`).send({ value: 'HANDLED', note: 'x' }),
      ],
    ])('refuses %s with 422', async (_name, call) => {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(['EMPLOYEE'])))
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
