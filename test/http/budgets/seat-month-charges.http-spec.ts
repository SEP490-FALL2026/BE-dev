import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { SeatMonthQueryService } from '../../../src/modules/budgets/seat-month/seat-month-query.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const PATH = '/api/v1/seat-month-charges';
const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

/**
 * The route of the seat-months of a month (`SM-1`): who may call it, and what the query must carry, judged before anything is read (e2e, no
 * database). What the rows are, how a day is split, and that a manager reads only the Cost Center of their own department are proved by
 * `seat-month.integration-spec.ts`.
 */
describe('the route of the seat-months of a month (e2e, no database)', () => {
  let app: INestApplication<App>;
  const as = (roles: string[]) => bearer(principal(roles));
  const get = (query: object, roles: string[] = ['FINANCE']) =>
    request(app.getHttpServer()).get(PATH).query(query).set('Authorization', as(roles));

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token', async () => {
    const response = await request(app.getHttpServer()).get(PATH).query({ year: 2026, month: 10 }).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('lets only Finance and the manager of a department read it', async () => {
    for (const roles of [['EMPLOYEE'], ['IT_ADMIN'], ['SPENDING_APPROVER'], ['SUPER_ADMIN']]) {
      const response = await get({ year: 2026, month: 10 }, roles).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('refuses a query without a month, a month that is not one, a page too large and an id that is not one, before reading anything', async () => {
    for (const query of [
      {},
      { year: 2026 },
      { year: 2026, month: 13 },
      { year: 2026, month: 0 },
      { year: 1999, month: 10 },
      { year: 2026, month: 10, pageSize: 101 },
      { year: 2026, month: 10, costCenterId: 'not-an-id' },
      { year: 2026, month: 10, subscriptionId: ID.slice(1) },
      { year: 2026, month: 10, unknown: 'x' },
    ]) {
      const response = await get(query).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('GET /seat-month-charges poolLines[] contract (e2e, no database)', () => {
  let app: INestApplication<App>;
  const list = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: SeatMonthQueryService, useValue: { list } }] });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns Finance poolLines[] with idleCostByLabel, variances and flags', async () => {
    const payload = {
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      poolLines: [
        {
          subscriptionId: ID,
          paid: { amount: '5000000', currency: 'VND' },
          invoiced: { amount: '0', currency: 'VND' },
          allocated: { amount: '3750000', currency: 'VND' },
          idleCost: { amount: '1250000', currency: 'VND' },
          idleCostByLabel: {
            missedAdjustment: { amount: '0', currency: 'VND' },
            reducible: { amount: '0', currency: 'VND' },
            lockedUntil: { '2027-07-01': { amount: '1250000', currency: 'VND' } },
          },
          invoiceVariance: { amount: '0', currency: 'VND' },
          invoiceVarianceInReview: { amount: '0', currency: 'VND' },
          deviceLotPurchases: { amount: '0', currency: 'VND' },
          replacementKeys: { amount: '0', currency: 'VND' },
          unallocated: { amount: '1250000', currency: 'VND' },
          withoutCostCenter: { amount: '0', currency: 'VND' },
          flags: { NO_PRICE: false, NO_QUANTITY: false },
        },
      ],
    };
    list.mockResolvedValueOnce(payload);

    const response = await request(app.getHttpServer())
      .get(PATH)
      .query({ year: 2026, month: 11 })
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(200);

    expect(bodyOf(response).data).toEqual(payload);
    expect(list).toHaveBeenCalledWith(expect.any(Object), { year: 2026, month: 11, page: 1, pageSize: 20 }, true);
  });
});
