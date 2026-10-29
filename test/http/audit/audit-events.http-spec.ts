import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditQueryRepo } from '../../../src/modules/audit/audit-query.repo';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ACTOR = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OCCURRED_AT = new Date('2026-10-16T08:30:00.123Z');

const storedEvent = {
  id: 'a8b6c4d2-1f3e-4a5b-9c7d-0e2f4a6b8c10',
  occurredAt: OCCURRED_AT,
  actorKind: 'USER' as const,
  actorAppUserId: ACTOR,
  actorRoles: ['SUPER_ADMIN'],
  action: 'APP_USER.LOCKED',
  resourceType: 'AppUser',
  resourceId: 'b1',
  before: { status: 'ACTIVE' },
  after: { status: 'LOCKED' },
  correlationId: 's1',
  operatorReference: null,
};

describe('GET /api/v1/audit-events (e2e)', () => {
  let app: INestApplication<App>;
  const findPage = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: AuditQueryRepo, useValue: { findPage } }] });
  });

  beforeEach(() => {
    findPage.mockReset().mockResolvedValue({ items: [storedEvent], total: 1 });
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (query = '', caller = principal(['SUPER_ADMIN'])) =>
    request(app.getHttpServer()).get(`/api/v1/audit-events${query}`).set('Authorization', bearer(caller));

  it('requires a Bearer token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/audit-events').expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(findPage).not.toHaveBeenCalled();
  });

  describe('only the Super Admin may read the trail (AC-5, AC-6)', () => {
    it.each([
      ['an employee', ['EMPLOYEE'], []],
      ['an IT administrator', ['IT_ADMIN'], []],
      ['the finance officer', ['FINANCE'], []],
      ['an account with no role at all', [], []],
      ['a department head and the spending approver, whose roles are derived', [], ['MANAGER', 'SPENDING_APPROVER']],
      ['an IT administrator who is also a department head', ['IT_ADMIN'], ['MANAGER']],
    ])('answers %s with 403 and reads nothing', async (_name, direct, derived) => {
      const response = await get('', principal(direct, derived)).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      expect(findPage).not.toHaveBeenCalled();
    });

    it('lets the Super Admin through', async () => {
      await get().expect(200);

      expect(findPage).toHaveBeenCalledTimes(1);
    });
  });

  describe('validation', () => {
    it.each([
      ['a resource id without its type', '?resourceId=b1'],
      ['a reversed time window', '?occurredFrom=2026-10-16T09:00:00Z&occurredTo=2026-10-16T08:00:00Z'],
      ['an empty time window', '?occurredFrom=2026-10-16T09:00:00Z&occurredTo=2026-10-16T09:00:00Z'],
      ['a page size of 101', '?pageSize=101'],
      ['a page size of 0', '?pageSize=0'],
      ['page 0', '?page=0'],
      ['a malformed actor id', '?actorAppUserId=not-a-uuid'],
      ['a time without an offset', '?occurredFrom=2026-10-16T08:00:00'],
      ['an empty resource type', '?resourceType='],
      ['an unknown parameter', '?organizationId=3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11'],
    ])('answers %s with 422 VALIDATION_ERROR and reads nothing', async (_name, query) => {
      const response = await get(query).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(findPage).not.toHaveBeenCalled();
    });
  });

  describe('the answer', () => {
    it('is an enveloped page whose items carry every field of the trail, with ISO times', async () => {
      const response = await get().expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'AUDIT.EVENTS_LISTED',
        data: {
          items: [
            {
              id: storedEvent.id,
              occurredAt: '2026-10-16T08:30:00.123Z',
              actorKind: 'USER',
              actorAppUserId: ACTOR,
              actorRoles: ['SUPER_ADMIN'],
              action: 'APP_USER.LOCKED',
              resourceType: 'AppUser',
              resourceId: 'b1',
              before: { status: 'ACTIVE' },
              after: { status: 'LOCKED' },
              correlationId: 's1',
              operatorReference: null,
            },
          ],
          pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        },
      });
    });

    it('passes the filters and the page through, with the default page size of 20', async () => {
      await get(
        `?resourceType=AppUser&resourceId=b1&actorAppUserId=${ACTOR}&action=APP_USER.LOCKED&occurredFrom=2026-10-16T00:00:00Z&occurredTo=2026-10-17T00:00:00%2B07:00&page=3&pageSize=10`,
      ).expect(200);

      expect(findPage).toHaveBeenCalledWith({
        resourceType: 'AppUser',
        resourceId: 'b1',
        actorAppUserId: ACTOR,
        action: 'APP_USER.LOCKED',
        occurredFrom: new Date('2026-10-16T00:00:00Z'),
        occurredTo: new Date('2026-10-16T17:00:00Z'),
        skip: 20,
        take: 10,
      });
    });

    it('answers an empty page, with the true total, when the page is past the end', async () => {
      findPage.mockResolvedValue({ items: [], total: 25 });

      const response = await get('?page=4&pageSize=10').expect(200);

      expect(bodyOf(response).data).toEqual({
        items: [],
        pagination: { page: 4, pageSize: 10, totalItems: 25, totalPages: 3 },
      });
    });

    it('answers 503 SERVICE_UNAVAILABLE when the database cannot answer', async () => {
      findPage.mockRejectedValue(new Error('Query read timeout'));

      const response = await get().expect(503);

      expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('lets any other failure be reported as an internal error, not hidden as an outage', async () => {
      findPage.mockRejectedValue(new Error('a programming defect'));

      const response = await get().expect(500);

      expect(bodyOf(response).error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});
