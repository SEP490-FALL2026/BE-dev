import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { BaselineService } from '../../../src/modules/budgets/cycle/baseline.service';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

describe('BR-MF4-01 baseline holder-department basis HTTP contract (QĐ-103k)', () => {
  let app: INestApplication<App>;
  const baseline = {
    year: 2027,
    basis: 'HOLDER_DEPARTMENT',
    currency: 'VND',
    computedAt: '2026-11-09T01:00:00.000Z',
    departmentsTotal: 0,
    departments: [],
    sharedPoolUnallocated: {
      line: 'SHARED_POOL_UNALLOCATED',
      estimatedAnnualCost: { amount: '24000000', currency: 'VND' },
      hasUnknownCost: false,
      seatsIdle: 2,
      softwareTotal: 1,
      software: [
        {
          subscriptionId: '00000000-0000-4000-8000-000000000001',
          application: 'Figma',
          plan: 'Organization',
          seatsPurchased: 10,
          seatsAssigned: 8,
          seatsIdle: 2,
          monthlyUnitPrice: { amount: '1000000', currency: 'VND' },
          monthsRunning: 12,
          estimatedAnnualCost: { amount: '24000000', currency: 'VND' },
        },
      ],
    },
  };

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [{ token: BaselineService, useValue: { read: jest.fn().mockResolvedValue(baseline) } }],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['FINANCE', 'SPENDING_APPROVER'])(
    'tells %s that costs follow the holder of a seat, with the shared-pool line',
    async (role) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/budget-cycles/2027/baseline')
        .set('Authorization', bearer(principal([role])))
        .expect(200);

      expect((response.body as { data: unknown }).data).toEqual(baseline);
    },
  );
});
