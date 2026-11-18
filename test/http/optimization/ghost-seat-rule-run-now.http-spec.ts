import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { BoardRuleRunService } from '../../../src/modules/optimization/board/board-rule-run.service';
import { GhostSeatRuleRunBusyError } from '../../../src/modules/optimization/board/board.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const ROLES = ['EMPLOYEE', 'MANAGER', 'IT_ADMIN', 'SUPER_ADMIN', 'FINANCE', 'SPENDING_APPROVER'];
const RUN = {
  id: ID,
  ruleSet: 'G1_G2',
  periodKey: 'MANUAL-2026-11-10T03:00:00.000Z',
  status: 'COMPLETED',
  attempt: 1,
  startedAt: '2026-11-10T03:00:00.000Z',
  finishedAt: '2026-11-10T03:00:01.000Z',
  createdCount: 1,
  updatedCount: 0,
  closedCount: 0,
  skippedCount: 2,
  failedCount: 0,
  skippedByGate: [{ gate: 'PER_SEAT', count: 2 }],
};
const URL = '/api/v1/ghost-seat-rule-runs';

/**
 * AF-01, `FR-4.12b`: the contract of the run of the rules of wasted seats asked for by hand, with its service replaced — who may ask,
 * the body, the shape and message of the answer, and 409 when a run is under way. What a run makes is proved on PostgreSQL.
 */
describe('POST /ghost-seat-rule-runs (no database)', () => {
  let app: INestApplication<App>;
  const ruleRuns = { runNow: jest.fn() };
  const as = (...roles: string[]) => ({ Authorization: bearer(principal(roles)) });

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: BoardRuleRunService, useValue: ruleRuns }] });
  });

  beforeEach(() => {
    ruleRuns.runNow.mockReset().mockResolvedValue({ runs: [RUN] });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('is answered to the IT Admin and the Super Admin (201) with each run and what it left out by gate', async () => {
    for (const role of ['IT_ADMIN', 'SUPER_ADMIN']) {
      const response = await request(app.getHttpServer()).post(URL).set(as(role)).send({}).expect(201);

      expect(bodyOf(response).message).toBe('GHOST_SEAT_RULE_RUN.COMPLETED');
      expect(bodyOf(response).data).toEqual({ runs: [RUN] });
    }
    expect(ruleRuns.runNow).toHaveBeenCalledWith(expect.objectContaining({ roles: ['IT_ADMIN'] }), undefined);
  });

  it('is refused to every other role (403) and to a call with no token (401), and runs nothing', async () => {
    for (const role of ROLES.filter((candidate) => candidate !== 'IT_ADMIN' && candidate !== 'SUPER_ADMIN')) {
      const response = await request(app.getHttpServer()).post(URL).set(as(role)).send({}).expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
    await request(app.getHttpServer()).post(URL).send({}).expect(401);
    expect(ruleRuns.runNow).not.toHaveBeenCalled();
  });

  it('passes the sets named, and refuses a set that is none, an empty list or another field (422)', async () => {
    await request(app.getHttpServer())
      .post(URL)
      .set(as('IT_ADMIN'))
      .send({ rules: ['G3G4'] })
      .expect(201);
    expect(ruleRuns.runNow).toHaveBeenLastCalledWith(expect.anything(), ['G3G4']);

    for (const body of [{ rules: ['G5G6'] }, { rules: [] }, { rules: 'G1G2' }, { force: true }]) {
      const response = await request(app.getHttpServer()).post(URL).set(as('IT_ADMIN')).send(body).expect(422);
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
    expect(ruleRuns.runNow).toHaveBeenCalledTimes(1);
  });

  it('answers 409 GHOST_SEAT.RULE_RUN_BUSY when a run of the set is under way, naming a set run before it', async () => {
    ruleRuns.runNow.mockRejectedValueOnce(new GhostSeatRuleRunBusyError('G3_G4', [ID]));

    const response = await request(app.getHttpServer()).post(URL).set(as('SUPER_ADMIN')).send({}).expect(409);

    expect(bodyOf(response).error).toMatchObject({
      code: 'GHOST_SEAT.RULE_RUN_BUSY',
      details: { ruleSet: 'G3_G4', completedRunIds: [ID] },
    });
  });
});
