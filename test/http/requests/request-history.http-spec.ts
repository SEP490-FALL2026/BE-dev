import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AccessRequestNotFoundError } from '../../../src/modules/requests/access-request/access-request.errors';
import { RequestAuditFlagsService } from '../../../src/modules/requests/request-history/request-audit-flags.service';
import { RequestEventsService } from '../../../src/modules/requests/request-history/request-events.service';
import { RequestHistoryRefusedError } from '../../../src/modules/requests/request-history/request-history.errors';
import { RequestHistoryService } from '../../../src/modules/requests/request-history/request-history.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d21';
const DEPT = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22';
const PERSON = { employeeId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d23', employeeCode: 'E-23', fullName: 'An Nguyen' };
const DEPARTMENT = { id: DEPT, code: 'P-DES', name: 'Design' };
const HISTORY_ROW = {
  id: ID,
  type: 'GRANT',
  branch: 'PAID_IN_CATALOG',
  state: 'COMPLETED',
  routing: { mode: 'VIA_HEAD', oneStepReason: null },
  plan: {
    planId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d24',
    planName: 'Business',
    applicationId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d25',
    applicationName: 'Figma',
  },
  softwareName: null,
  beneficiary: PERSON,
  lineCount: 1,
  termMonths: null,
  expectedEndDate: null,
  submittedAt: '2026-10-30T02:00:00.000Z',
  updatedAt: '2026-11-02T02:00:00.000Z',
  needStep: { state: 'APPROVED', assignee: null, waitingReason: null },
  spend: null,
  outcome: null,
  withdrawal: null,
  requester: PERSON,
  department: DEPARTMENT,
  reserveUsed: false,
  flags: { manyPaidSoftware: null },
};
const pageWith = <T>(items: T[]) => ({
  items,
  pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
});
const EVENT = {
  id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d26',
  occurredAt: '2026-10-31T02:00:00.000Z',
  kind: 'SPEND_REJECTED',
  actor: PERSON,
  actorKind: 'USER',
  actorRole: 'SPENDING_APPROVER',
  line: null,
  reason: 'Over the plan',
};
const FLAG = {
  requestId: ID,
  flag: 'NO_NEED_APPROVER',
  submittedAt: '2026-10-30T02:00:00.000Z',
  state: 'COMPLETED',
  requester: PERSON,
  department: DEPARTMENT,
  application: { id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d25', name: 'Wiki' },
  plan: { id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d24', name: 'Internal' },
  routingReason: 'REQUESTER_IS_HEAD',
  grant: { itAdmin: PERSON, completedAt: '2026-10-31T03:00:00.000Z' },
};

/** Keys of money, a budget, a check, a commitment or evidence: none may be in a row of a history or of the audit report. */
const MONEY_KEYS = /price|amount|budget|check|commitment|evidence|cost/i;
const keysOf = (value: unknown): string[] =>
  value === null || typeof value !== 'object'
    ? []
    : Object.entries(value).flatMap(([key, nested]) => [key, ...keysOf(nested)]);

/**
 * The contract of the histories of requests by role, with the services replaced: who may call each route, what it accepts, the
 * shape and message of its answer and the refusals it maps. Which rows each role reads is proved on PostgreSQL
 * (`request-history-scope.integration-spec.ts`, `request-read-by-role.integration-spec.ts`).
 */
describe('the histories of requests by role (e2e, no database)', () => {
  let app: INestApplication<App>;
  const departmentPage = jest.fn();
  const oversightPage = jest.fn();
  const events = jest.fn();
  const flags = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: RequestHistoryService, useValue: { departmentPage, oversightPage } },
        { token: RequestEventsService, useValue: { page: events } },
        { token: RequestAuditFlagsService, useValue: { page: flags } },
      ],
    });
  });

  beforeEach(() => {
    for (const mock of [departmentPage, oversightPage, events, flags]) mock.mockReset();
    departmentPage.mockResolvedValue(pageWith([{ ...HISTORY_ROW, awaitingMe: false }]));
    oversightPage.mockResolvedValue(pageWith([HISTORY_ROW]));
    events.mockResolvedValue(pageWith([EVENT]));
    flags.mockResolvedValue(pageWith([FLAG]));
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (path: string, roles: string[]) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(principal(roles, { employeeId: 'e-9' })));

  describe('departmentAccessRequestList', () => {
    const PATH = `/api/v1/departments/${DEPT}/access-requests`;

    it('answers the head a page of the department, a decided request included, under its own message', async () => {
      const response = await get(PATH, ['MANAGER']).expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'ACCESS_REQUEST_HISTORY.DEPARTMENT_LISTED',
        data: pageWith([{ ...HISTORY_ROW, awaitingMe: false }]),
      });
      expect(departmentPage).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-9' }), DEPT, {
        page: 1,
        pageSize: 20,
      });
    });

    it('gives every narrowing to the service as it is', async () => {
      await get(
        `${PATH}?view=ended&state=COMPLETED,REJECTED&type=GRANT&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z&employeeId=${PERSON.employeeId}&page=2&pageSize=5`,
        ['MANAGER'],
      ).expect(200);

      expect(departmentPage).toHaveBeenCalledWith(expect.anything(), DEPT, {
        page: 2,
        pageSize: 5,
        view: 'ended',
        state: 'COMPLETED,REJECTED',
        type: 'GRANT',
        from: '2026-10-01T00:00:00Z',
        to: '2026-11-01T00:00:00Z',
        employeeId: PERSON.employeeId,
      });
    });

    it.each([['EMPLOYEE'], ['IT_ADMIN'], ['FINANCE'], ['SPENDING_APPROVER'], ['SUPER_ADMIN']])(
      'turns away %s, 403 AUTHORIZATION.FORBIDDEN',
      async (role) => {
        const response = await get(PATH, [role]).expect(403);

        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
        expect(departmentPage).not.toHaveBeenCalled();
      },
    );

    it('maps the head of another department to 403 and a department that does not exist to 404', async () => {
      departmentPage.mockRejectedValueOnce(new RequestHistoryRefusedError('OUT_OF_SCOPE'));
      expect(bodyOf(await get(PATH, ['MANAGER']).expect(403)).error.code).toBe('ACCESS_REQUEST_HISTORY.OUT_OF_SCOPE');

      departmentPage.mockRejectedValueOnce(new RequestHistoryRefusedError('DEPARTMENT_NOT_FOUND'));
      expect(bodyOf(await get(PATH, ['MANAGER']).expect(404)).error.code).toBe(
        'ACCESS_REQUEST_HISTORY.DEPARTMENT_NOT_FOUND',
      );
    });

    it.each([
      ['an id that is not one', `/api/v1/departments/not-a-uuid/access-requests`],
      ['a page size of 101', `${PATH}?pageSize=101`],
      ['a window that ends before it begins', `${PATH}?from=2026-11-01T00:00:00Z&to=2026-10-01T00:00:00Z`],
      ['a draft among the states', `${PATH}?state=DRAFT`],
      ['a department in the query', `${PATH}?departmentId=${DEPT}`],
      ['a person that is not an id', `${PATH}?employeeId=E-23`],
    ])('turns away %s, 422', async (_name, path) => {
      expect(bodyOf(await get(path, ['MANAGER']).expect(422)).error.code).toBe('VALIDATION_ERROR');
      expect(departmentPage).not.toHaveBeenCalled();
    });
  });

  describe('accessRequestList', () => {
    const PATH = '/api/v1/access-requests';

    it.each([['IT_ADMIN'], ['SPENDING_APPROVER'], ['FINANCE']])(
      'answers %s a page of what the role oversees',
      async (role) => {
        const response = await get(PATH, [role]).expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'ACCESS_REQUEST_HISTORY.LISTED',
          data: pageWith([HISTORY_ROW]),
        });
        expect(oversightPage).toHaveBeenCalledWith(expect.objectContaining({ roles: [role] }), {
          page: 1,
          pageSize: 20,
        });
      },
    );

    it('gives the department, the person and the flags to the service as they are', async () => {
      await get(
        `${PATH}?departmentId=${DEPT}&employeeId=${PERSON.employeeId}&flag=ONE_STEP,RESERVE_USED&state=COMPLETED`,
        ['IT_ADMIN'],
      ).expect(200);

      expect(oversightPage).toHaveBeenCalledWith(expect.anything(), {
        page: 1,
        pageSize: 20,
        departmentId: DEPT,
        employeeId: PERSON.employeeId,
        flag: 'ONE_STEP,RESERVE_USED',
        state: 'COMPLETED',
      });
    });

    it.each([['SUPER_ADMIN'], ['MANAGER'], ['EMPLOYEE']])(
      'turns away %s, 403 AUTHORIZATION.FORBIDDEN (the Super Admin reads no request, SoD-1)',
      async (role) => {
        const response = await get(PATH, [role]).expect(403);

        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
        expect(oversightPage).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['a page size of 101', `${PATH}?pageSize=101`],
      ['a flag twice', `${PATH}?flag=ONE_STEP,ONE_STEP`],
      ['a flag that does not exist', `${PATH}?flag=MANY_PAID_SOFTWARE`],
      ['a window that ends before it begins', `${PATH}?from=2026-11-01T00:00:00Z&to=2026-11-01T00:00:00Z`],
      ['a draft among the states', `${PATH}?state=DRAFT`],
      ['a department that is not an id', `${PATH}?departmentId=P-DES`],
    ])('turns away %s, 422', async (_name, path) => {
      expect(bodyOf(await get(path, ['IT_ADMIN']).expect(422)).error.code).toBe('VALIDATION_ERROR');
      expect(oversightPage).not.toHaveBeenCalled();
    });
  });

  describe('accessRequestEventList', () => {
    const PATH = `/api/v1/access-requests/${ID}/events`;

    it('answers whoever is signed in with what the service lets them read, under its own message', async () => {
      const response = await get(PATH, ['EMPLOYEE']).expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'ACCESS_REQUEST_HISTORY.EVENTS_LISTED',
        data: pageWith([EVENT]),
      });
      expect(events).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-9' }), ID, {
        page: 1,
        pageSize: 20,
      });
    });

    it('answers a request the caller may not read as one that does not exist, 404 (the Super Admin included)', async () => {
      events.mockRejectedValueOnce(new AccessRequestNotFoundError());

      expect(bodyOf(await get(PATH, ['SUPER_ADMIN']).expect(404)).error.code).toBe('ACCESS_REQUEST.NOT_FOUND');
    });

    it('has no key of money in an entry', async () => {
      const response = await get(PATH, ['IT_ADMIN']).expect(200);

      expect(keysOf(bodyOf(response).data).filter((key) => MONEY_KEYS.test(key))).toEqual([]);
    });

    it.each([
      ['an id that is not one', '/api/v1/access-requests/not-a-uuid/events'],
      ['a page size of 101', `${PATH}?pageSize=101`],
      ['a parameter that is not listed', `${PATH}?kind=SUBMITTED`],
    ])('turns away %s, 422', async (_name, path) => {
      expect(bodyOf(await get(path, ['IT_ADMIN']).expect(422)).error.code).toBe('VALIDATION_ERROR');
      expect(events).not.toHaveBeenCalled();
    });
  });

  describe('accessRequestAuditFlagList', () => {
    const PATH = '/api/v1/access-request-audit-flags';

    it('answers the Super Admin the flagged requests with the flag by default, under its own message', async () => {
      const response = await get(PATH, ['SUPER_ADMIN']).expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'ACCESS_REQUEST_HISTORY.AUDIT_FLAGS_LISTED',
        data: pageWith([FLAG]),
      });
      expect(flags).toHaveBeenCalledWith({ flag: 'NO_NEED_APPROVER', page: 1, pageSize: 20 });
    });

    it('has no key of money, budget, commitment or evidence in a row', async () => {
      const response = await get(PATH, ['SUPER_ADMIN']).expect(200);

      expect(keysOf(bodyOf(response).data).filter((key) => MONEY_KEYS.test(key))).toEqual([]);
    });

    it.each([['IT_ADMIN'], ['SPENDING_APPROVER'], ['FINANCE'], ['MANAGER'], ['EMPLOYEE']])(
      'turns away %s, 403 AUTHORIZATION.FORBIDDEN',
      async (role) => {
        const response = await get(PATH, [role]).expect(403);

        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
        expect(flags).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['a flag that does not exist', `${PATH}?flag=OTHER`],
      ['a page size of 101', `${PATH}?pageSize=101`],
      ['a window that ends before it begins', `${PATH}?from=2026-11-01T00:00:00Z&to=2026-10-01T00:00:00Z`],
      ['a parameter that is not listed', `${PATH}?departmentId=${DEPT}`],
    ])('turns away %s, 422', async (_name, path) => {
      expect(bodyOf(await get(path, ['SUPER_ADMIN']).expect(422)).error.code).toBe('VALIDATION_ERROR');
      expect(flags).not.toHaveBeenCalled();
    });
  });

  it('answers 401 to a caller with no token on every route', async () => {
    for (const path of [
      `/api/v1/departments/${DEPT}/access-requests`,
      '/api/v1/access-requests',
      `/api/v1/access-requests/${ID}/events`,
      '/api/v1/access-request-audit-flags',
    ]) {
      const response = await request(app.getHttpServer()).get(path).expect(401);
      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    }
  });
});
