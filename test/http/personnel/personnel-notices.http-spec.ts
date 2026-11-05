import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const GROUNDS = { type: 'HR_DECISION', reference: 'QD-12/2026', issuer: 'HR Department', issuedOn: '2026-10-01' };
const VERIFICATION = { method: 'ATTACHED_DOCUMENT', reference: 'Resignation letter 31/10' };

type Call = (server: App) => request.Test;
type Who = 'HEAD' | 'SUPER_ADMIN' | 'EITHER';

const SEND = { employeeId: ID, kind: 'DEPARTURE', proposedOn: '2026-10-30' };

const ROUTES: Array<[string, Who, Call]> = [
  ['POST /personnel-notices', 'HEAD', (server) => request(server).post('/api/v1/personnel-notices').send(SEND)],
  ['GET /personnel-notices', 'EITHER', (server) => request(server).get('/api/v1/personnel-notices')],
  ['GET /personnel-notices/{id}', 'EITHER', (server) => request(server).get(`/api/v1/personnel-notices/${ID}`)],
  [
    'POST /personnel-notices/{id}/withdrawal',
    'HEAD',
    (server) => request(server).post(`/api/v1/personnel-notices/${ID}/withdrawal`),
  ],
  [
    'POST /personnel-notices/{id}/rejection',
    'SUPER_ADMIN',
    (server) => request(server).post(`/api/v1/personnel-notices/${ID}/rejection`).send({ reason: 'Duplicate event' }),
  ],
  [
    'POST /personnel-notices/{id}/recording',
    'SUPER_ADMIN',
    (server) =>
      request(server)
        .post(`/api/v1/personnel-notices/${ID}/recording`)
        .send({ verification: VERIFICATION, grounds: GROUNDS, event: { lastWorkingDay: '2026-10-31' } }),
  ],
  [
    'POST /personnel-notices/{id}/linking',
    'SUPER_ADMIN',
    (server) =>
      request(server).post(`/api/v1/personnel-notices/${ID}/linking`).send({ eventId: ID, verification: VERIFICATION }),
  ],
];

describe('personnel notice routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('who may call which route (US-03-10 AC-9, US-03-11 AC-8)', () => {
    it.each(ROUTES)('%s without a token is 401', async (_name, _who, call) => {
      const response = await call(app.getHttpServer()).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['the Super Admin, who handles notices but never sends one', ['SUPER_ADMIN'], [], ['HEAD']],
      ['the finance officer', ['FINANCE'], [], ['HEAD', 'SUPER_ADMIN', 'EITHER']],
      ['an employee', ['EMPLOYEE'], [], ['HEAD', 'SUPER_ADMIN', 'EITHER']],
      ['the spending approver, who is not a head', [], ['SPENDING_APPROVER'], ['HEAD', 'SUPER_ADMIN', 'EITHER']],
      [
        'an IT Admin, who reads a minimal projection and handles nothing (F40, F12)',
        ['IT_ADMIN'],
        [],
        ['HEAD', 'SUPER_ADMIN'],
      ],
      ['a department head', [], ['MANAGER'], ['SUPER_ADMIN']],
    ])('refuses %s on the routes it does not own with 403', async (_name, direct, derived, refusedOn) => {
      for (const [route, who, call] of ROUTES) {
        if (!refusedOn.includes(who)) continue;
        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal([...direct, ...derived])))
          .expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });
  });

  describe('validation before any work', () => {
    const asHead = () => ({ Authorization: bearer(principal(['MANAGER'])) });
    const asSuperAdmin = () => ({ Authorization: bearer(principal(['SUPER_ADMIN'])) });

    it.each([
      ['no day proposed', { employeeId: ID, kind: 'DEPARTURE' }],
      ['a kind that does not exist', { ...SEND, kind: 'PROMOTION' }],
      ['a day that is not a date', { ...SEND, proposedOn: '30/10/2026' }],
      ['an employee that is not an id', { ...SEND, employeeId: 'E1' }],
      ['a reason for leaving, which the form does not have', { ...SEND, reason: 'Better offer' }],
      ['a note over 500 characters', { ...SEND, note: 'x'.repeat(501) }],
    ])('refuses to send with %s with 422', async (_name, payload) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/personnel-notices')
        .set(asHead())
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a rejection with no reason', '/rejection', {}],
      ['a rejection with an empty reason', '/rejection', { reason: '' }],
      ['a recording with no verification', '/recording', { grounds: GROUNDS, event: { lastWorkingDay: '2026-10-31' } }],
      [
        'a recording with a verification method that does not exist',
        '/recording',
        { verification: { method: 'RUMOUR', reference: 'x' }, event: {} },
      ],
      [
        'a recording with a field the event does not have',
        '/recording',
        { verification: VERIFICATION, event: { reason: 'x' } },
      ],
      [
        'a recording with no basis',
        '/recording',
        { verification: VERIFICATION, event: { lastWorkingDay: '2026-10-31' } },
      ],
      [
        'a recording with a basis of a kind outside the list',
        '/recording',
        {
          verification: VERIFICATION,
          grounds: { ...GROUNDS, type: 'DECISION' },
          event: { lastWorkingDay: '2026-10-31' },
        },
      ],
      [
        'a recording with the retired reason to cancel a transfer',
        '/recording',
        {
          verification: VERIFICATION,
          grounds: GROUNDS,
          event: { lastWorkingDay: '2026-10-31', pendingTransferCancellation: { reason: 'x' } },
        },
      ],
      ['a link with no event', '/linking', { verification: VERIFICATION }],
    ])('refuses %s with 422', async (_name, path, payload) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/personnel-notices/${ID}${path}`)
        .set(asSuperAdmin())
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a notice id that is not an id', (server: App) => request(server).get('/api/v1/personnel-notices/not-an-id')],
      ['a state that does not exist', (server: App) => request(server).get('/api/v1/personnel-notices?status=DONE')],
      ['a flag that is not true or false', (server: App) => request(server).get('/api/v1/personnel-notices?overdue=x')],
      ['a page size over the limit', (server: App) => request(server).get('/api/v1/personnel-notices?pageSize=101')],
    ])('refuses %s with 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asSuperAdmin()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
