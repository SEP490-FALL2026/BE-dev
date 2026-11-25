import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PlanReferenceCommitmentNotApplicableError } from '../../../src/modules/catalog/plan/plan.errors';
import { PlanService } from '../../../src/modules/catalog/plan/plan.service';
import { SubscriptionChangeService } from '../../../src/modules/catalog/subscription/subscription-change.service';
import {
  SubscriptionK1HasNoSubscriptionError,
  SubscriptionPerpetualIsLicenseLotError,
  SubscriptionPriceMismatchError,
  SubscriptionPrimaryRetiredError,
  SubscriptionSeatCountViaLedgerError,
  SubscriptionStaleError,
} from '../../../src/modules/catalog/subscription/subscription.errors';
import { SubscriptionService } from '../../../src/modules/catalog/subscription/subscription.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const BASE_CREATE = {
  planId: ID,
  kind: 'TERM',
  purchasedQuantity: 10,
  monthlyUnitPrice: { amount: '500000', currency: 'VND' },
  billingCycle: 'ANNUAL',
  commitmentTermMonths: 12,
  startDate: '2026-01-01',
};

describe('W3-02 & W3-03 catalog HTTP contract cases (e2e, no database)', () => {
  let app: INestApplication<App>;
  const declare = jest.fn();
  const update = jest.fn();
  const planDeclare = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: SubscriptionService, useValue: { declare } },
        { token: SubscriptionChangeService, useValue: { update } },
        { token: PlanService, useValue: { declare: planDeclare } },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['QUARTERLY', 'OTHER'] as const)(
    'POST /subscriptions rejects billingCycle %s with 422 VALIDATION_ERROR before reaching service',
    async (billingCycle) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({ ...BASE_CREATE, billingCycle })
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(declare).not.toHaveBeenCalled();
    },
  );

  it.each(['QUARTERLY', 'OTHER'] as const)(
    'PATCH /subscriptions/:id rejects billingCycle %s with 422 VALIDATION_ERROR before reaching service',
    async (billingCycle) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/subscriptions/${ID}`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({ billingCycle })
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('POST /subscriptions maps SubscriptionPriceMismatchError to 422 SUBSCRIPTION.PRICE_MISMATCH with expectedUnitPrice', async () => {
    declare.mockRejectedValueOnce(new SubscriptionPriceMismatchError(6_000_000n));

    const response = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({ ...BASE_CREATE, unitPrice: { amount: '6000001', currency: 'VND' } })
      .expect(422);

    expect(bodyOf(response).error).toMatchObject({
      code: 'SUBSCRIPTION.PRICE_MISMATCH',
      details: { expectedUnitPrice: { amount: '6000000', currency: 'VND' } },
    });
  });

  it('PATCH /subscriptions/:id maps SubscriptionPriceMismatchError to 422 SUBSCRIPTION.PRICE_MISMATCH', async () => {
    update.mockRejectedValueOnce(new SubscriptionPriceMismatchError(6_000_000n));

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${ID}`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({
        monthlyUnitPrice: { amount: '500000', currency: 'VND' },
        unitPrice: { amount: '6000001', currency: 'VND' },
      })
      .expect(422);

    expect(bodyOf(response).error).toMatchObject({
      code: 'SUBSCRIPTION.PRICE_MISMATCH',
      details: { expectedUnitPrice: { amount: '6000000', currency: 'VND' } },
    });
  });

  it('PATCH /subscriptions/:id on stale expectedUpdatedAt returns 409 SUBSCRIPTION.STALE', async () => {
    const current = new Date('2026-11-25T10:00:00.000Z');
    update.mockRejectedValueOnce(new SubscriptionStaleError(current));

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${ID}`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({ purchasedQuantity: 11, expectedUpdatedAt: '2026-11-25T09:00:00.000Z' })
      .expect(409);

    expect(bodyOf(response).error).toMatchObject({
      code: 'SUBSCRIPTION.STALE',
      details: { currentUpdatedAt: current.toISOString() },
    });
  });

  // W3-27: what a subscription no longer takes. The four refusals, with the code a client reads.
  it('PATCH /subscriptions/:id with purchasedQuantity answers 409 SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER with the routes that change the seats', async () => {
    update.mockRejectedValueOnce(
      new SubscriptionSeatCountViaLedgerError(['subscriptionLineSeatPurchase', 'subscriptionLineSeatCorrection']),
    );

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${ID}`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({ purchasedQuantity: 11, expectedUpdatedAt: '2026-11-25T09:00:00.000Z' })
      .expect(409);

    expect(bodyOf(response).error).toMatchObject({
      code: 'SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER',
      details: { routes: ['subscriptionLineSeatPurchase', 'subscriptionLineSeatCorrection'] },
    });
  });

  it('PATCH /subscriptions/:id with isPrimaryForPlan true answers 422 SUBSCRIPTION.PRIMARY_RETIRED', async () => {
    update.mockRejectedValueOnce(new SubscriptionPrimaryRetiredError());

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${ID}`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({ isPrimaryForPlan: true })
      .expect(422);

    expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.PRIMARY_RETIRED');
  });

  it('POST /subscriptions for a plan of personal accounts answers 422 SUBSCRIPTION.K1_HAS_NO_SUBSCRIPTION', async () => {
    declare.mockRejectedValueOnce(new SubscriptionK1HasNoSubscriptionError());

    const response = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(BASE_CREATE)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.K1_HAS_NO_SUBSCRIPTION');
  });

  it('POST /subscriptions with kind PERPETUAL answers 422 SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT', async () => {
    declare.mockRejectedValueOnce(new SubscriptionPerpetualIsLicenseLotError());

    const response = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({
        planId: ID,
        kind: 'PERPETUAL',
        unitPrice: { amount: '1000000', currency: 'VND' },
        startDate: '2026-01-01',
      })
      .expect(422);

    expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT');
  });

  it('POST /plans maps PlanReferenceCommitmentNotApplicableError to 422 PLAN.REFERENCE_COMMITMENT_NOT_APPLICABLE', async () => {
    planDeclare.mockRejectedValueOnce(new PlanReferenceCommitmentNotApplicableError());

    const response = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({
        applicationId: ID,
        name: 'Desktop',
        provisioningType: 'K4',
        controlLevel: 'FULL',
        referenceCommitmentMonths: 12,
      })
      .expect(422);

    expect(bodyOf(response).error.code).toBe('PLAN.REFERENCE_COMMITMENT_NOT_APPLICABLE');
  });
});
