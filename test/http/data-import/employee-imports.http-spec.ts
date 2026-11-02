import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

/** What a confirmation carried before `QĐ-93f`: it takes no HR basis any more, so a body that still carries one is refused. */
const HR_BASIS_BODY = {
  type: 'LABOR_CONTRACT',
  reference: 'HD-2026-001',
  issuer: 'HR Department',
  issuedOn: '2026-10-01',
};

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, Call]> = [
  [
    'POST /employee-imports',
    (server) => request(server).post('/api/v1/employee-imports').attach('file', Buffer.from('a,b\n1,2'), 'people.csv'),
  ],
  ['GET /employee-imports/{id}', (server) => request(server).get(`/api/v1/employee-imports/${ID}`)],
  ['GET /employee-imports/{id}/rows', (server) => request(server).get(`/api/v1/employee-imports/${ID}/rows`)],
  [
    'POST /employee-imports/{id}/preview-refreshes',
    (server) => request(server).post(`/api/v1/employee-imports/${ID}/preview-refreshes`),
  ],
  [
    'POST /employee-imports/{id}/confirmations',
    (server) =>
      request(server)
        .post(`/api/v1/employee-imports/${ID}/confirmations`)
        .send({ previewVersion: 1, idempotencyKey: 'a-key-of-8' }),
  ],
  [
    'POST /employee-imports/{id}/cancellations',
    (server) => request(server).post(`/api/v1/employee-imports/${ID}/cancellations`),
  ],
];

describe('people import routes (e2e, no database)', () => {
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
    ['the finance officer', ['FINANCE'], []],
    ['the IT Admin, who no longer imports people (QĐ-82i)', ['IT_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403 on every route (US-02-02 AC-12)', async (_name, direct, derived) => {
    for (const [route, call] of ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asIt = () => ({ Authorization: bearer(principal(['SUPER_ADMIN'])) });

    it('turns away an upload with no file, 422 IMPORT.FILE_REQUIRED', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/employee-imports').set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('IMPORT.FILE_REQUIRED');
    });

    it.each([
      [
        'fifty text fields next to the file',
        (s: App) => {
          let call = request(s).post('/api/v1/employee-imports');
          for (let index = 0; index < 50; index += 1) call = call.field(`extra${index}`, 'x');

          return call.attach('file', Buffer.from('a,b\n1,2'), 'people.csv');
        },
      ],
      [
        'a text field of a megabyte',
        (s: App) =>
          request(s)
            .post('/api/v1/employee-imports')
            .field('note', 'x'.repeat(1024 * 1024))
            .attach('file', Buffer.from('a,b\n1,2'), 'people.csv'),
      ],
      [
        'two files',
        (s: App) =>
          request(s)
            .post('/api/v1/employee-imports')
            .attach('file', Buffer.from('a,b\n1,2'), 'people.csv')
            .attach('file', Buffer.from('a,b\n3,4'), 'more.csv'),
      ],
    ])('refuses an upload with %s before it is read (SEC-06)', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asIt());

      // The multipart parser stops at the limit: the form never reaches the validation that would have judged it.
      expect(response.status).toBe(400);
      expect(bodyOf(response).error.code).toBe('HTTP_BAD_REQUEST');
    });

    it('refuses a file sent under another field name with 400 HTTP_BAD_REQUEST, naming neither field nor file (P29-N2)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/employee-imports')
        .set(asIt())
        .attach('document', Buffer.from('a,b\n1,2'), 'people-secret.csv');

      expect(response.status).toBe(400);
      expect(bodyOf(response).error).toMatchObject({
        code: 'HTTP_BAD_REQUEST',
        message: 'The request could not be processed.',
      });
      expect(response.text).not.toMatch(/document|people-secret|Unexpected|stack/i);
    });

    it('still answers a multipart form with no file part with its own 422 IMPORT.FILE_REQUIRED', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/employee-imports')
        .set(asIt())
        .field('note', 'x');

      expect(response.status).toBe(422);
      expect(bodyOf(response).error.code).toBe('IMPORT.FILE_REQUIRED');
    });

    it('refuses a file over 2 MiB with 413 HTTP_PAYLOAD_TOO_LARGE, as the contract declares', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/employee-imports')
        .set(asIt())
        .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1, 0x61), 'people.csv');

      expect(response.status).toBe(413);
      expect(bodyOf(response).error.code).toBe('HTTP_PAYLOAD_TOO_LARGE');
    });

    it.each([
      ['no version', { idempotencyKey: 'a-key-of-8' }],
      ['a version of zero', { previewVersion: 0, idempotencyKey: 'a-key-of-8' }],
      ['no key', { previewVersion: 1 }],
      ['a key that is too short', { previewVersion: 1, idempotencyKey: 'short' }],
      ['an unknown field', { previewVersion: 1, idempotencyKey: 'a-key-of-8', force: true }],
      [
        'an HR basis, which no confirmation takes since QĐ-93f',
        { previewVersion: 1, idempotencyKey: 'a-key-of-8', hrBasis: HR_BASIS_BODY },
      ],
    ])('turns away a confirmation with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/employee-imports/${ID}/confirmations`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['an id that is not a UUID', '/api/v1/employee-imports/not-a-uuid'],
      ['a filter that is not an outcome', `/api/v1/employee-imports/${ID}/rows?outcome=GOOD`],
      ['a page size of 201', `/api/v1/employee-imports/${ID}/rows?pageSize=201`],
    ])('turns away a read with %s, 422', async (_name, path) => {
      await request(app.getHttpServer()).get(path).set(asIt()).expect(422);
    });
  });

  it('has no route that writes people without a confirmation, or that deletes an import', async () => {
    for (const [method, path] of [
      ['put', `/api/v1/employee-imports/${ID}`],
      ['patch', `/api/v1/employee-imports/${ID}`],
      ['delete', `/api/v1/employee-imports/${ID}`],
    ] as const) {
      await request(app.getHttpServer())
        [method](path)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .send({})
        .expect(404);
    }
  });
});
