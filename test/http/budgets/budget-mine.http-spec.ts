import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { BudgetViewService } from '../../../src/modules/budgets/budget-view/budget-view.service';
import { BudgetNotYourCostCenterError } from '../../../src/modules/budgets/budget/budget.errors';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { bodyOf } from '../../support/api-body';

const budgetOf = (response: { body: unknown }) => (response.body as { data: { budget: typeof BUDGET } }).data.budget;

const ID = '69ec54fa-c72d-4050-bf1d-8459c1ed47b1';
const money = (amount: string) => ({ amount, currency: 'VND' });
const BUDGET = {
  costCenter: { id: ID, code: 'CC', name: 'Department' },
  year: 2027,
  status: 'ACTIVE',
  base: money('100'),
  reserve: money('20'),
  total: money('120'),
  effectiveBudget: { base: money('100'), reserve: money('20'), total: money('120'), adjustment: money('0') },
  committed: money('20'),
  spent: money('10'),
  pendingSpend: money('30'),
  runningUncommitted: money('0'),
  remainingBase: money('40'),
  remainingWithReserve: money('60'),
  overBudget: false,
  cycle: { submissionDeadline: '2026-12-01', decisionDeadline: '2026-12-15', status: 'OPEN' },
  version: { id: ID, number: 1 },
  latestRefusal: null,
  proposal: null,
};

describe('BR-MF4-05 budgetMine HTTP contract', () => {
  let app: INestApplication<App>;
  const mine = jest.fn();
  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: BudgetViewService, useValue: { mine } }] });
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    mine.mockReset().mockResolvedValue(BUDGET);
  });
  const get = (roles: string[] = ['MANAGER'], query = 'year=2027') =>
    request(app.getHttpServer())
      .get(`/api/v1/budgets/mine?${query}`)
      .set('Authorization', bearer(principal(roles)));

  it('gives a department head all own numbers and deadlines without company totals', async () => {
    const response = await get().expect(200);
    expect(bodyOf(response).data).toEqual({ budget: BUDGET });
    expect(budgetOf(response)).not.toHaveProperty('annualCeiling');
    expect(budgetOf(response)).not.toHaveProperty('sharedPoolReserve');
  });

  it.each([
    ['a draft cycle', { cycle: { ...BUDGET.cycle, status: 'DRAFT' } }],
    ['a locked cycle', { cycle: { ...BUDGET.cycle, status: 'LOCKED' } }],
    ['no cycle', { cycle: null }],
  ])('serializes %s, and never a department ceiling', async (_label, patch) => {
    mine.mockResolvedValue({ ...BUDGET, ...patch });
    expect(budgetOf(await get().expect(200))).toEqual({ ...BUDGET, ...patch });
  });

  it('rejects other roles and an employee who heads no requested department', async () => {
    for (const role of ['FINANCE', 'SPENDING_APPROVER', 'EMPLOYEE', 'IT_ADMIN', 'SUPER_ADMIN'])
      await get([role]).expect(403);
    mine.mockRejectedValue(new BudgetNotYourCostCenterError());
    expect(bodyOf(await get().expect(403)).error.code).toBe('BUDGET.NOT_YOUR_COST_CENTER');
  });

  it('validates the year and optional Cost Center and refuses an anonymous caller', async () => {
    await request(app.getHttpServer()).get('/api/v1/budgets/mine?year=2027').expect(401);
    for (const query of ['year=next', 'year=2027&costCenterId=bad', 'year=2027&extra=1'])
      await get(['MANAGER'], query).expect(422);
  });
});
