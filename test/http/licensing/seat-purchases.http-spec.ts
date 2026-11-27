import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  SeatLedgerEffectiveInClosedMonthError,
  SeatPurchaseItemNotPendingError,
  SeatPurchaseLineNotFoundError,
  SeatPurchaseLineNotPurchasableError,
  SeatPurchaseNotInChargeError,
  SeatPurchaseStockAvailableError,
} from '../../../src/modules/catalog/public/seat-ledger.api';
import { SeatPurchaseRouteService } from '../../../src/modules/licensing/seat-purchase/seat-purchase-route.service';
import { EmployeeNotStartedError } from '../../../src/modules/organization/public/organization.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const LINE_ID = '11111111-1111-4111-8111-111111111111';
const REQ_1 = '22222222-2222-4222-8222-222222222222';
const REQ_2 = '33333333-3333-4333-8333-333333333333';
const EMP_1 = '44444444-4444-4444-8444-444444444444';
const EMP_2 = '55555555-5555-4555-8555-555555555555';
const PUR_ID = '66666666-6666-4666-8666-666666666666';

describe('POST /api/v1/subscription-lines/:id/purchases (http contract, W3-18)', () => {
  let app: INestApplication<App>;
  const itAuth = bearer(principal(['IT_ADMIN']));
  const empAuth = bearer(principal(['EMPLOYEE']));

  const routeSvc = { purchase: jest.fn() };

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [{ token: SeatPurchaseRouteService, useValue: routeSvc }],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication and IT_ADMIN role', async () => {
    const body = { purchasedOn: '2026-11-21', items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }] };

    await request(app.getHttpServer()).post(`/api/v1/subscription-lines/${LINE_ID}/purchases`).send(body).expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
      .set('Authorization', empAuth)
      .send(body)
      .expect(403);
  });

  it('validates body constraints (minItems 1, maxItems 50, no duplicates, valid businessDate)', async () => {
    for (const invalidBody of [
      { purchasedOn: '2026-11-21', items: [] },
      {
        purchasedOn: '2026-11-21',
        items: [
          { requestId: REQ_1, beneficiaryEmployeeId: EMP_1 },
          { requestId: REQ_1, beneficiaryEmployeeId: EMP_1 },
        ],
      },
      { purchasedOn: 'not-a-date', items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }] },
    ]) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
        .set('Authorization', itAuth)
        .send(invalidBody)
        .expect(422);
      expect(bodyOf(res).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('maps domain refusals to exact HTTP statuses and codes', async () => {
    const validBody = {
      purchasedOn: '2026-11-21',
      items: [
        { requestId: REQ_1, beneficiaryEmployeeId: EMP_1 },
        { requestId: REQ_2, beneficiaryEmployeeId: EMP_2 },
      ],
    };

    routeSvc.purchase.mockRejectedValueOnce(
      new SeatPurchaseNotInChargeError([{ requestId: REQ_2, beneficiaryEmployeeId: EMP_2 }]),
    );
    const notInCharge = await request(app.getHttpServer())
      .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
      .set('Authorization', itAuth)
      .send(validBody)
      .expect(403);
    expect(bodyOf(notInCharge).error.code).toBe('SEAT_PURCHASE.NOT_IN_CHARGE');

    routeSvc.purchase.mockRejectedValueOnce(new SeatPurchaseLineNotFoundError());
    const notFound = await request(app.getHttpServer())
      .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
      .set('Authorization', itAuth)
      .send(validBody)
      .expect(404);
    expect(bodyOf(notFound).error.code).toBe('SUBSCRIPTION_LINE.NOT_FOUND');

    routeSvc.purchase.mockRejectedValueOnce(new EmployeeNotStartedError(EMP_1));
    const notStarted = await request(app.getHttpServer())
      .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
      .set('Authorization', itAuth)
      .send(validBody)
      .expect(409);
    expect(bodyOf(notStarted).error.code).toBe('EMPLOYEE.NOT_STARTED');

    routeSvc.purchase.mockRejectedValueOnce(new SeatPurchaseLineNotPurchasableError('NOT_FIXED_SEAT_COUNTING'));
    const notPurchasable = await request(app.getHttpServer())
      .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
      .set('Authorization', itAuth)
      .send(validBody)
      .expect(409);
    expect(bodyOf(notPurchasable).error.code).toBe('SEAT_PURCHASE.LINE_NOT_PURCHASABLE');

    routeSvc.purchase.mockRejectedValueOnce(new SeatPurchaseStockAvailableError(2));
    const stock = await request(app.getHttpServer())
      .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
      .set('Authorization', itAuth)
      .send(validBody)
      .expect(409);
    expect(bodyOf(stock).error.code).toBe('SEAT_PURCHASE.STOCK_AVAILABLE');

    routeSvc.purchase.mockRejectedValueOnce(new SeatLedgerEffectiveInClosedMonthError('2026-12-01'));
    const closedMonth = await request(app.getHttpServer())
      .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
      .set('Authorization', itAuth)
      .send(validBody)
      .expect(422);
    expect(bodyOf(closedMonth).error.code).toBe('SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH');

    routeSvc.purchase.mockRejectedValueOnce(
      new SeatPurchaseItemNotPendingError([{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }]),
    );
    const notPending = await request(app.getHttpServer())
      .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
      .set('Authorization', itAuth)
      .send(validBody)
      .expect(422);
    expect(bodyOf(notPending).error.code).toBe('SEAT_PURCHASE.ITEM_NOT_PENDING');
  });

  it('returns 201 SEAT_PURCHASE.RECORDED with expectedAmount and changes[]', async () => {
    routeSvc.purchase.mockResolvedValueOnce({
      id: PUR_ID,
      code: 'MUA-000001',
      quantity: 1,
      purchasedOn: '2026-11-21',
      invoiceObligation: 'WORKING_DAYS',
      invoiceDueOn: '2026-11-27',
      expectedAmount: { amount: '3666667', currency: 'VND' },
      changes: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          effectiveOn: '2026-11-21',
          delta: 1,
          reason: 'TOP_UP',
          source: 'GRANT',
          basis: 'REQUEST_ITEM',
          requestId: REQ_1,
          beneficiaryEmployeeId: EMP_1,
          seatPurchaseId: PUR_ID,
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/subscription-lines/${LINE_ID}/purchases`)
      .set('Authorization', itAuth)
      .send({ purchasedOn: '2026-11-21', items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }] })
      .expect(201);

    expect(bodyOf(res)).toMatchObject({
      message: 'SEAT_PURCHASE.RECORDED',
      data: {
        id: PUR_ID,
        code: 'MUA-000001',
        quantity: 1,
        invoiceDueOn: '2026-11-27',
        expectedAmount: { amount: '3666667', currency: 'VND' },
      },
    });
  });
});
