import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  declareSubscriptionBodySchema,
  updateSubscriptionBodySchema,
} from '../../../src/modules/catalog/subscription/subscription.dto';
import { SubscriptionChangeService } from '../../../src/modules/catalog/subscription/subscription-change.service';
import {
  SubscriptionMidTermReductionNotAllowedError,
  SubscriptionQuantityReasonRequiredError,
  SubscriptionVersionRequiredError,
} from '../../../src/modules/catalog/subscription/subscription.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const VALID_SUBSCRIPTION = {
  planId: ID,
  kind: 'TERM',
  purchasedQuantity: 100,
  unitPrice: { amount: '1200000', currency: 'VND' },
  billingCycle: 'ANNUAL',
  startDate: '2026-01-01',
  renewalDate: '2026-12-31',
  noticeDeadline: '2026-12-01',
  autoRenew: true,
};

const without = (source: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));

type Call = (server: App) => request.Test;

/** The routes only the IT Admin may call (US-04-03 AC-10). */
const WRITE_ROUTES: Array<[string, Call]> = [
  ['POST /subscriptions', (s) => request(s).post('/api/v1/subscriptions').send(VALID_SUBSCRIPTION)],
  ['PATCH /subscriptions/{id}', (s) => request(s).patch(`/api/v1/subscriptions/${ID}`).send({ purchasedQuantity: 5 })],
  ['POST /subscriptions/{id}/completions', (s) => request(s).post(`/api/v1/subscriptions/${ID}/completions`)],
];

/** The routes the IT Admin and Finance may read; the department head sees no price (SoD-2). */
const READ_ROUTES: Array<[string, Call]> = [
  ['GET /subscriptions', (s) => request(s).get('/api/v1/subscriptions')],
  ['GET /subscriptions/{id}', (s) => request(s).get(`/api/v1/subscriptions/${ID}`)],
];

describe('subscription routes (e2e, no database)', () => {
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
    ['the spending approver, who does not declare subscriptions (SoD-5)', [], ['SPENDING_APPROVER']],
  ])('refuses %s on every route that changes subscriptions with 403', async (_name, direct, derived) => {
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
    ['a department head, who sees no contract, price or subscription (SoD-2)', [], ['MANAGER']],
    ['the spending approver', [], ['SPENDING_APPROVER']],
  ])('refuses %s on every route that reads subscriptions with 403', async (_name, direct, derived) => {
    for (const [route, call] of READ_ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal([...direct, ...derived])))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asIt = () => ({ Authorization: bearer(principal(['IT_ADMIN'])) });

    it('QĐ-113g: takes a POST with no owner department, a K1 one too; the body is strict, so the field is refused', () => {
      expect(declareSubscriptionBodySchema.safeParse(VALID_SUBSCRIPTION).success).toBe(true);
      expect(declareSubscriptionBodySchema.safeParse({ ...VALID_SUBSCRIPTION, ownerDepartmentId: ID }).success).toBe(
        false,
      );
    });

    it('QĐ-111an: takes the price a vendor quoted in another currency beside the price in dong, and a PATCH takes it away with null', () => {
      const original = { amount: '48.00', currency: 'USD' };

      expect(declareSubscriptionBodySchema.safeParse({ ...VALID_SUBSCRIPTION, originalPrice: original }).success).toBe(
        true,
      );
      expect(updateSubscriptionBodySchema.safeParse({ originalPrice: original }).success).toBe(true);
      expect(updateSubscriptionBodySchema.safeParse({ originalPrice: null }).success).toBe(true);
    });

    it.each([
      ['a plan that is not a uuid', { ...VALID_SUBSCRIPTION, planId: 'P' }],
      ['an owner department, which a subscription has none of', { ...VALID_SUBSCRIPTION, ownerDepartmentId: ID }],
      ['an owner department that is null', { ...VALID_SUBSCRIPTION, ownerDepartmentId: null }],
      ['no kind', without(VALID_SUBSCRIPTION, 'kind')],
      ['a kind that is not one', { ...VALID_SUBSCRIPTION, kind: 'LEASE' }],
      ['a negative quantity', { ...VALID_SUBSCRIPTION, purchasedQuantity: -1 }],
      ['a quantity that is not whole', { ...VALID_SUBSCRIPTION, purchasedQuantity: 1.5 }],
      ['a quantity over a billion', { ...VALID_SUBSCRIPTION, purchasedQuantity: 1_000_000_001 }],
      ['a price that is a JSON number', { ...VALID_SUBSCRIPTION, unitPrice: 1200 }],
      ['a price amount that is a JSON number', { ...VALID_SUBSCRIPTION, unitPrice: { amount: 1200, currency: 'USD' } }],
      ['a price without a currency (US-04-05 AC-3)', { ...VALID_SUBSCRIPTION, unitPrice: { amount: '1200.00' } }],
      ['a price currency in lower case', { ...VALID_SUBSCRIPTION, unitPrice: { amount: '1', currency: 'usd' } }],
      ['an original price that is a JSON number', { ...VALID_SUBSCRIPTION, originalPrice: 48 }],
      ['an original price without a currency', { ...VALID_SUBSCRIPTION, originalPrice: { amount: '48.00' } }],
      ['an original price that is null', { ...VALID_SUBSCRIPTION, originalPrice: null }],
      [
        'an original price with an amount in minor units',
        { ...VALID_SUBSCRIPTION, originalPrice: { amountMinor: '4800', currency: 'USD' } },
      ],
      ['a billing cycle that is not one', { ...VALID_SUBSCRIPTION, billingCycle: 'WEEKLY' }],
      ['a date that is not real', { ...VALID_SUBSCRIPTION, startDate: '2026-02-30' }],
      ['a date written the wrong way', { ...VALID_SUBSCRIPTION, endDate: '31/12/2026' }],
      ['a notice period that is negative', { ...VALID_SUBSCRIPTION, noticePeriodDays: -1 }],
      ['a flag that is not a boolean', { ...VALID_SUBSCRIPTION, autoRenew: 'yes' }],
      ['an unknown field', { ...VALID_SUBSCRIPTION, status: 'ACTIVE' }],
      ['a converted value typed in', { ...VALID_SUBSCRIPTION, priceSnapshot: { reportingAmount: '1' } }],
    ])('turns away a POST with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('W3-15: refuses POST with neither planId nor lines as 422 SUBSCRIPTION.LINES_XOR_PLAN', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set(asIt())
        .send(without(VALID_SUBSCRIPTION, 'planId'))
        .expect(422);

      expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.LINES_XOR_PLAN');
    });

    it.each([
      ['a plan', { planId: ID }],
      ['an owner department, which a subscription has none of', { ownerDepartmentId: ID }],
      ['a kind', { kind: 'PERPETUAL' }],
      ['a status', { status: 'ACTIVE' }],
      ['a null price', { unitPrice: null }],
      ['a null quantity', { purchasedQuantity: null }],
      ['a null start date', { startDate: null }],
      ['a null billing cycle', { billingCycle: null }],
      ['a null auto renewal', { autoRenew: null }],
      ['a snapshot', { priceSnapshot: {} }],
    ])('turns away a PATCH naming %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/subscriptions/${ID}`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['GET', (s: App) => request(s).get('/api/v1/subscriptions/not-a-uuid')],
      ['PATCH', (s: App) => request(s).patch('/api/v1/subscriptions/not-a-uuid').send({ purchasedQuantity: 1 })],
      ['POST completions', (s: App) => request(s).post('/api/v1/subscriptions/not-a-uuid/completions')],
    ])('turns away %s with an id that is not a UUID, 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['page 0', '/api/v1/subscriptions?page=0'],
      ['a page size of 101', '/api/v1/subscriptions?pageSize=101'],
      ['an application that is not a uuid', '/api/v1/subscriptions?applicationId=A'],
      ['a plan that is not a uuid', '/api/v1/subscriptions?planId=P'],
      ['a status that is not one', '/api/v1/subscriptions?status=ENDED'],
      ['a kind that is not one', '/api/v1/subscriptions?kind=LEASE'],
      ['a warning that is not one', '/api/v1/subscriptions?warning=ANY'],
      ['an unknown parameter', '/api/v1/subscriptions?x=1'],
    ])('turns away a list with %s, 422', async (_name, path) => {
      const response = await request(app.getHttpServer()).get(path).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('nothing is deleted', () => {
    it('has no route that deletes a subscription: DELETE is 404, even for the IT Admin', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/subscriptions/${ID}`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .expect(404);

      expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
    });
  });

  describe('PATCH /subscriptions/:id quantity change HTTP error mapping', () => {
    let mockedApp: INestApplication<App>;
    const update = jest.fn();

    beforeAll(async () => {
      mockedApp = await createHttpContractApp({
        overrides: [{ token: SubscriptionChangeService, useValue: { update } }],
      });
    });

    afterAll(async () => {
      await mockedApp?.close();
    });

    it('accepts quantityChangeReason up to 500 trimmed chars and rejects blank or >500 chars', () => {
      expect(updateSubscriptionBodySchema.safeParse({ quantityChangeReason: '  New hires  ' })).toMatchObject({
        success: true,
        data: { quantityChangeReason: 'New hires' },
      });
      expect(updateSubscriptionBodySchema.safeParse({ quantityChangeReason: '   ' }).success).toBe(false);
      expect(updateSubscriptionBodySchema.safeParse({ quantityChangeReason: 'a'.repeat(501) }).success).toBe(false);
    });

    it('maps SubscriptionVersionRequiredError to 422 SUBSCRIPTION.VERSION_REQUIRED', async () => {
      update.mockRejectedValueOnce(new SubscriptionVersionRequiredError());

      const response = await request(mockedApp.getHttpServer())
        .patch(`/api/v1/subscriptions/${ID}`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({ purchasedQuantity: 10 })
        .expect(422);

      expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.VERSION_REQUIRED');
    });

    it('maps SubscriptionQuantityReasonRequiredError to 422 SUBSCRIPTION.QUANTITY_REASON_REQUIRED', async () => {
      update.mockRejectedValueOnce(new SubscriptionQuantityReasonRequiredError());

      const response = await request(mockedApp.getHttpServer())
        .patch(`/api/v1/subscriptions/${ID}`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({ purchasedQuantity: 12, expectedUpdatedAt: '2026-11-10T00:00:00.000Z' })
        .expect(422);

      expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.QUANTITY_REASON_REQUIRED');
    });

    it('maps SubscriptionMidTermReductionNotAllowedError to 409 SUBSCRIPTION.MID_TERM_REDUCTION_NOT_ALLOWED', async () => {
      update.mockRejectedValueOnce(new SubscriptionMidTermReductionNotAllowedError());

      const response = await request(mockedApp.getHttpServer())
        .patch(`/api/v1/subscriptions/${ID}`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({ purchasedQuantity: 5, expectedUpdatedAt: '2026-11-10T00:00:00.000Z' })
        .expect(409);

      expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.MID_TERM_REDUCTION_NOT_ALLOWED');
    });
  });
});
