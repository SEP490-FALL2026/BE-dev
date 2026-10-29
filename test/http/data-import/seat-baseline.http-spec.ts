import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';

type Call = (server: App) => request.Test;

/** Every route of the seat baseline: only the IT Admin may call any of them (US-02-05, SoD-1). */
const ROUTES: Array<[string, Call]> = [
  [
    'POST /seat-baseline-imports',
    (s) =>
      request(s)
        .post('/api/v1/seat-baseline-imports')
        .field('subscriptionId', ID)
        .attach('file', Buffer.from('a'), 'f.csv'),
  ],
  ['GET /seat-baseline-imports/{id}', (s) => request(s).get(`/api/v1/seat-baseline-imports/${ID}`)],
  ['GET /seat-baseline-imports/{id}/rows', (s) => request(s).get(`/api/v1/seat-baseline-imports/${ID}/rows`)],
  [
    'POST /seat-baseline-imports/{id}/confirm',
    (s) =>
      request(s)
        .post(`/api/v1/seat-baseline-imports/${ID}/confirm`)
        .send({ previewVersion: 1, idempotencyKey: 'key-00000001' }),
  ],
  ['POST /seat-baseline-imports/{id}/cancel', (s) => request(s).post(`/api/v1/seat-baseline-imports/${ID}/cancel`)],
  ['GET /seat-baseline', (s) => request(s).get('/api/v1/seat-baseline')],
  ['POST /seat-baseline/close', (s) => request(s).post('/api/v1/seat-baseline/close')],
  ['GET /license-assignments', (s) => request(s).get('/api/v1/license-assignments')],
  ['GET /subscriptions/{id}/seat-usage', (s) => request(s).get(`/api/v1/subscriptions/${ID}/seat-usage`)],
  [
    'POST /license-assignments/{id}/responsible-changes',
    (s) =>
      request(s)
        .post(`/api/v1/license-assignments/${ID}/responsible-changes`)
        .send({ employeeId: OTHER, effectiveFrom: '2026-10-15' }),
  ],
];

describe('seat baseline routes (e2e, no database)', () => {
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

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s on every route of the seat baseline with 403', async (_name, direct, derived) => {
    for (const [route, call] of ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asIt = () => ({ Authorization: bearer(principal(['IT_ADMIN'])) });
    const upload =
      (fields: Record<string, string>, withFile = true) =>
      (s: App) => {
        let call = request(s).post('/api/v1/seat-baseline-imports');
        for (const [name, value] of Object.entries(fields)) call = call.field(name, value);

        return withFile ? call.attach('file', Buffer.from('a'), 'f.csv') : call;
      };

    it.each([
      ['a file missing', upload({ subscriptionId: ID }, false), 'SEAT_BASELINE_IMPORT.FILE_REQUIRED'],
      ['a subscription id that is not a UUID', upload({ subscriptionId: 'not-a-uuid' }), 'VALIDATION_ERROR'],
      ['a field that is not known', upload({ subscriptionId: ID, status: 'DONE' }), 'VALIDATION_ERROR'],
    ])('turns away an upload with %s', async (_name, call, code) => {
      const response = await call(app.getHttpServer()).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe(code);
    });

    it.each([
      [
        'fifty text fields next to the file',
        (s: App) => {
          let call = request(s).post('/api/v1/seat-baseline-imports').field('subscriptionId', ID);
          for (let index = 0; index < 50; index += 1) call = call.field(`extra${index}`, 'x');

          return call.attach('file', Buffer.from('a'), 'f.csv');
        },
      ],
      [
        'a text field of a megabyte',
        (s: App) =>
          request(s)
            .post('/api/v1/seat-baseline-imports')
            .field('subscriptionId', 'x'.repeat(1024 * 1024))
            .attach('file', Buffer.from('a'), 'f.csv'),
      ],
      [
        'two files',
        (s: App) =>
          request(s)
            .post('/api/v1/seat-baseline-imports')
            .field('subscriptionId', ID)
            .attach('file', Buffer.from('a'), 'f.csv')
            .attach('file', Buffer.from('b'), 'g.csv'),
      ],
    ])('refuses an upload with %s before it is read (SEC-06)', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asIt());

      // The multipart parser stops at the limit: the form never reaches the validation that would have judged it.
      expect(response.status).toBe(400);
      expect(bodyOf(response).error.code).toBe('HTTP_BAD_REQUEST');
    });

    it('refuses a file sent under another field name with 400 HTTP_BAD_REQUEST, naming neither field nor file (P29-N2)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/seat-baseline-imports')
        .set(asIt())
        .field('subscriptionId', ID)
        .attach('document', Buffer.from('a'), 'seats-secret.csv');

      expect(response.status).toBe(400);
      expect(bodyOf(response).error).toMatchObject({
        code: 'HTTP_BAD_REQUEST',
        message: 'The request could not be processed.',
      });
      expect(response.text).not.toMatch(/document|seats-secret|Unexpected|stack/i);
    });

    it('refuses a file over 2 MiB with 413 HTTP_PAYLOAD_TOO_LARGE, as the contract declares', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/seat-baseline-imports')
        .set(asIt())
        .field('subscriptionId', ID)
        .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1, 0x61), 'f.csv');

      expect(response.status).toBe(413);
      expect(bodyOf(response).error.code).toBe('HTTP_PAYLOAD_TOO_LARGE');
    });

    it.each([
      ['a version that is not positive', { previewVersion: 0, idempotencyKey: 'key-00000001' }],
      ['a version that is not a whole number', { previewVersion: 1.5, idempotencyKey: 'key-00000001' }],
      ['a key that is too short', { previewVersion: 1, idempotencyKey: 'short' }],
      ['no key', { previewVersion: 1 }],
      ['a field that is not known', { previewVersion: 1, idempotencyKey: 'key-00000001', force: true }],
    ])('turns away a confirmation with %s', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/seat-baseline-imports/${ID}/confirm`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['an import id that is not a UUID', '/api/v1/seat-baseline-imports/not-a-uuid'],
      ['rows with page 0', `/api/v1/seat-baseline-imports/${ID}/rows?page=0`],
      ['rows with a page size of 101', `/api/v1/seat-baseline-imports/${ID}/rows?pageSize=101`],
      ['rows with an outcome that is not one', `/api/v1/seat-baseline-imports/${ID}/rows?outcome=MAYBE`],
      ['a list with a source that is not one', '/api/v1/license-assignments?source=EVERYTHING'],
      ['a list with a kind that is not one', '/api/v1/license-assignments?kind=SHARED'],
      ['a list with an id that is not a UUID', '/api/v1/license-assignments?subscriptionId=x'],
      ['a list with an unknown parameter', '/api/v1/license-assignments?x=1'],
      ['seats of an id that is not a UUID', '/api/v1/subscriptions/not-a-uuid/seat-usage'],
    ])('turns away %s, 422', async (_name, path) => {
      const response = await request(app.getHttpServer()).get(path).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no person', { effectiveFrom: '2026-10-15' }],
      ['a person that is not a UUID', { employeeId: 'E5', effectiveFrom: '2026-10-15' }],
      ['no day', { employeeId: OTHER }],
      ['a day that is not a date', { employeeId: OTHER, effectiveFrom: '15/10/2026' }],
      ['a day that does not exist', { employeeId: OTHER, effectiveFrom: '2026-02-30' }],
      ['an end date that is not a date', { employeeId: OTHER, effectiveFrom: '2026-10-15', expectedEndDate: 'soon' }],
      ['a field that is not known', { employeeId: OTHER, effectiveFrom: '2026-10-15', kind: 'PERSONAL' }],
    ])('turns away a change of the responsible person with %s', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/license-assignments/${ID}/responsible-changes`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('nothing is created by hand, changed or deleted', () => {
    it('has no route that creates an assignment from nothing, reopens the baseline, or deletes anything: 404, even for the IT Admin', async () => {
      for (const [method, path] of [
        ['post', '/api/v1/license-assignments'],
        ['delete', `/api/v1/license-assignments/${ID}`],
        ['patch', `/api/v1/license-assignments/${ID}`],
        ['post', '/api/v1/seat-baseline/reopen'],
        ['delete', '/api/v1/seat-baseline'],
        ['delete', `/api/v1/seat-baseline-imports/${ID}`],
      ] as const) {
        const response = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', bearer(principal(['IT_ADMIN'])))
          .expect(404);
        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
