import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

const principal = (direct: string[]) => ({
  subject: 'u1',
  appUserId: 'u1',
  sessionId: 's1',
  employeeId: 'e1',
  directRoles: direct,
  derivedRoles: [],
  roles: direct,
});

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

  async function appFor(identity: ReturnType<typeof principal> | null): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue({ verify: jest.fn().mockResolvedValue(identity) })
      .compile();
    const created = moduleRef.createNestApplication<INestApplication<App>>();
    configureApplication(created, { mountDocs: false });
    await created.init();

    return created;
  }

  afterEach(async () => {
    await app?.close();
  });

  it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
    app = await appFor(principal([]));

    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  describe('validation before any work (a signed-in person, whatever their role)', () => {
    const signedIn = { Authorization: 'Bearer any' };
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
      ['a decision with no tool', decide({ decision: 'STILL_NEEDED' })],
      [
        'a note with a decision that takes none',
        decide({ assignmentId: ID, decision: 'NOT_NEEDED', newToolNote: 'x' }),
      ],
      [
        'a note that is too long',
        decide({ assignmentId: ID, decision: 'NEEDS_NEW_TOOL', newToolNote: 'x'.repeat(501) }),
      ],
      ['a field the route does not know', decide({ assignmentId: ID, decision: 'STILL_NEEDED', reason: 'x' })],
    ])('refuses %s with 422', async (_name, call) => {
      app = await appFor(principal(['EMPLOYEE']));

      const response = await call(app.getHttpServer()).set(signedIn).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
