import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const VALID_PLAN = {
  applicationId: ID,
  name: 'Organization',
  provisioningType: 'K2',
  pricingModel: 'PER_SEAT',
  controlLevel: 'FULL',
};
const VALID_PROFILE = {
  primaryOwnerEmployeeId: ID,
  members: [{ employeeId: ID, role: 'OWNER' }],
  emergencyAccount: {
    identity: 'figma-breakglass',
    occupiesSeat: true,
    holderEmployeeId: ID,
    lastReviewedOn: '2026-10-01',
  },
};

const without = (source: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));

type Call = (server: App) => request.Test;

/** The routes only the IT Admin may call (US-04-02 AC-11). */
const WRITE_ROUTES: Array<[string, Call]> = [
  ['POST /plans', (s) => request(s).post('/api/v1/plans').send(VALID_PLAN)],
  ['PATCH /plans/{id}', (s) => request(s).patch(`/api/v1/plans/${ID}`).send({ name: 'Organization' })],
  [
    'PUT /plans/{id}/workspace-profile',
    (s) => request(s).put(`/api/v1/plans/${ID}/workspace-profile`).send(VALID_PROFILE),
  ],
];

/** The routes the IT Admin and Finance may read. */
const READ_ROUTES: Array<[string, Call]> = [
  ['GET /plans', (s) => request(s).get('/api/v1/plans')],
  ['GET /plans/{id}', (s) => request(s).get(`/api/v1/plans/${ID}`)],
];

describe('plan routes (e2e, no database)', () => {
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
    ['the spending approver, who does not set up plans (SoD-5)', [], ['SPENDING_APPROVER']],
  ])('refuses %s on every route that changes plans with 403', async (_name, direct, derived) => {
    for (const [route, call] of WRITE_ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  it.each([
    ['the Super Admin', ['SUPER_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head', [], ['MANAGER']],
  ])('refuses %s on every route that reads plans with 403', async (_name, direct, derived) => {
    for (const [route, call] of READ_ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asIt = () => ({ Authorization: bearer(principal(['IT_ADMIN'])) });

    it.each([
      ['no application', without(VALID_PLAN, 'applicationId')],
      ['an application that is not a uuid', { ...VALID_PLAN, applicationId: 'A' }],
      ['no name', without(VALID_PLAN, 'name')],
      ['no kind (AC-4)', without(VALID_PLAN, 'provisioningType')],
      ['a kind that is not one', { ...VALID_PLAN, provisioningType: 'K6' }],
      ['a pricing model that is not one', { ...VALID_PLAN, pricingModel: 'PER_USER' }],
      ['a control level outside the three (AC-5)', { ...VALID_PLAN, controlLevel: 'MOSTLY' }],
      ['a sharing policy that is not one', { ...VALID_PLAN, sharingPolicy: 'MAYBE' }],
      ['a flag that is not a boolean', { ...VALID_PLAN, dataLossOnRemoval: 'yes' }],
      ['a note that is not text', { ...VALID_PLAN, revocationNote: 7 }],
      ['an unknown field', { ...VALID_PLAN, seats: 10 }],
    ])('turns away a POST with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer()).post('/api/v1/plans').set(asIt()).send(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['an application', { applicationId: ID }],
      ['a kind that is not one', { provisioningType: 'K6' }],
      ['a pricing model that is not one', { pricingModel: 'PER_USER' }],
      ['a name that is not text', { name: 7 }],
      ['an unknown field', { price: 1 }],
    ])('turns away a PATCH naming %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/plans/${ID}`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no primary owner (AC-12)', without(VALID_PROFILE, 'primaryOwnerEmployeeId')],
      ['no members', { ...VALID_PROFILE, members: [] }],
      ['a member with a role that is not one', { ...VALID_PROFILE, members: [{ employeeId: ID, role: 'GUEST' }] }],
      ['a member that is not a uuid', { ...VALID_PROFILE, members: [{ employeeId: 'A1', role: 'OWNER' }] }],
      ['a limit of zero', { ...VALID_PROFILE, ownerLimit: 0 }],
      ['a limit that is not a whole number', { ...VALID_PROFILE, adminLimit: 1.5 }],
      [
        'an emergency account without its holder',
        { ...VALID_PROFILE, emergencyAccount: { identity: 'x', occupiesSeat: true, lastReviewedOn: '2026-10-01' } },
      ],
      [
        'an emergency review date that is not a date',
        { ...VALID_PROFILE, emergencyAccount: { ...VALID_PROFILE.emergencyAccount, lastReviewedOn: '2026-13-40' } },
      ],
      ['a password at the top (QĐ-77d: no password field)', { ...VALID_PROFILE, password: 'hunter2' }],
      [
        'a password in the emergency account',
        { ...VALID_PROFILE, emergencyAccount: { ...VALID_PROFILE.emergencyAccount, password: 'hunter2' } },
      ],
    ])('turns away a PUT with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/plans/${ID}/workspace-profile`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['GET plan', (s: App) => request(s).get('/api/v1/plans/not-a-uuid')],
      ['PATCH plan', (s: App) => request(s).patch('/api/v1/plans/not-a-uuid').send({ name: 'x' })],
      ['PUT profile', (s: App) => request(s).put('/api/v1/plans/not-a-uuid/workspace-profile').send(VALID_PROFILE)],
    ])('turns away %s with an id that is not a UUID, 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['page 0', '/api/v1/plans?page=0'],
      ['a page size of 101', '/api/v1/plans?pageSize=101'],
      ['an application that is not a uuid', '/api/v1/plans?applicationId=A'],
      ['a kind that is not one', '/api/v1/plans?provisioningType=K6'],
      ['an unknown parameter', '/api/v1/plans?x=1'],
    ])('turns away a list with %s, 422', async (_name, path) => {
      const response = await request(app.getHttpServer()).get(path).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('nothing is deleted', () => {
    it('has no route that deletes a plan or its profile: DELETE is 404, even for the IT Admin', async () => {
      for (const path of [`/api/v1/plans/${ID}`, `/api/v1/plans/${ID}/workspace-profile`]) {
        const response = await request(app.getHttpServer())
          .delete(path)
          .set('Authorization', bearer(principal(['IT_ADMIN'])))
          .expect(404);
        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
