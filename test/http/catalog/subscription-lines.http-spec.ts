import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SeatChangeQueryService } from '../../../src/modules/catalog/subscription-line/seat-change-query.service';
import {
  SubscriptionLineClosedError,
  SubscriptionLineLiveTakenError,
  SubscriptionLineNotFoundError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLinePeriodStaleError,
  SubscriptionLineQuantityViaPurchaseError,
  SubscriptionLineStaleError,
} from '../../../src/modules/catalog/subscription-line/subscription-line.errors';
import { SubscriptionLineService } from '../../../src/modules/catalog/subscription-line/subscription-line.service';
import { SubscriptionChangeService } from '../../../src/modules/catalog/subscription/subscription-change.service';
import { SubscriptionService } from '../../../src/modules/catalog/subscription/subscription.service';
import { WorkspaceVendorMismatchError } from '../../../src/modules/catalog/workspace/workspace.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const dataOf = <T>(res: request.Response): T => (res.body as { data: T }).data;

const SUB_ID = '11111111-1111-4111-8111-111111111111';
const LINE_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_1 = '33333333-3333-4333-8333-333333333331';
const PLAN_2 = '33333333-3333-4333-8333-333333333332';
const REQ_ID = '44444444-4444-4444-8444-444444444444';
const EMP_ID = '55555555-5555-4555-8555-555555555555';
const PUR_ID = '66666666-6666-4666-8666-666666666666';
const TS = '2026-11-20T00:00:00.000Z';

const lineView = {
  id: LINE_ID,
  plan: { id: PLAN_2, name: 'FigJam' },
  monthlyUnitPrice: { amount: '375000', currency: 'VND' },
  minimumSeats: 5,
  seatsToday: 4,
  assignedToday: 0,
  freeToday: 4,
  closedOn: null,
  closedReason: null,
  updatedAt: TS,
};

const subscriptionView = {
  id: SUB_ID,
  planId: PLAN_1,
  planName: 'Figma Design',
  applicationId: '77777777-7777-4777-8777-777777777777',
  applicationName: 'Figma',
  logoUrl: null,
  vendor: { id: '88888888-8888-4888-8888-888888888888', name: 'Figma' },
  kind: 'TERM',
  status: 'ACTIVE',
  missingFinancialData: false,
  missing: [],
  purchasedQuantity: 10,
  unitPrice: null,
  monthlyUnitPrice: null,
  originalPrice: null,
  billingCycle: 'MONTHLY',
  commitmentTermMonths: 1,
  startDate: '2026-11-01',
  endDate: '2027-10-31',
  renewalDate: '2027-11-01',
  noticePeriodDays: null,
  autoRenew: false,
  allowsMidTermReduction: false,
  responsibleItAdminEmployeeId: EMP_ID,
  responsibleItAdmin: { employeeId: EMP_ID, employeeCode: 'KHOA', fullName: 'Khoa Tran' },
  vendorMinimumSeats: null,
  workspace: { id: '99999999-9999-4999-8999-999999999999', name: 'Figma WS' },
  seatCounting: 'FIXED',
  minimumSeatsTotal: null,
  invoicedLater: false,
  isPrimaryForPlan: false,
  expiry: null,
  daysLeft: null,
  deadlineKind: null,
  seats: { purchased: 10, assigned: 2, free: 8, inRevocation: 0 },
  noticeDeadline: { value: null, source: 'MISSING' },
  alerts: { baseDate: null, dates: [] },
  warnings: [],
  mergeCandidateIds: [],
  lines: [
    {
      id: LINE_ID,
      plan: { id: PLAN_1, name: 'Figma Design' },
      monthlyUnitPrice: { amount: '500000', currency: 'VND' },
      minimumSeats: 2,
      seatsToday: 10,
      assignedToday: 2,
      freeToday: 8,
      closedOn: null,
      closedReason: null,
    },
  ],
  lineCount: 1,
  seatsToday: 10,
  vendorAdmins: [],
  ownerAccountEmail: null,
  adminNote: null,
  vendorAdminsBelowMinimum: false,
  ownerAccountEmailMissing: false,
  taxProfile: { status: 'MISSING', group: null },
  taxEstimate: null,
  createdAt: TS,
  updatedAt: TS,
};

describe('Subscription lines HTTP routes (W3-15)', () => {
  let app: INestApplication<App>;
  const itAuth = bearer(principal(['IT_ADMIN'], { employeeId: EMP_ID }));
  const financeAuth = bearer(principal(['FINANCE']));
  const employeeAuth = bearer(principal(['EMPLOYEE']));

  const lineSvc = {
    addLine: jest.fn(),
    updateLine: jest.fn(),
  };
  const changeQuerySvc = {
    listByLine: jest.fn(),
  };
  const subSvc = {
    list: jest.fn(),
    get: jest.fn(),
    declare: jest.fn(),
    complete: jest.fn(),
    onboardingCandidate: jest.fn(),
  };
  const changeSvc = { update: jest.fn() };

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: SubscriptionLineService, useValue: lineSvc },
        { token: SeatChangeQueryService, useValue: changeQuerySvc },
        { token: SubscriptionService, useValue: subSvc },
        { token: SubscriptionChangeService, useValue: changeSvc },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/subscriptions/:id/lines', () => {
    const validBody = {
      planId: PLAN_2,
      monthlyUnitPrice: { amount: '375000', currency: 'VND' },
      minimumSeats: 5,
      quantity: 4,
      expectedUpdatedAt: TS,
    };

    it('returns 201 SUBSCRIPTION_LINE.ADDED on valid addLine', async () => {
      lineSvc.addLine.mockResolvedValue(lineView);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${SUB_ID}/lines`)
        .set('Authorization', itAuth)
        .send(validBody)
        .expect(201);

      expect(dataOf<typeof lineView>(res)).toEqual(lineView);
    });

    it('returns 403 SUBSCRIPTION_LINE.NOT_RESPONSIBLE for non-responsible IT Admin and 403 FORBIDDEN for Finance', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${SUB_ID}/lines`)
        .set('Authorization', financeAuth)
        .send(validBody)
        .expect(403);

      lineSvc.addLine.mockRejectedValue(new SubscriptionLineNotResponsibleError());
      const res = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${SUB_ID}/lines`)
        .set('Authorization', itAuth)
        .send(validBody)
        .expect(403);

      expect(bodyOf(res).error.code).toBe('SUBSCRIPTION_LINE.NOT_RESPONSIBLE');
    });

    it('returns 422 SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE, 409 SUBSCRIPTION.DUPLICATE_PLAN, 409 SUBSCRIPTION.STALE, 422 WORKSPACE_VENDOR_MISMATCH', async () => {
      lineSvc.addLine.mockRejectedValueOnce(new SubscriptionLineQuantityViaPurchaseError());
      const qtyRes = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${SUB_ID}/lines`)
        .set('Authorization', itAuth)
        .send(validBody)
        .expect(422);
      expect(bodyOf(qtyRes).error.code).toBe('SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE');

      lineSvc.addLine.mockRejectedValueOnce(new SubscriptionLineLiveTakenError());
      const dupRes = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${SUB_ID}/lines`)
        .set('Authorization', itAuth)
        .send(validBody)
        .expect(409);
      expect(bodyOf(dupRes).error.code).toBe('SUBSCRIPTION.DUPLICATE_PLAN');

      lineSvc.addLine.mockRejectedValueOnce(new SubscriptionLinePeriodStaleError(new Date(TS)));
      const staleRes = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${SUB_ID}/lines`)
        .set('Authorization', itAuth)
        .send(validBody)
        .expect(409);
      expect(bodyOf(staleRes).error.code).toBe('SUBSCRIPTION.STALE');

      lineSvc.addLine.mockRejectedValueOnce(new WorkspaceVendorMismatchError());
      const vendorRes = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${SUB_ID}/lines`)
        .set('Authorization', itAuth)
        .send(validBody)
        .expect(422);
      expect(bodyOf(vendorRes).error.code).toBe('WORKSPACE_VENDOR_MISMATCH');
    });
  });

  describe('PATCH /api/v1/subscription-lines/:id', () => {
    it('updates line price/minimumSeats and maps 403/404/409 CLOSED/409 STALE', async () => {
      lineSvc.updateLine.mockResolvedValueOnce(lineView);
      const ok = await request(app.getHttpServer())
        .patch(`/api/v1/subscription-lines/${LINE_ID}`)
        .set('Authorization', itAuth)
        .send({ monthlyUnitPrice: { amount: '400000', currency: 'VND' }, expectedUpdatedAt: TS })
        .expect(200);
      expect(dataOf<typeof lineView>(ok).id).toBe(LINE_ID);

      lineSvc.updateLine.mockRejectedValueOnce(new SubscriptionLineClosedError());
      const closed = await request(app.getHttpServer())
        .patch(`/api/v1/subscription-lines/${LINE_ID}`)
        .set('Authorization', itAuth)
        .send({ monthlyUnitPrice: { amount: '400000', currency: 'VND' }, expectedUpdatedAt: TS })
        .expect(409);
      expect(bodyOf(closed).error.code).toBe('SUBSCRIPTION_LINE.CLOSED');

      lineSvc.updateLine.mockRejectedValueOnce(new SubscriptionLineStaleError(new Date(TS)));
      const stale = await request(app.getHttpServer())
        .patch(`/api/v1/subscription-lines/${LINE_ID}`)
        .set('Authorization', itAuth)
        .send({ monthlyUnitPrice: { amount: '400000', currency: 'VND' }, expectedUpdatedAt: TS })
        .expect(409);
      expect(bodyOf(stale).error.code).toBe('SUBSCRIPTION_LINE.STALE');

      lineSvc.updateLine.mockRejectedValueOnce(new SubscriptionLineNotFoundError());
      const missing = await request(app.getHttpServer())
        .patch(`/api/v1/subscription-lines/${LINE_ID}`)
        .set('Authorization', itAuth)
        .send({ monthlyUnitPrice: { amount: '400000', currency: 'VND' }, expectedUpdatedAt: TS })
        .expect(404);
      expect(bodyOf(missing).error.code).toBe('SUBSCRIPTION_LINE.NOT_FOUND');
    });
  });

  describe('GET /api/v1/subscription-lines/:id/seat-changes', () => {
    it('allows IT_ADMIN/FINANCE, rejects EMPLOYEE, validates pageSize<=100, and returns seat-change items', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/subscription-lines/${LINE_ID}/seat-changes`)
        .set('Authorization', employeeAuth)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/subscription-lines/${LINE_ID}/seat-changes?pageSize=101`)
        .set('Authorization', financeAuth)
        .expect(422);

      changeQuerySvc.listByLine.mockResolvedValueOnce({
        items: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            effectiveOn: '2026-11-20',
            delta: 3,
            reason: 'TOP_UP',
            source: 'VENDOR_RECORD',
            basis: 'NONE',
            request: { id: REQ_ID, code: null },
            beneficiary: { employeeId: EMP_ID, employeeCode: 'KHOA', fullName: 'Khoa Tran' },
            seatPurchase: { id: PUR_ID, code: 'MUA-000001' },
            note: 'top up',
            outOfProcess: false,
            autoRecorded: false,
            recordedBy: { employeeId: EMP_ID, fullName: 'Khoa Tran' },
            recordedAt: TS,
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/subscription-lines/${LINE_ID}/seat-changes?page=1&pageSize=20`)
        .set('Authorization', financeAuth)
        .expect(200);

      expect(dataOf<{ items: unknown[]; pagination: { totalItems: number } }>(res).pagination.totalItems).toBe(1);
    });
  });

  describe('POST /api/v1/subscriptions with lines[] and subscriptionGet/List shapes', () => {
    it('creates subscription with lines[], rejects LINES_XOR_PLAN, and shapes get vs list', async () => {
      subSvc.declare.mockResolvedValueOnce({ ...subscriptionView, createdAt: new Date(TS), updatedAt: new Date(TS) });

      const created = await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set('Authorization', itAuth)
        .send({
          kind: 'TERM',
          billingCycle: 'MONTHLY',
          commitmentTermMonths: 1,
          startDate: '2026-11-01',
          endDate: '2027-10-31',
          lines: [
            { planId: PLAN_1, monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 10, minimumSeats: 2 },
          ],
        })
        .expect(201);
      expect(dataOf<{ lines: unknown[] }>(created).lines).toHaveLength(1);

      const { SubscriptionLinesXorPlanError } =
        await import('../../../src/modules/catalog/subscription/subscription.errors');
      subSvc.declare.mockRejectedValueOnce(new SubscriptionLinesXorPlanError());
      const xor = await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set('Authorization', itAuth)
        .send({
          kind: 'TERM',
          planId: PLAN_1,
          lines: [{ planId: PLAN_2, monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 5 }],
        })
        .expect(422);
      expect(bodyOf(xor).error.code).toBe('SUBSCRIPTION.LINES_XOR_PLAN');

      subSvc.list.mockResolvedValueOnce({
        items: [{ ...subscriptionView, createdAt: new Date(TS), updatedAt: new Date(TS) }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });
      subSvc.onboardingCandidate.mockResolvedValueOnce(null);
      const list = await request(app.getHttpServer())
        .get('/api/v1/subscriptions')
        .set('Authorization', itAuth)
        .expect(200);
      const listItem = dataOf<{ items: Array<Record<string, unknown>> }>(list).items[0];
      expect(listItem.lineCount).toBe(1);
      expect(listItem.seatsToday).toBe(10);
      expect(listItem.lines).toBeUndefined();
    });

    it('F-2: returns 422 SUBSCRIPTION.STILL_DRAFT missing=[UNIT_PRICE] on unpriced draft completion, and returns priced line after PATCH + complete', async () => {
      const { SubscriptionStillDraftError } =
        await import('../../../src/modules/catalog/subscription/subscription.errors');
      subSvc.complete.mockRejectedValueOnce(new SubscriptionStillDraftError(['UNIT_PRICE']));

      const draftErr = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${SUB_ID}/completions`)
        .set('Authorization', itAuth)
        .expect(422);
      expect(bodyOf(draftErr).error).toMatchObject({
        code: 'SUBSCRIPTION.STILL_DRAFT',
        details: { missing: ['UNIT_PRICE'] },
      });

      const patchedView = {
        ...subscriptionView,
        status: 'DRAFT' as const,
        missingFinancialData: true,
        missing: [],
        monthlyUnitPrice: { amount: '600000', currency: 'VND' },
        lines: [{ ...subscriptionView.lines[0], monthlyUnitPrice: { amount: '600000', currency: 'VND' } }],
        createdAt: new Date(TS),
        updatedAt: new Date(TS),
      };
      changeSvc.update.mockResolvedValueOnce(patchedView);
      await request(app.getHttpServer())
        .patch(`/api/v1/subscriptions/${SUB_ID}`)
        .set('Authorization', itAuth)
        .send({ monthlyUnitPrice: { amount: '600000', currency: 'VND' }, expectedUpdatedAt: TS })
        .expect(200);

      subSvc.complete.mockResolvedValueOnce({ ...patchedView, status: 'ACTIVE', missingFinancialData: false });
      const completed = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${SUB_ID}/completions`)
        .set('Authorization', itAuth)
        .expect(200);
      const completedBody = dataOf<{ lines: Array<{ monthlyUnitPrice: { amount: string; currency: string } }> }>(
        completed,
      );
      expect(completedBody.lines[0].monthlyUnitPrice).toEqual({
        amount: '600000',
        currency: 'VND',
      });
    });

    it('F-3: POST /subscriptions rejects multi-line draft with 422 SUBSCRIPTION.STILL_DRAFT and returns 201 for 10/2 active lines', async () => {
      const { SubscriptionStillDraftError } =
        await import('../../../src/modules/catalog/subscription/subscription.errors');
      subSvc.declare.mockRejectedValueOnce(new SubscriptionStillDraftError(['START_DATE']));

      const draftErr = await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set('Authorization', itAuth)
        .send({
          kind: 'TERM',
          billingCycle: 'MONTHLY',
          commitmentTermMonths: 1,
          lines: [
            { planId: PLAN_1, monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 10 },
            { planId: PLAN_2, monthlyUnitPrice: { amount: '2500000', currency: 'VND' }, quantity: 2 },
          ],
        })
        .expect(422);
      expect(bodyOf(draftErr).error).toMatchObject({
        code: 'SUBSCRIPTION.STILL_DRAFT',
        details: { missing: ['START_DATE'] },
      });

      const activeView = {
        ...subscriptionView,
        purchasedQuantity: 12,
        seatsToday: 12,
        lineCount: 2,
        lines: [
          { ...subscriptionView.lines[0], plan: { id: PLAN_1, name: 'Standard' }, seatsToday: 10, freeToday: 8 },
          {
            ...subscriptionView.lines[0],
            id: '33333333-3333-4333-8333-333333333339',
            plan: { id: PLAN_2, name: 'Premium' },
            monthlyUnitPrice: { amount: '2500000', currency: 'VND' },
            seatsToday: 2,
            assignedToday: 0,
            freeToday: 2,
          },
        ],
        createdAt: new Date(TS),
        updatedAt: new Date(TS),
      };
      subSvc.declare.mockResolvedValueOnce(activeView);
      const created = await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set('Authorization', itAuth)
        .send({
          kind: 'TERM',
          billingCycle: 'ANNUAL',
          commitmentTermMonths: 12,
          startDate: '2026-11-01',
          lines: [
            { planId: PLAN_1, monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 10 },
            { planId: PLAN_2, monthlyUnitPrice: { amount: '2500000', currency: 'VND' }, quantity: 2 },
          ],
        })
        .expect(201);
      const createdData = dataOf<{ lines: Array<{ seatsToday: number }> }>(created);
      expect(createdData.lines.map((item) => item.seatsToday)).toEqual([10, 2]);
    });
  });
});
