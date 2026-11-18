import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApplicationBodySchema } from '../../../src/modules/catalog/application-intake/application-intake.dto';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const VALID_APPLICATION = {
  name: 'Figma',
  vendorName: 'Figma Inc',
  homepageUrl: 'https://www.figma.com',
  dataSensitivity: 'MEDIUM',
  plan: { name: 'Organization', provisioningType: 'K2', controlLevel: 'FULL' },
};

type Call = (server: App) => request.Test;

/** The routes only the IT Admin may call (US-04-01 AC-6). */
const WRITE_ROUTES: Array<[string, Call]> = [
  ['POST /applications', (s) => request(s).post('/api/v1/applications').send(VALID_APPLICATION)],
  ['PATCH /applications/{id}', (s) => request(s).patch(`/api/v1/applications/${ID}`).send({ name: 'Figma' })],
  ['POST /functional-groups', (s) => request(s).post('/api/v1/functional-groups').send({ name: 'Design' })],
  [
    'PATCH /functional-groups/{id}',
    (s) => request(s).patch(`/api/v1/functional-groups/${ID}`).send({ name: 'Design' }),
  ],
];

/** The routes the IT Admin and Finance may read. */
const READ_ROUTES: Array<[string, Call]> = [
  ['GET /applications', (s) => request(s).get('/api/v1/applications')],
  ['GET /applications/{id}', (s) => request(s).get(`/api/v1/applications/${ID}`)],
  ['GET /functional-groups', (s) => request(s).get('/api/v1/functional-groups')],
];

describe('application catalog routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([...WRITE_ROUTES, ...READ_ROUTES])('%s without a token is 401', async (_name, call) => {
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
  ])('refuses %s on every route that changes the catalog with 403', async (_name, direct, derived) => {
    for (const [route, call] of WRITE_ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal([...direct, ...derived])))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  it.each([
    ['the Super Admin', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head', [], ['MANAGER']],
  ])('refuses %s on every route that reads the catalog with 403', async (_name, direct, derived) => {
    for (const [route, call] of READ_ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal([...direct, ...derived])))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asIt = () => ({ Authorization: bearer(principal(['IT_ADMIN'])) });
    const without = (key: keyof typeof VALID_APPLICATION) =>
      Object.fromEntries(Object.entries(VALID_APPLICATION).filter(([name]) => name !== key));

    it('QĐ-111g: takes a POST that names nobody (the IT Admin who declares it is the one responsible) and refuses one that still names a Business Owner', () => {
      expect(createApplicationBodySchema.safeParse(VALID_APPLICATION).success).toBe(true);
      expect(createApplicationBodySchema.safeParse({ ...VALID_APPLICATION, businessOwnerEmployeeId: ID }).success).toBe(
        false,
      );
    });
    const withoutPlan = without('plan');

    it('QĐ-111f: takes a POST that names no kind, no communication answer and no sensitivity, only the application and its plan', () => {
      expect(createApplicationBodySchema.safeParse(without('dataSensitivity')).success).toBe(true);
      expect(createApplicationBodySchema.safeParse({ ...VALID_APPLICATION, dataSensitivity: null }).success).toBe(true);
    });

    it.each([
      ['no name', { ...VALID_APPLICATION, name: undefined }],
      ['no plan', withoutPlan],
      ['a plan with no kind of provisioning', { ...VALID_APPLICATION, plan: { name: 'Team' } }],
      ['a kind of provisioning that is not one', { ...VALID_APPLICATION, plan: { name: 'T', provisioningType: 'K9' } }],
      [
        'a pricing model, which the system works out (B-5)',
        {
          ...VALID_APPLICATION,
          plan: { ...VALID_APPLICATION.plan, pricingModel: 'PER_SEAT' },
        },
      ],
      ['a kind of application, which follows the plan (QĐ-111d)', { ...VALID_APPLICATION, kind: 'SAAS' }],
      ['a Business Owner, which is no field any more', { ...VALID_APPLICATION, businessOwnerEmployeeId: ID }],
      ['a sensitivity that is not one', { ...VALID_APPLICATION, dataSensitivity: 'EXTREME' }],
      [
        'communication answers, which the group Liên lạc replaces (QĐ-111e)',
        {
          ...VALID_APPLICATION,
          communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
        },
      ],
      ['domains that are not a list', { ...VALID_APPLICATION, domains: 'figma.com' }],
      [
        'a dictionary line that is not a uuid',
        { ...VALID_APPLICATION, vendorName: undefined, dictionaryServiceLineId: 'L' },
      ],
      ['an unknown field', { ...VALID_APPLICATION, status: 'RETIRED' }],
    ])('turns away a POST with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a kind', { kind: 'INTERNAL' }],
      ['a vendor name', { vendorName: 'Other' }],
      ['a status', { status: 'RETIRED' }],
      ['a name that is not text', { name: 7 }],
      ['a functional group that is not a uuid', { functionalGroupId: 'G' }],
      ['communication answers, which are no field any more (QĐ-111e)', { communication: { mailbox: true } }],
      ['a functional group that is null: an application always has one (QĐ-111d)', { functionalGroupId: null }],
    ])('turns away a PATCH naming %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applications/${ID}`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['PATCH application', (s: App) => request(s).patch('/api/v1/applications/not-a-uuid').send({ name: 'x' })],
      ['GET application', (s: App) => request(s).get('/api/v1/applications/not-a-uuid')],
      [
        'PATCH functional group',
        (s: App) => request(s).patch('/api/v1/functional-groups/not-a-uuid').send({ name: 'x' }),
      ],
    ])('turns away %s with an id that is not a UUID, 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['applications with page 0', '/api/v1/applications?page=0'],
      ['applications with a page size of 101', '/api/v1/applications?pageSize=101'],
      ['applications with a kind that is not one', '/api/v1/applications?kind=FREEWARE'],
      ['applications with a status that is not one', '/api/v1/applications?status=GONE'],
      ['applications with a functional group that is not a uuid', '/api/v1/applications?functionalGroupId=G'],
      ['applications with an unknown parameter', '/api/v1/applications?x=1'],
      ['functional groups with a status that is not one', '/api/v1/functional-groups?status=GONE'],
    ])('turns away %s, 422', async (_name, path) => {
      const response = await request(app.getHttpServer()).get(path).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('turns away a functional group with no name, a name that is not text, or an unknown field, 422', async () => {
      for (const body of [{}, { name: 7 }, { name: 'x', status: 'INACTIVE' }]) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/functional-groups')
          .set(asIt())
          .send(body)
          .expect(422);
        expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('nothing in the catalog is deleted', () => {
    it('has no route that deletes an application or a functional group: DELETE is 404, even for the IT Admin', async () => {
      for (const path of [`/api/v1/applications/${ID}`, `/api/v1/functional-groups/${ID}`]) {
        const response = await request(app.getHttpServer())
          .delete(path)
          .set('Authorization', bearer(principal(['IT_ADMIN'])))
          .expect(404);
        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
