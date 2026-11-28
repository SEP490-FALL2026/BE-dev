import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  SeatLedgerInvalidRefundTargetError,
  SeatLedgerMidTermReductionNotAllowedError,
  SeatLedgerReductionExceedsPurchaseError,
} from '../../../src/modules/catalog/subscription-line/correction/subscription-line-correction.errors';
import { SubscriptionLineCorrectionService } from '../../../src/modules/catalog/subscription-line/correction/subscription-line-correction.service';
import {
  SeatLedgerBelowOccupancyError,
  SeatLedgerEffectiveInClosedMonthError,
  SubscriptionLineClosedError,
  SubscriptionLineNotFoundError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLineStaleError,
} from '../../../src/modules/catalog/subscription-line/subscription-line.errors';
import {
  SeatPurchaseLineNotFoundError,
  SeatPurchaseTierStepOneItemError,
} from '../../../src/modules/catalog/public/seat-ledger.api';
import { SeatPurchaseRouteService } from '../../../src/modules/licensing/seat-purchase/seat-purchase-route.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const LINE_ID = '11111111-1111-4111-8111-111111111111';
const LINE_OLD = '22222222-2222-4222-8222-222222222222';
const REQ_1 = '33333333-3333-4333-8333-333333333333';
const EMP_1 = '44444444-4444-4444-8444-444444444444';
const CHG_ID = '55555555-5555-4555-8555-555555555555';
const PUR_ID = '66666666-6666-4666-8666-666666666666';
const TS = '2026-11-20T00:00:00.000Z';

describe('Subscription line seats HTTP contract (W3-19)', () => {
  let app: INestApplication<App>;
  const itAuth = bearer(principal(['IT_ADMIN']));
  const empAuth = bearer(principal(['EMPLOYEE']));

  const correctionSvc = {
    recordCorrection: jest.fn(),
    recordReduction: jest.fn(),
  };
  const purchaseSvc = {
    purchase: jest.fn(),
  };

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: SubscriptionLineCorrectionService, useValue: correctionSvc },
        { token: SeatPurchaseRouteService, useValue: purchaseSvc },
      ],
    });
  });

  afterEach(() => jest.clearAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  describe('POST /api/v1/subscription-lines/:id/seat-corrections', () => {
    const validBody = {
      delta: 1,
      effectiveOn: '2026-11-21',
      note: 'Vendor SBF-08 discrepancy',
      expectedUpdatedAt: TS,
    };

    it('requires authentication, IT_ADMIN role, and validates delta != 0 and note', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/seat-corrections`)
        .send(validBody)
        .expect(401);

      await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/seat-corrections`)
        .set('Authorization', empAuth)
        .send(validBody)
        .expect(403);

      for (const invalid of [
        { ...validBody, delta: 0 },
        { ...validBody, delta: 10_001 },
        { ...validBody, note: '   ' },
      ]) {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/subscription-lines/${LINE_ID}/seat-corrections`)
          .set('Authorization', itAuth)
          .send(invalid)
          .expect(422);
        expect(bodyOf(res).error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('returns 201 SEAT_CORRECTION.RECORDED and maps 403/404/409/422 errors', async () => {
      correctionSvc.recordCorrection.mockResolvedValueOnce({
        id: CHG_ID,
        subscriptionLineId: LINE_ID,
        effectiveOn: '2026-11-21',
        delta: 1,
        reason: 'TOP_UP',
        source: 'VENDOR_RECORD',
        basis: 'NONE',
        requestId: null,
        beneficiaryEmployeeId: null,
        refundedSeatChangeId: null,
        note: validBody.note,
        outOfProcess: true,
        recordedByEmployeeId: EMP_1,
        recordedAt: TS,
      });

      const ok = await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/seat-corrections`)
        .set('Authorization', itAuth)
        .send(validBody)
        .expect(201);
      expect(bodyOf(ok)).toMatchObject({ message: 'SEAT_CORRECTION.RECORDED', data: { outOfProcess: true } });

      for (const [err, status, code] of [
        [new SubscriptionLineNotResponsibleError(), 403, 'SUBSCRIPTION_LINE.NOT_RESPONSIBLE'],
        [new SubscriptionLineNotFoundError(), 404, 'SUBSCRIPTION_LINE.NOT_FOUND'],
        [new SeatLedgerBelowOccupancyError(), 409, 'SEAT_LEDGER.BELOW_OCCUPANCY'],
        [new SubscriptionLineStaleError(new Date(TS)), 409, 'SUBSCRIPTION_LINE.STALE'],
        [new SubscriptionLineClosedError(), 409, 'SUBSCRIPTION_LINE.CLOSED'],
        [new SeatLedgerEffectiveInClosedMonthError('2026-12-01'), 422, 'SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH'],
      ] as const) {
        correctionSvc.recordCorrection.mockRejectedValueOnce(err);
        const res = await request(app.getHttpServer())
          .post(`/api/v1/subscription-lines/${LINE_ID}/seat-corrections`)
          .set('Authorization', itAuth)
          .send(validBody)
          .expect(status);
        expect(bodyOf(res).error.code).toBe(code);
      }
    });
  });

  describe('POST /api/v1/subscription-lines/:id/seat-reductions', () => {
    const validBody = {
      refundedSeatChangeId: CHG_ID,
      quantity: 2,
      effectiveOn: '2027-03-06',
      note: 'Mid-term reduction',
      expectedUpdatedAt: '2027-03-03T00:00:00.000Z',
    };

    it('returns 201 SEAT_REDUCTION.RECORDED and maps 403/404/409/422 errors', async () => {
      correctionSvc.recordReduction.mockResolvedValueOnce({
        id: CHG_ID,
        subscriptionLineId: LINE_ID,
        effectiveOn: '2027-03-06',
        delta: -2,
        reason: 'REDUCE',
        source: 'VENDOR_RECORD',
        basis: 'NONE',
        requestId: null,
        beneficiaryEmployeeId: null,
        refundedSeatChangeId: CHG_ID,
        note: validBody.note,
        outOfProcess: false,
        recordedByEmployeeId: EMP_1,
        recordedAt: TS,
      });

      const ok = await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/seat-reductions`)
        .set('Authorization', itAuth)
        .send(validBody)
        .expect(201);
      expect(bodyOf(ok)).toMatchObject({ message: 'SEAT_REDUCTION.RECORDED', data: { delta: -2 } });

      for (const [err, status, code] of [
        [new SubscriptionLineNotResponsibleError(), 403, 'SUBSCRIPTION_LINE.NOT_RESPONSIBLE'],
        [new SubscriptionLineNotFoundError(), 404, 'SUBSCRIPTION_LINE.NOT_FOUND'],
        [new SeatLedgerMidTermReductionNotAllowedError(), 409, 'SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED'],
        [new SeatLedgerReductionExceedsPurchaseError(2, 3), 409, 'SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE'],
        [new SeatLedgerBelowOccupancyError(), 409, 'SEAT_LEDGER.BELOW_OCCUPANCY'],
        [new SeatLedgerEffectiveInClosedMonthError('2027-03-01'), 422, 'SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH'],
        [new SeatLedgerInvalidRefundTargetError(), 422, 'VALIDATION_ERROR'],
      ] as const) {
        correctionSvc.recordReduction.mockRejectedValueOnce(err);
        const res = await request(app.getHttpServer())
          .post(`/api/v1/subscription-lines/${LINE_ID}/seat-reductions`)
          .set('Authorization', itAuth)
          .send(validBody)
          .expect(status);
        expect(bodyOf(res).error.code).toBe(code);
      }
    });
  });

  describe('POST /api/v1/subscription-lines/:id/purchases (tierStepSeats & replacesFromLineId)', () => {
    it('rejects combining tierStepSeats and replacesFromLineId with 422 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
        .set('Authorization', itAuth)
        .send({
          purchasedOn: '2026-11-21',
          items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
          tierStepSeats: 50,
          replacesFromLineId: LINE_OLD,
        })
        .expect(422);
      expect(bodyOf(res).error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts tierStepSeats=50 and replacesFromLineId, and maps TIER_STEP_ONE_ITEM and BELOW_OCCUPANCY', async () => {
      purchaseSvc.purchase.mockResolvedValueOnce({
        id: PUR_ID,
        code: 'MUA-000002',
        quantity: 50,
        purchasedOn: '2026-11-21',
        invoiceObligation: 'WORKING_DAYS',
        invoiceDueOn: '2026-11-27',
        expectedAmount: { amount: '55000000', currency: 'VND' },
        changes: [],
      });
      const tierRes = await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
        .set('Authorization', itAuth)
        .send({
          purchasedOn: '2026-11-21',
          items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
          tierStepSeats: 50,
        })
        .expect(201);
      expect(bodyOf(tierRes).data).toMatchObject({ quantity: 50, expectedAmount: { amount: '55000000' } });

      purchaseSvc.purchase.mockResolvedValueOnce({
        id: PUR_ID,
        code: 'MUA-000003',
        quantity: 1,
        purchasedOn: '2026-11-21',
        invoiceObligation: 'WORKING_DAYS',
        invoiceDueOn: '2026-11-27',
        expectedAmount: { amount: '14666667', currency: 'VND' },
        changes: [],
      });
      const switchRes = await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
        .set('Authorization', itAuth)
        .send({
          purchasedOn: '2026-11-21',
          items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
          replacesFromLineId: LINE_OLD,
        })
        .expect(201);
      expect(bodyOf(switchRes).data).toMatchObject({ expectedAmount: { amount: '14666667' } });

      purchaseSvc.purchase.mockRejectedValueOnce(new SeatPurchaseTierStepOneItemError());
      const oneItem = await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
        .set('Authorization', itAuth)
        .send({
          purchasedOn: '2026-11-21',
          items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
          tierStepSeats: 50,
        })
        .expect(422);
      expect(bodyOf(oneItem).error.code).toBe('SEAT_PURCHASE.TIER_STEP_ONE_ITEM');

      purchaseSvc.purchase.mockRejectedValueOnce(new SeatLedgerBelowOccupancyError());
      const occ = await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
        .set('Authorization', itAuth)
        .send({
          purchasedOn: '2026-11-21',
          items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
          replacesFromLineId: LINE_OLD,
        })
        .expect(409);
      expect(bodyOf(occ).error.code).toBe('SEAT_LEDGER.BELOW_OCCUPANCY');

      purchaseSvc.purchase.mockRejectedValueOnce(new SeatPurchaseLineNotFoundError());
      await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
        .set('Authorization', itAuth)
        .send({ purchasedOn: '2026-11-21', items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }] })
        .expect(404);
    });
  });
});
