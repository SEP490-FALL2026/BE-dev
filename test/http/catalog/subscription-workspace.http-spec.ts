import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { SubscriptionChangeService } from '../../../src/modules/catalog/subscription/subscription-change.service';
import {
  SubscriptionDuplicatePlanError,
  SubscriptionMembersMonthlyOnlyError,
  SubscriptionMembersPaymentDayRequiredError,
  SubscriptionSeatCountingFixedError,
  SubscriptionVendorAdminsRequiredError,
} from '../../../src/modules/catalog/subscription/subscription.errors';
import { SubscriptionService } from '../../../src/modules/catalog/subscription/subscription.service';
import {
  WorkspaceNotFoundError,
  WorkspaceRequiredError,
  WorkspaceVendorMismatchError,
} from '../../../src/modules/catalog/workspace/workspace.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const PLAN_ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const SUB_ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';
const WS_ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d33';
const BASE_MEMBERS = {
  planId: PLAN_ID,
  workspaceId: WS_ID,
  kind: 'TERM',
  purchasedQuantity: 10,
  monthlyUnitPrice: { amount: '500000', currency: 'VND' },
  billingCycle: 'MONTHLY',
  commitmentTermMonths: 1,
  startDate: '2026-11-01',
  renewalDate: '2026-12-05',
  seatCounting: 'MEMBERS',
  minimumSeatsTotal: 25,
  invoicedLater: true,
};

describe('W3-11, W3-12, W3-14 workspace & seat-counting subscription HTTP contract cases (no database)', () => {
  let app: INestApplication<App>;
  const declare = jest.fn();
  const complete = jest.fn();
  const update = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: SubscriptionService, useValue: { declare, complete } },
        { token: SubscriptionChangeService, useValue: { update } },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /subscriptions forwards workspaceId, seatCounting, minimumSeatsTotal, and invoicedLater to service', async () => {
    declare.mockResolvedValueOnce({
      id: SUB_ID,
      planId: PLAN_ID,
      planName: 'Claude Pro',
      applicationId: PLAN_ID,
      applicationName: 'Claude',
      logoUrl: null,
      vendor: { id: PLAN_ID, name: 'Anthropic' },
      kind: 'TERM',
      status: 'ACTIVE',
      missingFinancialData: false,
      missing: [],
      purchasedQuantity: 10,
      unitPrice: { amount: '500000', currency: 'VND' },
      monthlyUnitPrice: { amount: '500000', currency: 'VND' },
      originalPrice: null,
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 1,
      startDate: '2026-11-01',
      endDate: null,
      renewalDate: '2026-12-05',
      noticePeriodDays: null,
      autoRenew: true,
      allowsMidTermReduction: false,
      responsibleItAdminEmployeeId: null,
      responsibleItAdmin: null,
      vendorMinimumSeats: null,
      workspace: { id: WS_ID, name: 'Anthropic' },
      seatCounting: 'MEMBERS',
      minimumSeatsTotal: 25,
      invoicedLater: true,
      isPrimaryForPlan: false,
      expiry: null,
      daysLeft: null,
      deadlineKind: null,
      noticeDeadline: { value: null, source: 'MISSING' },
      alerts: { baseDate: null, dates: null },
      warnings: [],
      mergeCandidateIds: [],
      vendorAdmins: [],
      ownerAccountEmail: null,
      adminNote: null,
      vendorAdminsBelowMinimum: false,
      ownerAccountEmailMissing: false,
      taxProfile: { status: 'MISSING', group: null },
      taxEstimate: null,
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(BASE_MEMBERS)
      .expect(201);

    expect(declare).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: WS_ID,
        seatCounting: 'MEMBERS',
        minimumSeatsTotal: 25,
        invoicedLater: true,
      }),
    );
  });

  it.each([
    [
      'SubscriptionMembersMonthlyOnlyError',
      () => new SubscriptionMembersMonthlyOnlyError(),
      422,
      'SUBSCRIPTION.MEMBERS_MONTHLY_ONLY',
    ],
    [
      'SubscriptionMembersPaymentDayRequiredError',
      () => new SubscriptionMembersPaymentDayRequiredError(),
      422,
      'SUBSCRIPTION.MEMBERS_PAYMENT_DAY_REQUIRED',
    ],
    [
      'SubscriptionVendorAdminsRequiredError',
      () => new SubscriptionVendorAdminsRequiredError(PLAN_ID, 1, 2),
      422,
      'SUBSCRIPTION.VENDOR_ADMINS_REQUIRED',
    ],
    [
      'SubscriptionDuplicatePlanError',
      () => new SubscriptionDuplicatePlanError([SUB_ID]),
      409,
      'SUBSCRIPTION.DUPLICATE_PLAN',
    ],
    ['WorkspaceVendorMismatchError', () => new WorkspaceVendorMismatchError(), 422, 'WORKSPACE.VENDOR_MISMATCH'],
    ['WorkspaceRequiredError', () => new WorkspaceRequiredError([WS_ID]), 422, 'WORKSPACE.REQUIRED'],
    ['WorkspaceNotFoundError', () => new WorkspaceNotFoundError(), 404, 'WORKSPACE.NOT_FOUND'],
  ] as const)('POST /subscriptions maps %s to HTTP %i %s', async (_label, buildError, status, code) => {
    declare.mockRejectedValueOnce(buildError());

    const response = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(BASE_MEMBERS)
      .expect(status);

    expect(bodyOf(response).error.code).toBe(code);
  });

  it('PATCH /subscriptions/:id maps SubscriptionSeatCountingFixedError to 422 SUBSCRIPTION.SEAT_COUNTING_FIXED', async () => {
    update.mockRejectedValueOnce(new SubscriptionSeatCountingFixedError());

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${SUB_ID}`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({ seatCounting: 'MEMBERS' })
      .expect(422);

    expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.SEAT_COUNTING_FIXED');
  });

  it('PATCH /subscriptions/:id maps SubscriptionMembersPaymentDayRequiredError to 422 SUBSCRIPTION.MEMBERS_PAYMENT_DAY_REQUIRED', async () => {
    update.mockRejectedValueOnce(new SubscriptionMembersPaymentDayRequiredError());

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${SUB_ID}`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({ renewalDate: null })
      .expect(422);

    expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.MEMBERS_PAYMENT_DAY_REQUIRED');
  });

  it('PATCH /subscriptions/:id maps SubscriptionDuplicatePlanError on workspace move to 409 SUBSCRIPTION.DUPLICATE_PLAN', async () => {
    update.mockRejectedValueOnce(new SubscriptionDuplicatePlanError([SUB_ID]));

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${SUB_ID}`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send({ workspaceId: WS_ID })
      .expect(409);

    expect(bodyOf(response).error.code).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
  });
});
