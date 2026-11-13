import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { GrantRequestGateHook } from '../../../src/modules/licensing/public/licensing.extension-points';
import { bodyOf } from '../../support/api-body';
import { GATE_THAT_KNOWS_NO_REQUEST, StandInGrantRequestGateHook } from '../../support/grant-gate-stand-in';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const BASE = '/api/v1/provisioning-tasks';

describe('provisioning queue routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp({
      // No database stands behind this app: the gate that knows no request keeps the requests out of it.
      overrides: [
        { token: GrantRequestGateHook, useValue: new StandInGrantRequestGateHook(GATE_THAT_KNOWS_NO_REQUEST) },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['get', BASE],
    ['get', `${BASE}/${ID}`],
    ['post', BASE],
    ['post', `${BASE}/${ID}/claim`],
    ['post', `${BASE}/${ID}/complete`],
    ['post', `${BASE}/${ID}/report-failure`],
    ['post', `${BASE}/${ID}/retry`],
    ['post', `${BASE}/${ID}/hand-off`],
    ['post', `${BASE}/${ID}/close-failed`],
    ['post', `${BASE}/${ID}/revocation-completion`],
    ['post', `${BASE}/${ID}/access-cut`],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head', ['MANAGER'], []],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ['an account with no role', [], []],
  ])('refuses %s every route of the queue with 403 (SoD-5)', async (_name, direct, derived) => {
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', bearer(principal([...direct, ...derived])));

    for (const response of [
      await as(request(server).get(BASE)),
      await as(request(server).get(`${BASE}/${ID}`)),
      await as(request(server).post(BASE).send({ requestId: ID })),
      await as(request(server).post(`${BASE}/${ID}/claim`)),
      await as(request(server).post(`${BASE}/${ID}/complete`).send({ evidence: 'x' })),
      await as(request(server).post(`${BASE}/${ID}/report-failure`).send({ reason: 'x' })),
      await as(request(server).post(`${BASE}/${ID}/retry`)),
      await as(request(server).post(`${BASE}/${ID}/hand-off`).send({})),
      await as(request(server).post(`${BASE}/${ID}/close-failed`).send({ reason: 'x' })),
      await as(
        request(server)
          .post(`${BASE}/${ID}/revocation-completion`)
          .send({ completion: 'ACCOUNT_REMOVED', evidence: 'x' }),
      ),
      await as(request(server).post(`${BASE}/${ID}/access-cut`).send({ accessCutOn: '2026-11-12', evidence: 'x' })),
    ]) {
      expect(response.status).toBe(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each([
    ['an id that is not a UUID', 'get', `${BASE}/not-a-uuid`, undefined],
    ['page 0', 'get', `${BASE}?page=0`, undefined],
    ['a page size of 101', 'get', `${BASE}?pageSize=101`, undefined],
    ['an unknown scope', 'get', `${BASE}?scope=EVERYONE`, undefined],
    ['an unknown channel', 'get', `${BASE}?channel=EMAIL`, undefined],
    ['an unknown query parameter', 'get', `${BASE}?x=1`, undefined],
    ['a grant with no request', 'post', BASE, {}],
    ['a grant with a request that is not a UUID', 'post', BASE, { requestId: 'x' }],
    ['a grant that carries a password', 'post', BASE, { requestId: ID, password: 'hunter2' }],
    ['evidence of over two thousand characters', 'post', `${BASE}/${ID}/complete`, { evidence: 'x'.repeat(2001) }],
    ['a completion with an unknown field', 'post', `${BASE}/${ID}/complete`, { evidence: 'x', done: true }],
    ['a reason of over a thousand characters', 'post', `${BASE}/${ID}/report-failure`, { reason: 'x'.repeat(1001) }],
    ['a status that does not exist', 'get', `${BASE}?status=DONE`, undefined],
    // BR-MF5-04: the filter of the tasks that may be taken today is a flag.
    ['a claimableNow that is not a flag', 'get', `${BASE}?claimableNow=maybe`, undefined],
    // QĐ-110c: the filter of the tasks past their due day is a flag.
    ['an overdue that is not a flag', 'get', `${BASE}?overdue=maybe`, undefined],
    // A hand-off changes only the channel: its body is an empty object, and the evidence is asked when the work by hand completes (F08).
    ['a hand-off that still carries evidence', 'post', `${BASE}/${ID}/hand-off`, { evidence: 'x' }],
    ['a hand-off with an unknown field', 'post', `${BASE}/${ID}/hand-off`, { password: 'p' }],
    [
      'a closing reason of over a thousand characters',
      'post',
      `${BASE}/${ID}/close-failed`,
      { reason: 'x'.repeat(1001) },
    ],
    ['a closing with an unknown field', 'post', `${BASE}/${ID}/close-failed`, { reason: 'x', force: true }],
    ['a retry for an id that is not a UUID', 'post', `${BASE}/not-a-uuid/retry`, {}],
    ['a revocation completion with no way', 'post', `${BASE}/${ID}/revocation-completion`, { evidence: 'x' }],
    [
      'a revocation completion with a way that does not exist',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      { completion: 'DELETED', evidence: 'x' },
    ],
    [
      'a revocation completion with a day that is not one',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      { completion: 'RENEWAL_CANCELLED', evidence: 'x', paidThroughOn: '2026-02-30' },
    ],
    [
      'a revocation completion with an unknown field',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      { completion: 'ACCOUNT_REMOVED', evidence: 'x', password: 'p' },
    ],
    [
      'a revocation note of over a thousand characters',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      { completion: 'ALREADY_GONE', note: 'x'.repeat(1001) },
    ],
    // QĐ-111az, P25: the checklist of a K1 revocation lists steps with the instant each was done; the variant is the server's, never sent.
    [
      'a K1 checklist with a step that does not exist',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      { completion: 'RENEWAL_CANCELLED', k1Checklist: { items: [{ code: 'COFFEE_BREAK', done: true }] } },
    ],
    [
      'a K1 checklist step whose instant is not one',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      {
        completion: 'RENEWAL_CANCELLED',
        k1Checklist: { items: [{ code: 'RENEWAL_DISABLED', done: true, doneAt: 'yesterday' }] },
      },
    ],
    [
      'a K1 checklist step whose flag is not a boolean',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      { completion: 'RENEWAL_CANCELLED', k1Checklist: { items: [{ code: 'RENEWAL_DISABLED', done: 'yes' }] } },
    ],
    [
      'a K1 checklist step with an unknown field',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      {
        completion: 'RENEWAL_CANCELLED',
        k1Checklist: { items: [{ code: 'RENEWAL_DISABLED', done: true, tickedBy: 'me' }] },
      },
    ],
    [
      'a K1 checklist that names its own variant',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      { completion: 'RENEWAL_CANCELLED', k1Checklist: { variant: 'STILL_EMPLOYED', items: [] } },
    ],
    [
      'a K1 checklist of more than ten steps',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      {
        completion: 'RENEWAL_CANCELLED',
        k1Checklist: { items: Array.from({ length: 11 }, () => ({ code: 'RENEWAL_DISABLED', done: false })) },
      },
    ],
    [
      'a K1 checklist with evidence of over two thousand characters',
      'post',
      `${BASE}/${ID}/revocation-completion`,
      { completion: 'RENEWAL_CANCELLED', k1Checklist: { items: [], evidence: 'x'.repeat(2001) } },
    ],
    ['an access cut with no day', 'post', `${BASE}/${ID}/access-cut`, { evidence: 'x' }],
    ['an access cut with a day that is not one', 'post', `${BASE}/${ID}/access-cut`, { accessCutOn: 'soon' }],
    [
      'an access cut for an id that is not a UUID',
      'post',
      `${BASE}/not-a-uuid/access-cut`,
      { accessCutOn: '2026-11-12' },
    ],
  ] as const)('turns away %s with 422', async (_name, method, path, body) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['IT_ADMIN'])));

    const response = await (body === undefined ? req : req.send(body)).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  // BR-MF1-09b / P0-05: the subscription is optional (the pool of the plan gives one) and a purchase carries only a reason.
  it.each([
    [
      'a purchase that names its own kind (the kind follows from the plan)',
      { requestId: ID, purchase: { kind: 'POOL_TOP_UP' } },
    ],
    ['a purchase with a reason of more than 500 characters', { requestId: ID, purchase: { reason: 'x'.repeat(501) } }],
    ['a purchase whose reason is blank', { requestId: ID, purchase: { reason: '   ' } }],
  ])('turns away a grant with %s with 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a grant with no subscription named and a purchase with or without a reason (the gate then answers)', async () => {
    for (const purchase of [{}, { reason: 'the pool is empty' }]) {
      const response = await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({ requestId: ID, purchase })
        .expect(404);

      expect(bodyOf(response).error.code).toBe('REQUEST.NOT_FOUND');
    }
  });

  it('BR-MF5-04: accepts the filter of the tasks that may be taken today', async () => {
    for (const flag of ['true', 'false']) {
      const response = await request(app.getHttpServer())
        .get(`${BASE}?claimableNow=${flag}`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])));

      expect(response.status).not.toBe(422);
    }
  });

  it('QĐ-110c: accepts the filter of the tasks past their due day', async () => {
    for (const flag of ['true', 'false']) {
      const response = await request(app.getHttpServer())
        .get(`${BASE}?overdue=${flag}`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])));

      expect(response.status).not.toBe(422);
    }
  });

  it(
    'BR-MF5-04: documents the 409 NOT_BEFORE of the claim and the completion of a revocation, and the new fields of a task',
    () => {
      const document = createOpenApiDocument(app);
      const conflict = (path: string) =>
        JSON.stringify(
          (document.paths[path] as { post: { responses: Record<string, unknown> } }).post.responses['409'],
        );

      expect(conflict(`${BASE}/{id}/claim`)).toContain('PROVISIONING_TASK.NOT_BEFORE');
      expect(conflict(`${BASE}/{id}/revocation-completion`)).toContain('PROVISIONING_TASK.NOT_BEFORE');
      const schemas = JSON.stringify(document.components?.schemas ?? {});
      for (const field of ['"claimableNow"', '"notBefore"', '"dueOn"', '"withdrawnReasonCount"']) {
        expect(schemas).toContain(field);
      }
    },
    OPENAPI_DOCUMENT_BUDGET_MS,
  );

  it('QĐ-111az: lets a K1 checklist of either variant through validation: the policy of the task then judges it', async () => {
    const stamp = '2026-11-13T09:30:00+07:00';
    const departure = [
      'MAILBOX_PASSWORD_RESET',
      'SOFTWARE_FORGOT_PASSWORD',
      'SESSIONS_SIGNED_OUT',
      'RENEWAL_DISABLED',
      'EVIDENCE_RECORDED',
      'MAILBOX_LOCKED',
    ];
    const stillEmployed = ['RENEWAL_DISABLED', 'EVIDENCE_RECORDED'];

    for (const codes of [departure, stillEmployed]) {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/${ID}/revocation-completion`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({
          completion: 'RENEWAL_CANCELLED',
          paidThroughOn: '2026-11-30',
          accessState: 'UNTIL_PAID_END',
          k1Checklist: { items: codes.map((code) => ({ code, done: true, doneAt: stamp })), evidence: 'ticket IT-9' },
        });

      expect(response.status).not.toBe(422);
    }
  });

  it(
    'QĐ-111az: documents the K1 checklist of the completion and of the card, and its two codes of refusal',
    () => {
      const document = createOpenApiDocument(app);
      const post = (path: string) =>
        (document.paths[path] as { post: { requestBody: unknown; responses: Record<string, unknown> } }).post;
      const schemas = JSON.stringify(document.components?.schemas ?? {});

      const unprocessable = JSON.stringify(post(`${BASE}/{id}/revocation-completion`).responses['422']);
      expect(unprocessable).toContain('REVOCATION.K1_CHECKLIST_INCOMPLETE');
      expect(unprocessable).toContain('REVOCATION.K1_CHECKLIST_OUT_OF_ORDER');
      expect(JSON.stringify(post(`${BASE}/{id}/revocation-completion`).requestBody)).toContain(
        'RevocationCompletionBodyDto',
      );
      for (const field of ['"k1Checklist"', '"MAILBOX_LOCKED"', '"STILL_EMPLOYED"', '"doneAt"', '"label"']) {
        expect(schemas).toContain(field);
      }
      const card = JSON.stringify((document.paths[`${BASE}/{id}`] as { get: unknown }).get);
      expect(card).toContain('k1Checklist');
    },
    OPENAPI_DOCUMENT_BUDGET_MS,
  );

  it('answers REQUEST.NOT_FOUND to a grant of a request the gate does not know, and writes nothing', async () => {
    const response = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({ requestId: ID, subscriptionId: ID })
      .expect(404);

    expect(bodyOf(response).error.code).toBe('REQUEST.NOT_FOUND');
  });

  it(
    'has no route that makes a revocation: each source opens it through the licensing facade (US-07-05 AC-3)',
    async () => {
      const posts = Object.entries(createOpenApiDocument(app).paths)
        .filter(([path, item]) => path.startsWith(BASE) && item.post)
        .map(([path]) => path.slice(BASE.length))
        .sort();

      // The grant, and what is done to a task that exists: nothing here makes a task of kind REVOKE.
      expect(posts).toEqual(
        [
          '',
          '/{id}/access-cut',
          '/{id}/cancel',
          '/{id}/claim',
          '/{id}/close-failed',
          '/{id}/complete',
          '/{id}/hand-off',
          '/{id}/report-failure',
          '/{id}/retry',
          '/{id}/revocation-completion',
        ].sort(),
      );
      await request(app.getHttpServer())
        .post(`${BASE}/revoke`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({ source: 'RETURN' })
        .expect(404);
    },
    OPENAPI_DOCUMENT_BUDGET_MS,
  );

  it('has no route that deletes or rewrites a task', async () => {
    const server = app.getHttpServer();
    const asAdmin = bearer(principal(['IT_ADMIN']));

    await request(server).delete(`${BASE}/${ID}`).set('Authorization', asAdmin).expect(404);
    await request(server).put(`${BASE}/${ID}`).set('Authorization', asAdmin).send({}).expect(404);
    await request(server).patch(`${BASE}/${ID}`).set('Authorization', asAdmin).send({}).expect(404);
  });
});
