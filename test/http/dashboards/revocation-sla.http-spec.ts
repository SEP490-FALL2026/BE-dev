import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TransientDatabaseError } from '../../../src/infrastructure/database/transaction-runner';
import { DashboardRefusedError } from '../../../src/modules/dashboards/section/dashboard-section.errors';
import { RevocationSlaQueryService } from '../../../src/modules/dashboards/revocation-sla/revocation-sla-query.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const PATH = '/api/v1/reports/revocation-sla';
const ANSWER = {
  from: '2026-11-01',
  to: '2026-11-14',
  source: null,
  groupBy: 'department',
  completed: 5,
  onTime: 3,
  overdueOpen: 2,
  medianWorkingDays: 1.5,
  onTimeRate: 0.43,
  rows: [
    {
      key: { id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', name: 'Design' },
      completed: 3,
      onTime: 2,
      overdueOpen: 2,
      medianWorkingDays: 2,
      onTimeRate: 0.4,
    },
    { key: { id: null, name: null }, completed: 2, onTime: 1, overdueOpen: 0, medianWorkingDays: 1, onTimeRate: 0.5 },
  ],
  pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
  transferReRequests: { total: 2, provisionedWithinGrace: 1 },
};
const ALL_ROLES = ['EMPLOYEE', 'MANAGER', 'IT_ADMIN', 'SUPER_ADMIN', 'FINANCE', 'SPENDING_APPROVER'];

/**
 * RD.2 (SPEC P22, R5 E3, E7): the contract of the report of the SLA of the revocations, with its service replaced, so what is proved here is the route:
 * who may call it, the filters it refuses, the shape and message of its answer and the errors; the figures and the scopes are proved on PostgreSQL.
 */
describe('report of the SLA of the revocations (e2e, no database)', () => {
  let app: INestApplication<App>;
  const report = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: RevocationSlaQueryService, useValue: { report } }] });
  });

  beforeEach(() => {
    report.mockReset().mockResolvedValue(ANSWER);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('without a token is 401', async () => {
    const response = await request(app.getHttpServer()).get(PATH).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(report).not.toHaveBeenCalled();
  });

  it.each(ALL_ROLES.filter((role) => !['SUPER_ADMIN', 'IT_ADMIN'].includes(role)))(
    'refuses the role %s with 403 before reading anything',
    async (role) => {
      const response = await request(app.getHttpServer())
        .get(PATH)
        .set('Authorization', bearer(principal([role])))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      expect(report).not.toHaveBeenCalled();
    },
  );

  it.each(['SUPER_ADMIN', 'IT_ADMIN'])(
    'answers %s with the report under its message, read for the caller',
    async (role) => {
      const caller = principal([role], { employeeId: 'e-77' });
      const response = await request(app.getHttpServer()).get(PATH).set('Authorization', bearer(caller)).expect(200);

      expect(response.body).toEqual({ success: true, message: 'REPORT.REVOCATION_SLA_RETRIEVED', data: ANSWER });
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-77' }), {
        groupBy: 'department',
        page: 1,
        pageSize: 20,
      });
    },
  );

  it('hands the filters to the service as the route reads them: days, source, grouping, page', async () => {
    await request(app.getHttpServer())
      .get(PATH)
      .query({ from: '2026-11-01', to: '2026-11-14', source: 'TRANSFER', groupBy: 'itAdmin', page: 2, pageSize: 5 })
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .expect(200);

    expect(report).toHaveBeenCalledWith(expect.anything(), {
      from: '2026-11-01',
      to: '2026-11-14',
      source: 'TRANSFER',
      groupBy: 'itAdmin',
      page: 2,
      pageSize: 5,
    });
  });

  it.each([
    ['a day that does not exist', { from: '2026-02-30' }],
    ['a day that is not a day', { to: 'soon' }],
    ['a range that ends before it starts', { from: '2026-11-14', to: '2026-11-01' }],
    ['a range of over a year', { from: '2025-01-01', to: '2026-11-14' }],
    ['a source that is not one of the two', { source: 'RETURN' }],
    ['a grouping that is not one of the two', { groupBy: 'person' }],
    ['a page size over the limit', { pageSize: 101 }],
    ['a page that is not a number', { page: 'first' }],
    ['a filter the route does not know', { person: 'x' }],
  ])('refuses %s with 422 before any work', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get(PATH)
      .query(query)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(report).not.toHaveBeenCalled();
  });

  it('accepts a range of exactly a year and one that is a single day', async () => {
    for (const query of [
      { from: '2025-11-15', to: '2026-11-14' },
      { from: '2026-11-14', to: '2026-11-14' },
    ])
      await request(app.getHttpServer())
        .get(PATH)
        .query(query)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .expect(200);
  });

  it('answers a refusal of the service the way the guard does', async () => {
    report.mockRejectedValueOnce(new DashboardRefusedError());

    const response = await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it('answers 503 when the database cannot answer, without detail', async () => {
    report.mockRejectedValueOnce(new TransientDatabaseError('57P01', new Error('terminating connection')));

    const response = await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .expect(503);

    expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('terminating');
  });

  it('has no way to write a report', async () => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      await request(app.getHttpServer())
        [method](PATH)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .expect(404);
    }
  });
});
