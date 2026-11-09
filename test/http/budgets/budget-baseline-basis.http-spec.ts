import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { BaselineService } from '../../../src/modules/budgets/cycle/baseline.service';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

describe('BR-MF4-01 baseline ownership basis HTTP contract', () => {
  let app: INestApplication<App>;
  const baseline = {
    year: 2027,
    basis: 'OWNER_DEPARTMENT',
    currency: 'VND',
    computedAt: '2026-11-09T01:00:00.000Z',
    kpi3: null,
    departmentsTotal: 0,
    departments: [],
  };

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [{ token: BaselineService, useValue: { read: jest.fn().mockResolvedValue(baseline) } }],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['FINANCE', 'SPENDING_APPROVER'])('tells %s that costs follow subscription ownership', async (role) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/budget-cycles/2027/baseline')
      .set('Authorization', bearer(principal([role])))
      .expect(200);

    expect((response.body as { data: unknown }).data).toEqual(baseline);
  });
});
