import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const VALID_TERMS = {
  termsUrl: 'https://www.figma.com/tos',
  lastReviewedOn: '2026-10-01',
  aiTraining: 'Dữ liệu không dùng huấn luyện AI',
  dataLocation: 'EU',
  installLimit: { maxDevicesPerKey: 1, note: '1 máy mỗi khóa' },
  commercialUse: 'Được dùng thương mại',
  cancellationRefund: 'Báo trước 30 ngày',
};

type Call = (server: App) => request.Test;

/** The routes only the IT Admin may call (US-04-11 AC-8). */
const WRITE_ROUTES: Array<[string, Call]> = [
  ['PUT /plans/{id}/terms', (s) => request(s).put(`/api/v1/plans/${ID}/terms`).send(VALID_TERMS)],
  [
    'POST /plans/{id}/term-opinions',
    (s) => request(s).post(`/api/v1/plans/${ID}/term-opinions`).send({ opinion: 'ok' }),
  ],
];

describe('plan terms routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const ALL_ROUTES: Array<[string, Call]> = [
    ...WRITE_ROUTES,
    ['GET /plans/{id}/terms', (s) => request(s).get(`/api/v1/plans/${ID}/terms`)],
    ['GET /plan-warnings', (s) => request(s).get('/api/v1/plan-warnings')],
  ];

  it.each(ALL_ROUTES)('%s without a token is 401', async (_name, call) => {
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
  ])('refuses %s on every route that records terms or opinions with 403', async (_name, direct, derived) => {
    for (const [route, call] of WRITE_ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head', [], ['MANAGER']],
    ['the Super Admin', ['SUPER_ADMIN'], []],
  ])(
    'refuses %s the review alerts with 403, and the terms too unless it is Finance',
    async (_name, direct: string[], derived: string[]) => {
      const warnings = await request(app.getHttpServer())
        .get('/api/v1/plan-warnings')
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);
      expect(bodyOf(warnings).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      if (!direct.includes('FINANCE')) {
        await request(app.getHttpServer())
          .get(`/api/v1/plans/${ID}/terms`)
          .set('Authorization', bearer(principal(direct, derived)))
          .expect(403);
      }
    },
  );

  describe('validation', () => {
    const asIt = () => ({ Authorization: bearer(principal(['IT_ADMIN'])) });
    const put = (body: unknown, id = ID) =>
      request(app.getHttpServer())
        .put(`/api/v1/plans/${id}/terms`)
        .set(asIt())
        .send(body as object);

    it.each([
      ['a link that is not text', { termsUrl: 7 }],
      ['a review date that is not real', { lastReviewedOn: '2026-02-30' }],
      ['a review date written the wrong way', { lastReviewedOn: '15/11/2025' }],
      ['a point that is not text', { aiTraining: 7 }],
      ['an install limit that is not an object', { installLimit: 'two' }],
      ['an install limit of zero devices', { installLimit: { maxDevicesPerKey: 0 } }],
      ['an install limit that is not whole', { installLimit: { maxDevicesPerKey: 1.5 } }],
      ['an unknown field inside the install limit', { installLimit: { max: 2 } }],
      ['the sharing policy, which is entered on the plan', { sharingPolicy: 'ALLOWED' }],
      ['a legal verdict', { legalVerdict: 'violates the terms' }],
      ['a flag saying it complies', { compliant: true }],
      ['a conclusion', { conclusion: 'illegal' }],
    ])('turns away a PUT with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await put(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no opinion', {}],
      ['an opinion that is not text', { opinion: 7 }],
      ['an unknown field', { opinion: 'ok', approved: true }],
    ])('turns away a POST of an opinion with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/plans/${ID}/term-opinions`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['GET terms', (s: App) => request(s).get('/api/v1/plans/not-a-uuid/terms')],
      ['PUT terms', (s: App) => request(s).put('/api/v1/plans/not-a-uuid/terms').send({})],
      ['POST opinion', (s: App) => request(s).post('/api/v1/plans/not-a-uuid/term-opinions').send({ opinion: 'x' })],
    ])('turns away %s with an id that is not a UUID, 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['page 0', '/api/v1/plan-warnings?page=0'],
      ['a page size of 101', '/api/v1/plan-warnings?pageSize=101'],
      ['an unknown parameter', '/api/v1/plan-warnings?x=1'],
    ])('turns away the alerts with %s, 422', async (_name, path) => {
      const response = await request(app.getHttpServer()).get(path).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('nothing is deleted or decided', () => {
    it('has no route that deletes the terms or an opinion, or concludes anything: 404, even for the IT Admin', async () => {
      for (const [method, path] of [
        ['delete', `/api/v1/plans/${ID}/terms`],
        ['delete', `/api/v1/plans/${ID}/term-opinions/${ID}`],
        ['post', `/api/v1/plans/${ID}/terms/conclusions`],
        ['post', `/api/v1/plan-warnings/${ID}/revocations`],
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
