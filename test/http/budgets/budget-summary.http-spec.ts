import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { BudgetViewService } from '../../../src/modules/budgets/budget-view/budget-view.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const SUMMARY = {
  year: 2027,
  totals: {
    VND: {
      currency: 'VND',
      base: { amount: '900', currency: 'VND' },
      reserve: { amount: '100', currency: 'VND' },
      total: { amount: '1000', currency: 'VND' },
      committed: { amount: '300', currency: 'VND' },
      spent: { amount: '200', currency: 'VND' },
      remaining: { amount: '500', currency: 'VND' },
      costCenterCount: 2,
      overBudgetCount: 0,
    },
  },
  lastInvoiceRecordedAt: null,
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

  it('refuses every role but Finance with 403 and reads nothing', async () => {
    for (const roles of [['MANAGER'], ['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN'], ['SPENDING_APPROVER'], []]) {
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

  it('gives Finance the totals of the year, one entry for each currency, in the envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/budgets/summary?year=2027')
      .set('Authorization', bearer(principal(['FINANCE'])))
      .expect(200);

    const body = response.body as { success: boolean; message: string; data: typeof SUMMARY };
    expect(body.success).toBe(true);
    expect(body.message).toBe('BUDGET.SUMMARY_FETCHED');
    expect(body.data).toEqual(SUMMARY);
    expect(summary).toHaveBeenCalledWith(2027);
  });
});
