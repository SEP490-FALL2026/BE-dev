import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '7a1c3e55-2d4b-4c8e-9f60-1b2c3d4e5f60';
const WORK = '9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

type Call = (server: App) => request.Test;

const SUPER_ADMIN_ONLY: Array<[string, Call]> = [
  [
    'POST /unplaced-work-designations',
    (server) =>
      request(server)
        .post('/api/v1/unplaced-work-designations')
        .send({
          employeeId: ID,
          designeeEmployeeId: OTHER,
          reason: 'Cover unplaced employee work',
          works: [{ workKind: 'PROVISIONING_TASK', workId: WORK }],
        }),
  ],
  [
    'POST /unplaced-work-designations/{id}/end',
    (server) => request(server).post(`/api/v1/unplaced-work-designations/${ID}/end`).send(),
  ],
];

const LIST: [string, Call] = [
  'GET /unplaced-work-designations',
  (server) => request(server).get('/api/v1/unplaced-work-designations'),
];

describe('unplaced-work designation routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([...SUPER_ADMIN_ONLY, LIST])('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each(['IT_ADMIN', 'FINANCE', 'EMPLOYEE', 'MANAGER'])(
    'refuses %s on Super Admin designation write routes with 403',
    async (role) => {
      for (const [route, call] of SUPER_ADMIN_ONLY) {
        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal([role])))
          .expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    },
  );

  it.each(['FINANCE', 'EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER'])(
    'refuses %s on GET /unplaced-work-designations with 403',
    async (role) => {
      const response = await LIST[1](app.getHttpServer())
        .set('Authorization', bearer(principal([role])))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    },
  );

  it('refuses duplicate (workKind, workId) pairs, empty works, and invalid pageSize with 422 VALIDATION_ERROR', async () => {
    const token = bearer(principal(['SUPER_ADMIN']));

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/unplaced-work-designations')
      .set('Authorization', token)
      .send({
        employeeId: ID,
        designeeEmployeeId: OTHER,
        reason: 'Duplicate pair',
        works: [
          { workKind: 'PROVISIONING_TASK', workId: WORK },
          { workKind: 'PROVISIONING_TASK', workId: WORK },
        ],
      })
      .expect(422);
    expect(bodyOf(duplicate).error.code).toBe('VALIDATION_ERROR');

    const emptyWorks = await request(app.getHttpServer())
      .post('/api/v1/unplaced-work-designations')
      .set('Authorization', token)
      .send({
        employeeId: ID,
        designeeEmployeeId: OTHER,
        reason: 'Empty works',
        works: [],
      })
      .expect(422);
    expect(bodyOf(emptyWorks).error.code).toBe('VALIDATION_ERROR');

    const badPageSize = await request(app.getHttpServer())
      .get('/api/v1/unplaced-work-designations?pageSize=101')
      .set('Authorization', token)
      .expect(422);
    expect(bodyOf(badPageSize).error.code).toBe('VALIDATION_ERROR');
  });
});
