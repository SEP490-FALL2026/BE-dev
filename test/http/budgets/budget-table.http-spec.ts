import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { pageOf } from '../../../src/core/application/pagination';
import { BudgetViewService } from '../../../src/modules/budgets/budget-view/budget-view.service';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const money = (amount: string) => ({ amount, currency: 'VND' });
const ROW = {
  costCenter: { id: '69ec54fa-c72d-4050-bf1d-8459c1ed47b1', code: 'CC', name: 'Department' },
  year: 2027,
  status: 'NO_BUDGET',
  versionId: null,
  number: null,
  base: null,
  reserve: null,
  total: null,
  committed: money('20'),
  spent: money('10'),
  pendingSpend: money('0'),
  remainingBase: null,
  remainingWithReserve: null,
  remaining: null,
  overBudget: false,
  overCommitted: false,
  priorPeriodAdjustment: money('10'),
};

describe('BR-MF4-05 budgetTable HTTP contract', () => {
  let app: INestApplication<App>;
  const table = jest.fn();
  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: BudgetViewService, useValue: { table } }] });
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    table.mockReset().mockResolvedValue(pageOf([ROW], 1, 1, 20));
  });
  const get = (role: string, query = 'year=2027') =>
    request(app.getHttpServer())
      .get(`/api/v1/budgets?${query}`)
      .set('Authorization', bearer(principal([role])));

  it.each(['FINANCE', 'SPENDING_APPROVER'])('lets %s read commitment-only rows and late invoices', async (role) => {
    const response = await get(role).expect(200);
    expect((response.body as { data: { items: unknown[] } }).data.items).toEqual([ROW]);
  });

  it('refuses department heads and every other role without reading', async () => {
    for (const role of ['MANAGER', 'EMPLOYEE', 'IT_ADMIN', 'SUPER_ADMIN']) await get(role).expect(403);
    expect(table).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get('/api/v1/budgets').expect(401);
  });

  it('validates paging and year', async () => {
    for (const query of ['year=bad', 'page=0', 'pageSize=101', 'unknown=1']) await get('FINANCE', query).expect(422);
  });
});
