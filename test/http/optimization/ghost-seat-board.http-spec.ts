import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { BoardKpiService } from '../../../src/modules/optimization/board/board-kpi.service';
import { BoardQueryService } from '../../../src/modules/optimization/board/board-query.service';
import { BoardReclaimService } from '../../../src/modules/optimization/board/board-reclaim.service';
import { BoardSummaryService } from '../../../src/modules/optimization/board/board-summary.service';
import {
  GhostSeatNotFoundError,
  GhostSeatNotReclaimableError,
  GhostSeatPeriodInvalidError,
} from '../../../src/modules/optimization/board/board.errors';
import { RevocationRefusedError } from '../../../src/modules/licensing/public/licensing.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const ROLES = ['EMPLOYEE', 'MANAGER', 'IT_ADMIN', 'SUPER_ADMIN', 'FINANCE', 'SPENDING_APPROVER'];
const SUMMARY_ROW = {
  confidenceLabel: 'INTERNAL_DATA',
  unclosedCount: 1,
  reclaimUnderWayCount: 0,
};
const DETAIL = {
  id: ID,
  group: 'G2',
  state: 'OPEN',
  closeReason: null,
  tier: 'ACTION',
  confidenceLabel: 'INTERNAL_DATA',
  application: { applicationId: ID, applicationName: 'Jira' },
  plan: { planId: ID, planName: 'Standard' },
  subscriptionId: ID,
  assignmentId: ID,
  holder: { employeeId: ID, employeeCode: 'E1', fullName: 'Person E1' },
  freeSeats: null,
  countsTowardVacantCost: null,
  revocationTaskId: null,
  labels: { revocationUnderWay: false, terminatingUntil: false, holderLeft: false },
  canReclaim: true,
  createdAt: '2026-11-09T05:00:00.000Z',
  evidence: { group: 'G2' },
  holderLeftOn: null,
  terminatingUntil: null,
  closedAt: null,
  supersededById: null,
  createdRunId: ID,
};
const DETAIL_ONLY = ['evidence', 'holderLeftOn', 'terminatingUntil', 'closedAt', 'supersededById', 'createdRunId'];
/** A row of the table is the detail without what only the detail carries. */
const ROW = Object.fromEntries(Object.entries(DETAIL).filter(([key]) => !DETAIL_ONLY.includes(key)));
const PAGINATION = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };

/**
 * `US-10-05`, `FR-0.3`: the contract of the routes of the board of wasted seats, with their services replaced — who may call each one, the
 * shape and the message of its answer, and the errors a reclaim answers with (`GHOST_SEAT.*`). The data is proved on PostgreSQL.
 */
describe('ghost seat board routes (no database)', () => {
  let app: INestApplication<App>;
  const queries = { list: jest.fn(), get: jest.fn(), listRuns: jest.fn(), listSkips: jest.fn() };
  const summaries = { summary: jest.fn() };
  const reclaims = { reclaim: jest.fn() };
  const kpis = { kpi5: jest.fn() };
  const as = (...roles: string[]) => ({ Authorization: bearer(principal(roles)) });

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: BoardQueryService, useValue: queries },
        { token: BoardSummaryService, useValue: summaries },
        { token: BoardReclaimService, useValue: reclaims },
        { token: BoardKpiService, useValue: kpis },
      ],
    });
  });

  beforeEach(() => {
    queries.list.mockReset().mockResolvedValue({ items: [ROW], pagination: PAGINATION });
    queries.get.mockReset().mockResolvedValue(DETAIL);
    queries.listRuns
      .mockReset()
      .mockResolvedValue({ items: [], pagination: { ...PAGINATION, totalItems: 0, totalPages: 0 } });
    queries.listSkips
      .mockReset()
      .mockResolvedValue({ items: [], pagination: { ...PAGINATION, totalItems: 0, totalPages: 0 } });
    summaries.summary.mockReset().mockResolvedValue({
      groups: { G1: SUMMARY_ROW, G2: SUMMARY_ROW, G3: SUMMARY_ROW, G4: SUMMARY_ROW },
      counted: 2,
      limitation: 'Phần mềm nội bộ: chưa có nguồn usage.',
    });
    reclaims.reclaim.mockReset().mockResolvedValue({ recommendation: DETAIL, taskId: ID });
    kpis.kpi5.mockReset().mockResolvedValue({
      from: '2026-11-01',
      to: '2026-11-09',
      denominator: 8,
      numerator: 3,
      ratePercent: 37.5,
      byGroup: {
        G1: { denominator: 0, numerator: 0, ratePercent: null, confidenceLabel: 'INTERNAL_DATA' },
        G2: { denominator: 8, numerator: 3, ratePercent: 37.5, confidenceLabel: 'INTERNAL_DATA' },
        G3: { denominator: 0, numerator: 0, ratePercent: null, confidenceLabel: 'INTERNAL_DATA' },
        G4: { denominator: 0, numerator: 0, ratePercent: null, confidenceLabel: 'INTERNAL_DATA' },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const IT_ADMIN_ROUTES = [
    {
      name: 'the table',
      method: 'get',
      path: '/api/v1/ghost-seat-recommendations',
      message: 'GHOST_SEAT_RECOMMENDATIONS.LISTED',
    },
    {
      name: 'the summary',
      method: 'get',
      path: '/api/v1/ghost-seat-optimization-summary',
      message: 'GHOST_SEAT_OPTIMIZATION_SUMMARY.READ',
    },
    {
      name: 'one recommendation',
      method: 'get',
      path: `/api/v1/ghost-seat-recommendations/${ID}`,
      message: 'GHOST_SEAT_RECOMMENDATION.READ',
    },
    {
      name: 'the reclaim',
      method: 'post',
      path: `/api/v1/ghost-seat-recommendations/${ID}/reclaim`,
      message: 'GHOST_SEAT_RECOMMENDATION.RECLAIM_OPENED',
    },
  ] as const;

  describe.each(IT_ADMIN_ROUTES)('$name', (route) => {
    it('is answered to the IT Admin under its message', async () => {
      const response = await request(app.getHttpServer())[route.method](route.path).set(as('IT_ADMIN')).expect(200);

      expect(bodyOf(response).message).toBe(route.message);
    });

    it('US-10-05 AC-7: is refused to every other role (403) and to a call with no token (401)', async () => {
      // The head of a department may read the one recommendation about their own department (the service says which, `GHOST_SEAT.NOT_DECIDER`).
      const allowed = (role: string) =>
        role === 'IT_ADMIN' || (route.name === 'one recommendation' && role === 'MANAGER');
      for (const role of ROLES.filter((candidate) => !allowed(candidate))) {
        const response = await request(app.getHttpServer())[route.method](route.path).set(as(role)).expect(403);
        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      }
      await request(app.getHttpServer())[route.method](route.path).expect(401);
      expect(queries.list).not.toHaveBeenCalled();
      expect(reclaims.reclaim).not.toHaveBeenCalled();
    });
  });

  it('US-10-06 AC-8: a head reads one recommendation through the same route, and the service is told who asks', async () => {
    await request(app.getHttpServer()).get(`/api/v1/ghost-seat-recommendations/${ID}`).set(as('MANAGER')).expect(200);

    expect(queries.get).toHaveBeenCalledWith(expect.objectContaining({ roles: ['MANAGER'] }), ID);
  });

  it('answers the table with no level and no percentage, G1 and G2 labelled as internal data', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/ghost-seat-recommendations')
      .query({ group: 'G2', state: 'OPEN', departmentScope: 'MINE', pageSize: 10 })
      .set(as('IT_ADMIN'))
      .expect(200);

    expect(bodyOf(response).data).toEqual({ items: [ROW], pagination: PAGINATION });
    expect(queries.list).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['IT_ADMIN'] }),
      expect.objectContaining({ group: 'G2', state: 'OPEN', departmentScope: 'MINE', pageSize: 10 }),
    );
  });

  it('refuses a filter that is none (422) and a page that is too big', async () => {
    for (const query of [{ group: 'G9' }, { pageSize: 500 }, { departmentScope: 'SOME' }, { unknown: 'x' }]) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/ghost-seat-recommendations')
        .query(query)
        .set(as('IT_ADMIN'))
        .expect(422);
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
    await request(app.getHttpServer())
      .get('/api/v1/ghost-seat-recommendations/not-an-id')
      .set(as('IT_ADMIN'))
      .expect(422);
  });

  it('US-10-05 AC-5: answers the reclaim with the recommendation and the task; the errors of the board and of the gate keep their codes', async () => {
    const url = `/api/v1/ghost-seat-recommendations/${ID}/reclaim`;
    const cases: [Error, number, string][] = [
      [new GhostSeatNotFoundError(), 404, 'GHOST_SEAT.NOT_FOUND'],
      [new GhostSeatNotReclaimableError(), 409, 'GHOST_SEAT.NOT_RECLAIMABLE'],
      [new RevocationRefusedError('ASSIGNMENT_IS_SERVICE_ACCOUNT'), 409, 'GHOST_SEAT.SEAT_NOT_REVOCABLE'],
    ];

    const ok = await request(app.getHttpServer()).post(url).set(as('IT_ADMIN')).expect(200);
    expect(bodyOf(ok).data).toEqual({ recommendation: DETAIL, taskId: ID });
    for (const [error, status, code] of cases) {
      reclaims.reclaim.mockRejectedValueOnce(error);
      const response = await request(app.getHttpServer()).post(url).set(as('IT_ADMIN')).expect(status);
      expect(bodyOf(response).error.code).toBe(code);
    }
  });

  it('FR-0.3: KPI-5 is the Super Admin only, and a period that goes backwards is 422 GHOST_SEAT.PERIOD_INVALID', async () => {
    const url = '/api/v1/ghost-seat-kpi5';

    const ok = await request(app.getHttpServer())
      .get(url)
      .query({ from: '2026-11-01', to: '2026-11-09' })
      .set(as('SUPER_ADMIN'))
      .expect(200);
    expect(bodyOf(ok)).toMatchObject({
      message: 'GHOST_SEAT_KPI5.READ',
      data: { denominator: 8, numerator: 3, ratePercent: 37.5 },
    });
    for (const role of ROLES.filter((candidate) => candidate !== 'SUPER_ADMIN')) {
      const response = await request(app.getHttpServer())
        .get(url)
        .query({ from: '2026-11-01', to: '2026-11-09' })
        .set(as(role))
        .expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
    kpis.kpi5.mockRejectedValueOnce(new GhostSeatPeriodInvalidError());
    const backwards = await request(app.getHttpServer())
      .get(url)
      .query({ from: '2026-11-09', to: '2026-11-01' })
      .set(as('SUPER_ADMIN'))
      .expect(422);
    expect(bodyOf(backwards).error.code).toBe('GHOST_SEAT.PERIOD_INVALID');
    await request(app.getHttpServer())
      .get(url)
      .query({ from: '2026-13-01', to: '2026-11-09' })
      .set(as('SUPER_ADMIN'))
      .expect(422);
  });

  it('FR-4.12b: the runs and the reasons of a run are read by the IT Admin and the Super Admin, not by the others', async () => {
    for (const path of ['/api/v1/ghost-seat-rule-runs', `/api/v1/ghost-seat-rule-runs/${ID}/skips`]) {
      for (const role of ['IT_ADMIN', 'SUPER_ADMIN']) {
        await request(app.getHttpServer()).get(path).set(as(role)).expect(200);
      }
      for (const role of ['FINANCE', 'MANAGER', 'EMPLOYEE', 'SPENDING_APPROVER']) {
        await request(app.getHttpServer()).get(path).set(as(role)).expect(403);
      }
    }
    queries.listSkips.mockRejectedValueOnce(new GhostSeatNotFoundError());
    await request(app.getHttpServer()).get(`/api/v1/ghost-seat-rule-runs/${ID}/skips`).set(as('IT_ADMIN')).expect(404);
  });
});
