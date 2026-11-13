import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const NOTE = 'Quyết định số QD-12/2026 của phòng Nhân sự';

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  [
    'POST /offboarding-cases',
    (server) =>
      request(server)
        .post('/api/v1/offboarding-cases')
        .send({ employeeId: ID, lastWorkingDay: '2026-11-03', groundsNote: NOTE }),
  ],
  ['GET /offboarding-cases', (server) => request(server).get('/api/v1/offboarding-cases')],
  ['GET /offboarding-cases/{id}', (server) => request(server).get(`/api/v1/offboarding-cases/${ID}`)],
  ['GET /offboarding-cases/{id}/rights', (server) => request(server).get(`/api/v1/offboarding-cases/${ID}/rights`)],
  ['GET /offboarding-cases/{id}/changes', (server) => request(server).get(`/api/v1/offboarding-cases/${ID}/changes`)],
  [
    'GET /offboarding-cases/{id}/open-requests',
    (server) => request(server).get(`/api/v1/offboarding-cases/${ID}/open-requests`),
  ],
  [
    'GET /offboarding-cases/{id}/open-grant-tasks',
    (server) => request(server).get(`/api/v1/offboarding-cases/${ID}/open-grant-tasks`),
  ],
  [
    'POST /offboarding-cases/{id}/last-day-changes',
    (server) =>
      request(server)
        .post(`/api/v1/offboarding-cases/${ID}/last-day-changes`)
        .send({ lastWorkingDay: '2026-11-10', reason: 'x' }),
  ],
  [
    'POST /offboarding-cases/{id}/cancellation',
    (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/cancellation`).send({ reason: 'x' }),
  ],
  [
    'POST /offboarding-cases/{id}/departure',
    (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/departure`).send({}),
  ],
  [
    'POST /offboarding-cases/{id}/account-lock',
    (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/account-lock`).send({ note: 'khóa' }),
  ],
  [
    'POST /offboarding-cases/{id}/revocations',
    (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/revocations`).send({ count: 1, reason: 'x' }),
  ],
  ['POST /offboarding-cases/{id}/closure', (server) => request(server).post(`/api/v1/offboarding-cases/${ID}/closure`)],
];

/** The roles the guard of each route lets through: the Super Admin writes the events, the IT Admin reads the technical case and takes the steps. */
const ALLOWED: Record<string, readonly string[]> = {
  'POST /offboarding-cases': ['SUPER_ADMIN'],
  'GET /offboarding-cases': ['SUPER_ADMIN', 'IT_ADMIN'],
  'GET /offboarding-cases/{id}': ['SUPER_ADMIN', 'IT_ADMIN'],
  'GET /offboarding-cases/{id}/rights': ['SUPER_ADMIN', 'IT_ADMIN'],
  'GET /offboarding-cases/{id}/changes': ['SUPER_ADMIN'],
  'GET /offboarding-cases/{id}/open-requests': ['IT_ADMIN'],
  'GET /offboarding-cases/{id}/open-grant-tasks': ['IT_ADMIN'],
  'POST /offboarding-cases/{id}/last-day-changes': ['SUPER_ADMIN'],
  'POST /offboarding-cases/{id}/cancellation': ['SUPER_ADMIN'],
  'POST /offboarding-cases/{id}/departure': ['SUPER_ADMIN'],
  'POST /offboarding-cases/{id}/account-lock': ['IT_ADMIN'],
  'POST /offboarding-cases/{id}/revocations': ['IT_ADMIN'],
  'POST /offboarding-cases/{id}/closure': ['IT_ADMIN'],
};

describe('offboarding case routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('every route needs a signed-in person of the role that may use it (US-03-04; F40, F12)', () => {
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
      for (const [route, call] of ROUTES) {
        if (ALLOWED[route].some((role) => (direct as string[]).includes(role))) continue;
        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal([...direct, ...derived])))
          .expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });

    it('lets the IT Admin through only on what it reads or does technically: never on the events (F40, F12)', async () => {
      for (const [route, call] of ROUTES) {
        const response = await call(app.getHttpServer()).set('Authorization', bearer(principal(['IT_ADMIN'])));
        const refused = response.status === 403 && bodyOf(response).error.code === 'AUTHORIZATION.FORBIDDEN';
        expect({ route, refused }).toEqual({ route, refused: !ALLOWED[route].includes('IT_ADMIN') });
      }
    });
  });

  describe('validation before any work', () => {
    const allowedOn = (route: string) => ({ Authorization: bearer(principal([ALLOWED[route][0]])) });
    const RECORD = {
      employeeId: ID,
      lastWorkingDay: '2026-11-03',
      accessBlockMode: 'WITH_LAST_DAY',
      groundsNote: NOTE,
    };

    it.each([
      ['no employee', { lastWorkingDay: '2026-11-03', accessBlockMode: 'WITH_LAST_DAY', groundsNote: NOTE }],
      ['no mode', { employeeId: ID, lastWorkingDay: '2026-11-03', groundsNote: NOTE }],
      ['no basis', { employeeId: ID, lastWorkingDay: '2026-11-03', accessBlockMode: 'WITH_LAST_DAY' }],
      ['a blank basis', { ...RECORD, groundsNote: '  ' }],
      ['a basis of 501 characters', { ...RECORD, groundsNote: 'a'.repeat(501) }],
      [
        'the old four-part basis',
        { ...RECORD, groundsNote: undefined, grounds: { type: 'HR_DECISION', reference: 'X' } },
      ],
      ['the retired reason to cancel the transfer', { ...RECORD, pendingTransferCancellation: { reason: 'x' } }],
      ['a confirmation to cancel the transfer that is not true', { ...RECORD, cancelPendingTransfer: false }],
      ['the retired flag', { ...RECORD, abrupt: true }],
      ['a mode that is not known', { ...RECORD, accessBlockMode: 'LATER' }],
      ['an employee that is not an id', { ...RECORD, employeeId: 'E1' }],
      ['a last day that is not a date', { ...RECORD, lastWorkingDay: '03/11/2026' }],
      ['a successor of no kind', { ...RECORD, successor: { employeeId: ID } }],
      ['a field the route does not know', { ...RECORD, reasonForLeaving: 'x' }],
    ])('refuses %s with 422', async (_name, payload) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/offboarding-cases')
        .set(allowedOn('POST /offboarding-cases'))
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      [
        'a case id that is not an id',
        'GET /offboarding-cases/{id}',
        (server: App) => request(server).get('/api/v1/offboarding-cases/not-an-id'),
      ],
      [
        'a state that does not exist',
        'GET /offboarding-cases',
        (server: App) => request(server).get('/api/v1/offboarding-cases?state=DONE'),
      ],
      [
        'a flag that is not true or false',
        'GET /offboarding-cases',
        (server: App) => request(server).get('/api/v1/offboarding-cases?pastLastDay=maybe'),
      ],
      [
        'a revocationOverdue that is not true or false',
        'GET /offboarding-cases',
        (server: App) => request(server).get('/api/v1/offboarding-cases?revocationOverdue=maybe'),
      ],
      [
        'a page size over the limit',
        'GET /offboarding-cases',
        (server: App) => request(server).get('/api/v1/offboarding-cases?pageSize=101'),
      ],
      [
        'a role that is not one of the roles that need someone to take over',
        'GET /offboarding-cases',
        (server: App) => request(server).get('/api/v1/offboarding-cases?roleFlag=ADMIN'),
      ],
      [
        'a role of the approver that was retired (QĐ-93c)',
        'GET /offboarding-cases',
        (server: App) => request(server).get('/api/v1/offboarding-cases?roleFlag=FALLBACK_APPROVER'),
      ],
      [
        'the open requests of a case that is not an id',
        'GET /offboarding-cases/{id}/open-requests',
        (server: App) => request(server).get('/api/v1/offboarding-cases/not-an-id/open-requests'),
      ],
      [
        'the open grant tasks with a page size over the limit',
        'GET /offboarding-cases/{id}/open-grant-tasks',
        (server: App) => request(server).get(`/api/v1/offboarding-cases/${ID}/open-grant-tasks?pageSize=101`),
      ],
      [
        'a new day that is not a date',
        'POST /offboarding-cases/{id}/last-day-changes',
        (server: App) =>
          request(server).post(`/api/v1/offboarding-cases/${ID}/last-day-changes`).send({ lastWorkingDay: 'tomorrow' }),
      ],
      [
        'revocations that still send a count',
        'POST /offboarding-cases/{id}/revocations',
        (server: App) => request(server).post(`/api/v1/offboarding-cases/${ID}/revocations`).send({ count: 1 }),
      ],
      [
        'revocations that still send a reason',
        'POST /offboarding-cases/{id}/revocations',
        (server: App) => request(server).post(`/api/v1/offboarding-cases/${ID}/revocations`).send({ reason: 'x' }),
      ],
      [
        'revocations with an empty note',
        'POST /offboarding-cases/{id}/revocations',
        (server: App) => request(server).post(`/api/v1/offboarding-cases/${ID}/revocations`).send({ note: '  ' }),
      ],
      [
        'a move of the day without a reason',
        'POST /offboarding-cases/{id}/last-day-changes',
        (server: App) =>
          request(server)
            .post(`/api/v1/offboarding-cases/${ID}/last-day-changes`)
            .send({ lastWorkingDay: '2026-11-20', groundsNote: NOTE }),
      ],
      [
        'a move of the day without a basis',
        'POST /offboarding-cases/{id}/last-day-changes',
        (server: App) =>
          request(server)
            .post(`/api/v1/offboarding-cases/${ID}/last-day-changes`)
            .send({ lastWorkingDay: '2026-11-20', reason: 'x' }),
      ],
      [
        'a cancellation without a reason',
        'POST /offboarding-cases/{id}/cancellation',
        (server: App) =>
          request(server).post(`/api/v1/offboarding-cases/${ID}/cancellation`).send({ groundsNote: NOTE }),
      ],
      [
        'a cancellation without a basis',
        'POST /offboarding-cases/{id}/cancellation',
        (server: App) => request(server).post(`/api/v1/offboarding-cases/${ID}/cancellation`).send({ reason: 'x' }),
      ],
      [
        'a cancellation with a basis that is not a sentence',
        'POST /offboarding-cases/{id}/cancellation',
        (server: App) =>
          request(server)
            .post(`/api/v1/offboarding-cases/${ID}/cancellation`)
            .send({ reason: 'x', groundsNote: { reference: 'QD-12/2026' } }),
      ],
      [
        'revocations naming a seat that is not an id',
        'POST /offboarding-cases/{id}/revocations',
        (server: App) =>
          request(server)
            .post(`/api/v1/offboarding-cases/${ID}/revocations`)
            .send({ assignmentIds: ['seat'] }),
      ],
      [
        'a lock of the account with an empty note',
        'POST /offboarding-cases/{id}/account-lock',
        (server: App) => request(server).post(`/api/v1/offboarding-cases/${ID}/account-lock`).send({ note: '  ' }),
      ],
      [
        'a departure with the day it happened',
        'POST /offboarding-cases/{id}/departure',
        (server: App) =>
          request(server).post(`/api/v1/offboarding-cases/${ID}/departure`).send({ departedOn: '2026-11-03' }),
      ],
      [
        'a departure with the lock of the account',
        'POST /offboarding-cases/{id}/departure',
        (server: App) =>
          request(server)
            .post(`/api/v1/offboarding-cases/${ID}/departure`)
            .send({ accountLock: { note: 'khóa' } }),
      ],
    ])('refuses %s with 422', async (_name, route, call) => {
      const response = await call(app.getHttpServer()).set(allowedOn(route)).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('QĐ-110c: accepts the filter of the departures past the deadline of their revocations', async () => {
    for (const flag of ['true', 'false']) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/offboarding-cases?revocationOverdue=${flag}`)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])));

      expect(response.status).not.toBe(422);
    }
  });

  it(
    'QĐ-110c: documents the deadline of the revocations on the case and the filter of the list',
    () => {
      const document = createOpenApiDocument(app);
      const list = JSON.stringify((document.paths['/api/v1/offboarding-cases'] as { get: unknown }).get);
      const schemas = JSON.stringify(document.components?.schemas ?? {});

      expect(list).toContain('revocationOverdue');
      for (const field of ['"rightsWithoutCompletedTask"', '"revocation"']) expect(schemas).toContain(field);
    },
    OPENAPI_DOCUMENT_BUDGET_MS,
  );

  it(
    'R-1: documents the record of the lock of the company account as item (1a) of BM-08, the block, with the mailbox not locked yet',
    () => {
      const document = createOpenApiDocument(app);
      const operation = (
        document.paths['/api/v1/offboarding-cases/{id}/account-lock'] as {
          post: { summary: string; responses: Record<string, { description?: string }> };
        }
      ).post;
      const text = `${operation.summary} ${operation.responses['200']?.description ?? ''}`;

      expect(operation.summary).toMatch(/block/i);
      expect(text).toContain('(1a)');
      expect(text).toMatch(/reset the password of the mailbox/i);
      expect(text).toMatch(/sign(ed)? out every session/i);
      expect(text).toMatch(/mailbox is not locked/i);
    },
    OPENAPI_DOCUMENT_BUDGET_MS,
  );

  it(
    'QĐ-110c: words the day of the deadline of the revocations as the Nth working day after the block moment, not the working day after the last working day',
    () => {
      const document = createOpenApiDocument(app);
      const list = (
        document.paths['/api/v1/offboarding-cases'] as { get: { responses: Record<string, { description?: string }> } }
      ).get;
      const text = list.responses['200']?.description ?? '';

      expect(text).toMatch(/Nth working day after the block moment/);
      expect(text).toMatch(/DEPARTURE_REVOCATION_WORKING_DAYS/);
      expect(text).not.toMatch(/the working day after the last working day/);
    },
    OPENAPI_DOCUMENT_BUDGET_MS,
  );
});
