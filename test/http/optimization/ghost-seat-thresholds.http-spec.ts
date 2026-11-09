import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  GhostSeatThresholdApplicationInternalError,
  GhostSeatThresholdApplicationNotFoundError,
  GhostSeatThresholdOrderError,
} from '../../../src/modules/optimization/usage-rules/threshold/usage-rules-threshold.errors';
import { UsageRulesThresholdService } from '../../../src/modules/optimization/usage-rules/threshold/usage-rules-threshold.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const ROLES = ['EMPLOYEE', 'MANAGER', 'IT_ADMIN', 'SUPER_ADMIN', 'FINANCE', 'SPENDING_APPROVER'];
const THRESHOLD = {
  applicationId: ID,
  applicationName: 'Figma',
  monitorDays: 30,
  reviewDays: 60,
  actionDays: 90,
  updatedAt: '2026-11-09T05:00:00.000Z',
};

/** `FR-4.13`, `US-10-03` AC-6: who may read and change the thresholds of an application, the shape of the answers and the errors; the data is proved on PostgreSQL. */
describe('ghost seat threshold routes (no database)', () => {
  let app: INestApplication<App>;
  const service = { list: jest.fn(), set: jest.fn(), remove: jest.fn() };
  const as = (...roles: string[]) => ({ Authorization: bearer(principal(roles)) });
  const url = `/api/v1/ghost-seat-thresholds/${ID}`;

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: UsageRulesThresholdService, useValue: service }] });
  });

  beforeEach(() => {
    service.list
      .mockReset()
      .mockResolvedValue({ items: [THRESHOLD], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    service.set.mockReset().mockResolvedValue({ threshold: THRESHOLD });
    service.remove.mockReset().mockResolvedValue({ applicationId: ID });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists the thresholds to the Super Admin and the IT Admin, and to nobody else', async () => {
    for (const role of ['SUPER_ADMIN', 'IT_ADMIN']) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/ghost-seat-thresholds')
        .set(as(role))
        .expect(200);
      expect(bodyOf(response).message).toBe('GHOST_SEAT_THRESHOLDS.LISTED');
    }
    for (const role of ROLES.filter((candidate) => !['SUPER_ADMIN', 'IT_ADMIN'].includes(candidate))) {
      await request(app.getHttpServer()).get('/api/v1/ghost-seat-thresholds').set(as(role)).expect(403);
    }
    await request(app.getHttpServer()).get('/api/v1/ghost-seat-thresholds').expect(401);
  });

  it('A.4: only the Super Admin sets or removes them; the IT Admin and every other role is refused (403) and the service is never reached', async () => {
    for (const role of ROLES.filter((candidate) => candidate !== 'SUPER_ADMIN')) {
      await request(app.getHttpServer())
        .put(url)
        .set(as(role))
        .send({ monitorDays: 30, reviewDays: 60, actionDays: 90 })
        .expect(403);
      await request(app.getHttpServer()).delete(url).set(as(role)).expect(403);
    }
    await request(app.getHttpServer()).put(url).send({}).expect(401);
    expect(service.set).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
  });

  it('sets the thresholds for the Super Admin, under its message, with the actor and the days', async () => {
    const response = await request(app.getHttpServer())
      .put(url)
      .set(as('SUPER_ADMIN'))
      .send({ monitorDays: 30, reviewDays: 60, actionDays: 90 })
      .expect(200);

    expect(bodyOf(response).message).toBe('GHOST_SEAT_THRESHOLD.SET');
    expect(service.set).toHaveBeenCalledWith(expect.objectContaining({ roles: ['SUPER_ADMIN'] }), ID, {
      monitorDays: 30,
      reviewDays: 60,
      actionDays: 90,
    });
  });

  it('refuses a body that is none, days outside 1 to 365 and an id that is none (422)', async () => {
    for (const body of [
      {},
      { monitorDays: 0, reviewDays: 60, actionDays: 90 },
      { monitorDays: 30, reviewDays: 60, actionDays: 366 },
      { monitorDays: 30, reviewDays: 60, actionDays: 90, extra: 1 },
    ]) {
      await request(app.getHttpServer()).put(url).set(as('SUPER_ADMIN')).send(body).expect(422);
    }
    await request(app.getHttpServer())
      .put('/api/v1/ghost-seat-thresholds/nope')
      .set(as('SUPER_ADMIN'))
      .send({ monitorDays: 30, reviewDays: 60, actionDays: 90 })
      .expect(422);
  });

  it('keeps the codes of the use case: days out of order, an internal application (422) and an unknown application (404)', async () => {
    const cases: [Error, number, string][] = [
      [new GhostSeatThresholdOrderError(), 422, 'GHOST_SEAT.THRESHOLD_ORDER'],
      [new GhostSeatThresholdApplicationInternalError(), 422, 'GHOST_SEAT.APPLICATION_INTERNAL'],
      [new GhostSeatThresholdApplicationNotFoundError(), 404, 'GHOST_SEAT.APPLICATION_NOT_FOUND'],
    ];
    for (const [error, status, code] of cases) {
      service.set.mockReset().mockRejectedValue(error);
      const response = await request(app.getHttpServer())
        .put(url)
        .set(as('SUPER_ADMIN'))
        .send({ monitorDays: 60, reviewDays: 30, actionDays: 90 })
        .expect(status);
      expect(bodyOf(response).error.code).toBe(code);
    }
  });

  it('removes the thresholds for the Super Admin (404 when there are none)', async () => {
    const response = await request(app.getHttpServer()).delete(url).set(as('SUPER_ADMIN')).expect(200);
    expect(bodyOf(response).message).toBe('GHOST_SEAT_THRESHOLD.DELETED');

    service.remove.mockReset().mockRejectedValue(new GhostSeatThresholdApplicationNotFoundError());
    const missing = await request(app.getHttpServer()).delete(url).set(as('SUPER_ADMIN')).expect(404);
    expect(bodyOf(missing).error.code).toBe('GHOST_SEAT.APPLICATION_NOT_FOUND');
  });
});
