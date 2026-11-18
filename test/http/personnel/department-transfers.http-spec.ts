import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const NOTE = 'Quyết định số QD-12/2026 của phòng Nhân sự';

type Call = (server: App) => request.Test;

/** The roles the guard of each route lets through: the Super Admin writes (`QĐ-87a`), the IT Admin reads a minimal projection (F12). */
const WRITERS = ['SUPER_ADMIN'] as const;
const READERS = ['SUPER_ADMIN', 'IT_ADMIN'] as const;

const ROUTES: Array<[string, Call, readonly string[]]> = [
  [
    'POST /department-transfers',
    (server) =>
      request(server)
        .post('/api/v1/department-transfers')
        .send({ employeeId: ID, toDepartmentId: ID, effectiveOn: '2026-12-01', groundsNote: NOTE }),
    WRITERS,
  ],
  ['GET /department-transfers', (server) => request(server).get('/api/v1/department-transfers'), READERS],
  ['GET /department-transfers/{id}', (server) => request(server).get(`/api/v1/department-transfers/${ID}`), READERS],
  [
    'GET /department-transfers/{id}/changes',
    (server) => request(server).get(`/api/v1/department-transfers/${ID}/changes`),
    WRITERS,
  ],
  [
    'POST /department-transfers/{id}/rescheduling',
    (server) =>
      request(server)
        .post(`/api/v1/department-transfers/${ID}/rescheduling`)
        .send({ newEffectiveOn: '2026-12-15', reason: 'Later', groundsNote: NOTE }),
    WRITERS,
  ],
  [
    'POST /department-transfers/{id}/cancellation',
    (server) =>
      request(server).post(`/api/v1/department-transfers/${ID}/cancellation`).send({ reason: 'No', groundsNote: NOTE }),
    WRITERS,
  ],
];

describe('department transfer routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('every route needs a signed-in person of the role that may use it (US-03-01 AC-14; F40, F12)', () => {
    it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
      const response = await call(app.getHttpServer()).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['the Super Admin', ['SUPER_ADMIN'], []],
      ['the IT Admin', ['IT_ADMIN'], []],
      ['the finance officer', ['FINANCE'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head, whose role is derived', [], ['MANAGER']],
      ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ])('refuses %s on the routes it is not for with 403', async (_name, direct, derived) => {
      for (const [route, call, allowed] of ROUTES) {
        if (allowed.some((role) => (direct as string[]).includes(role))) continue;
        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal([...direct, ...derived])))
          .expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });

    it('refuses the IT Admin on record, move, cancel and the list of moves, and lets it through to read (F40, F12)', async () => {
      for (const [route, call, allowed] of ROUTES) {
        const response = await call(app.getHttpServer()).set('Authorization', bearer(principal(['IT_ADMIN'])));
        const refused = response.status === 403 && bodyOf(response).error.code === 'AUTHORIZATION.FORBIDDEN';
        expect({ route, refused }).toEqual({ route, refused: !allowed.includes('IT_ADMIN') });
      }
    });
  });

  describe('validation before any work', () => {
    const asAdmin = () => ({ Authorization: bearer(principal(['SUPER_ADMIN'])) });

    it.each([
      ['no day', { employeeId: ID, toDepartmentId: ID, groundsNote: NOTE }],
      [
        'a day that is not a date',
        { employeeId: ID, toDepartmentId: ID, effectiveOn: '31/12/2026', groundsNote: NOTE },
      ],
      ['an employee that is not an id', { employeeId: 'E1', toDepartmentId: ID, effectiveOn: '2026-12-01' }],
      ['no basis', { employeeId: ID, toDepartmentId: ID, effectiveOn: '2026-12-01' }],
      [
        'the old four-part basis',
        {
          employeeId: ID,
          toDepartmentId: ID,
          effectiveOn: '2026-12-01',
          grounds: { type: 'HR_DECISION', reference: 'X' },
        },
      ],
      ['a blank basis', { employeeId: ID, toDepartmentId: ID, effectiveOn: '2026-12-01', groundsNote: '  ' }],
      [
        'a basis of 501 characters',
        { employeeId: ID, toDepartmentId: ID, effectiveOn: '2026-12-01', groundsNote: 'a'.repeat(501) },
      ],
      ['a field the route does not know', { employeeId: ID, effectiveOn: '2026-12-01', note: 'x' }],
      ['a successor of no kind', { employeeId: ID, effectiveOn: '2026-12-01', successor: { kind: 'SOMEONE' } }],
    ])('refuses %s with 422', async (_name, payload) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/department-transfers')
        .set(asAdmin())
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      [
        'a transfer id that is not an id',
        (server: App) => request(server).get('/api/v1/department-transfers/not-an-id'),
      ],
      ['a state that does not exist', (server: App) => request(server).get('/api/v1/department-transfers?status=DONE')],
      ['a page size over the limit', (server: App) => request(server).get('/api/v1/department-transfers?pageSize=101')],
      [
        'a day the grace ends before that is not a date',
        (server: App) => request(server).get('/api/v1/department-transfers?graceEndsBefore=soon'),
      ],
      [
        'a day the grace ends from that is not a date',
        (server: App) => request(server).get('/api/v1/department-transfers?graceEndsFrom=2026-02-30x'),
      ],
      [
        'a new day that is not a date',
        (server: App) =>
          request(server).post(`/api/v1/department-transfers/${ID}/rescheduling`).send({ newEffectiveOn: 'tomorrow' }),
      ],
      [
        'a rescheduling without a reason',
        (server: App) =>
          request(server)
            .post(`/api/v1/department-transfers/${ID}/rescheduling`)
            .send({ newEffectiveOn: '2026-12-15', groundsNote: NOTE }),
      ],
      [
        'a rescheduling without a basis',
        (server: App) =>
          request(server)
            .post(`/api/v1/department-transfers/${ID}/rescheduling`)
            .send({ newEffectiveOn: '2026-12-15', reason: 'Later' }),
      ],
      [
        'a cancellation without a reason',
        (server: App) =>
          request(server).post(`/api/v1/department-transfers/${ID}/cancellation`).send({ groundsNote: NOTE }),
      ],
      [
        'a cancellation without a basis',
        (server: App) => request(server).post(`/api/v1/department-transfers/${ID}/cancellation`).send({ reason: 'No' }),
      ],
    ])('refuses %s with 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asAdmin()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('the transfer of the person who asks, while the grace lasts (P8, QĐ-110p)', () => {
    it('is closed to a request with no token: 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/me/department-transfer').expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['the Super Admin', ['SUPER_ADMIN'], []],
      ['the IT Admin', ['IT_ADMIN'], []],
      ['the finance officer', ['FINANCE'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head, whose role is derived', [], ['MANAGER']],
      ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ])(
      'lets %s past the guard: it asks for no role and is only ever about the account that asks',
      async (_name, direct, derived) => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/me/department-transfer')
          .set('Authorization', bearer(principal([...direct, ...derived])));

        expect([401, 403]).not.toContain(response.status);
      },
    );
  });
});
