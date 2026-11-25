import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { BudgetViewService } from '../../../src/modules/budgets/budget-view/budget-view.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const SUMMARY = {
  year: 2027,
  annualCeiling: null,
  sharedPoolReserve: null,
  totals: {
    VND: {
      currency: 'VND',
      base: { amount: '900', currency: 'VND' },
      reserve: { amount: '100', currency: 'VND' },
      total: { amount: '1000', currency: 'VND' },
      effectiveBudget: {
        base: { amount: '900', currency: 'VND' },
        reserve: { amount: '100', currency: 'VND' },
        total: { amount: '1000', currency: 'VND' },
        adjustment: { amount: '0', currency: 'VND' },
      },
      committed: { amount: '300', currency: 'VND' },
      spent: { amount: '200', currency: 'VND' },
      remaining: { amount: '500', currency: 'VND' },
      pendingSpend: { amount: '0', currency: 'VND' },
      runningUncommitted: { amount: '0', currency: 'VND' },
      remainingBase: { amount: '400', currency: 'VND' },
      remainingWithReserve: { amount: '500', currency: 'VND' },
      costCenterCount: 2,
      overBudgetCount: 0,
    },
  },
  lastInvoiceRecordedAt: null,
  companySpent: null,
  sharedPoolUnallocated: null,
  sharedPoolOverReserve: null,
  sharedPoolLines: null,
  seatMonthsWithoutCostCenter: null,
};

describe('GET /budgets/summary (HTTP contract, no database)', () => {
  let app: INestApplication<App>;
  const summary = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: BudgetViewService, useValue: { summary } }] });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    summary.mockReset().mockResolvedValue(SUMMARY);
  });

  it('answers 401 without a token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/budgets/summary?year=2027').expect(401);
    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('BR-MF4-05 refuses roles outside Finance and Spending Approver with 403', async () => {
    for (const roles of [['MANAGER'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN'], []]) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budgets/summary?year=2027')
        .set('Authorization', bearer(principal(roles)))
        .expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(summary).not.toHaveBeenCalled();
  });

  it.each([
    ['no year', ''],
    ['a year that is not a number', '?year=next'],
    ['a year before 2000', '?year=1999'],
    ['an unknown query parameter', '?year=2027&currency=VND'],
  ])('turns away %s with 422', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/budgets/summary${query}`)
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(422);
    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(summary).not.toHaveBeenCalled();
  });

  it.each(['FINANCE', 'SPENDING_APPROVER'])('BR-MF4-05 gives %s the totals in the envelope', async (role) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/budgets/summary?year=2027')
      .set('Authorization', bearer(principal([role])))
      .expect(200);

    const body = response.body as { success: boolean; message: string; data: typeof SUMMARY };
    expect(body.success).toBe(true);
    expect(body.message).toBe('BUDGET.SUMMARY_FETCHED');
    expect(body.data).toEqual(SUMMARY);
    expect(summary).toHaveBeenCalledWith(2027);
  });

  it('returns broken-down sharedPoolLines when cycle figures exist', async () => {
    const withPool = {
      ...SUMMARY,
      sharedPoolReserve: { amount: '12000000', currency: 'VND' },
      sharedPoolUnallocated: { amount: '12100000', currency: 'VND' },
      sharedPoolOverReserve: true,
      sharedPoolLines: {
        idleCost: { amount: '8100000', currency: 'VND' },
        invoiceVariance: { amount: '3500000', currency: 'VND' },
        invoiceVarianceInReview: { amount: '500000', currency: 'VND' },
        deviceLotPurchases: { amount: '0', currency: 'VND' },
        replacementKeys: { amount: '0', currency: 'VND' },
        total: { amount: '12100000', currency: 'VND' },
        reserve: { amount: '12000000', currency: 'VND' },
        overReserve: true,
      },
    };
    summary.mockResolvedValueOnce(withPool);

    const response = await request(app.getHttpServer())
      .get('/api/v1/budgets/summary?year=2027')
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(200);

    expect(bodyOf(response).data).toEqual(withPool);
  });

  it('includes non-zero runningUncommitted deducted from remaining summary amounts', async () => {
    const withRunning = {
      ...SUMMARY,
      totals: {
        VND: {
          ...SUMMARY.totals.VND,
          runningUncommitted: { amount: '120', currency: 'VND' },
          remaining: { amount: '380', currency: 'VND' },
          remainingBase: { amount: '280', currency: 'VND' },
          remainingWithReserve: { amount: '380', currency: 'VND' },
        },
      },
    };
    summary.mockResolvedValueOnce(withRunning);

    const response = await request(app.getHttpServer())
      .get('/api/v1/budgets/summary?year=2027')
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(200);

    expect(bodyOf(response).data).toEqual(withRunning);
  });
});
