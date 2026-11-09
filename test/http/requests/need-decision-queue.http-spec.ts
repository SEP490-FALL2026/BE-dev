import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { NeedDecisionQueueService } from '../../../src/modules/requests/need-decision-queue/need-decision-queue.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal, UNAVAILABLE_TOKEN } from '../../support/http-contract-app';

const URL = '/api/v1/need-decisions';
const REQUEST_ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const STEP_ID = '7a1f0c54-2e1b-4a6a-9d2c-5b7a1e9c0d22';
const PERSON = { employeeId: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f', employeeCode: 'E-1', fullName: 'An' };

/** A page of the queue as the service would answer it; the serializer judges it against the declared schema. */
const PAGE = {
  items: [
    {
      requestId: REQUEST_ID,
      stepId: STEP_ID,
      stepKind: 'NEED',
      deciderRole: 'MANAGER',
      type: 'GRANT',
      openedAt: '2026-10-01T02:00:00.000Z',
      assignedAt: null,
      slaWorkingDays: 2,
      dueOn: '2026-10-05',
      plan: null,
      softwareName: 'Notion',
      requester: PERSON,
      beneficiary: null,
      lineCount: 3,
      department: { id: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', code: 'P-DES', name: 'Design' },
      businessReasonExcerpt: 'The project needs a wiki',
      termMonths: null,
      expectedEndDate: '2027-03-31',
      pricing: { status: 'PRICED', amount: { amount: '1200000', currency: 'VND' } },
      samePersonAsSpend: false,
    },
  ],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
};

/** The route that lists the need steps a person holds: its guard, what its query must carry, and what it answers (no database). */
describe('the queue of the need steps of the person who holds them (e2e, no database)', () => {
  let app: INestApplication<App>;
  const queue = jest.fn<Promise<unknown>, [{ employeeId: string }, Record<string, unknown>]>();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: NeedDecisionQueueService, useValue: { queue } }] });
  });

  beforeEach(() => {
    queue.mockReset();
    queue.mockResolvedValue(PAGE);
  });

  afterAll(async () => {
    await app?.close();
  });

  const as = (...roles: string[]) => bearer(principal(roles, { employeeId: 'caller-employee' }));

  describe('who may call it', () => {
    it('needs a token', async () => {
      const response = await request(app.getHttpServer()).get(URL).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(queue).not.toHaveBeenCalled();
    });

    it('refuses a token that is not valid with 401', async () => {
      const response = await request(app.getHttpServer()).get(URL).set('Authorization', 'Bearer nonsense').expect(401);

      expect(bodyOf(response).error.code).toBe('INVALID_ACCESS_TOKEN');
    });

    it('answers 503 when the token cannot be checked, never 401', async () => {
      const response = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${UNAVAILABLE_TOKEN}`)
        .expect(503);

      expect(bodyOf(response).error.code).toBe('TOKEN_VERIFICATION_UNAVAILABLE');
    });

    it.each([
      ['an employee', ['EMPLOYEE']],
      ['a department head, whose role is derived', []],
      ['the IT Admin', ['IT_ADMIN']],
      ['Finance', ['FINANCE']],
    ])('lets %s through to the handler: what they read is decided by the step, not by a role', async (_name, roles) => {
      await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', as(...roles))
        .expect(200);

      expect(queue).toHaveBeenCalledTimes(1);
      expect(queue.mock.calls[0][0]).toMatchObject({ employeeId: 'caller-employee' });
    });
  });

  describe('what it asks for', () => {
    it('reads the first page of twenty when the query says nothing, for whoever calls it', async () => {
      await request(app.getHttpServer()).get(URL).set('Authorization', as('EMPLOYEE')).expect(200);

      expect(queue.mock.calls[0][1]).toEqual({ page: 1, pageSize: 20 });
    });

    it('passes the page, the size and the kind of request it was given, and nothing else', async () => {
      await request(app.getHttpServer())
        .get(URL)
        .query({ page: 2, pageSize: 100, type: 'GROUP_GRANT' })
        .set('Authorization', as('EMPLOYEE'))
        .expect(200);

      expect(queue.mock.calls[0][1]).toEqual({ page: 2, pageSize: 100, type: 'GROUP_GRANT' });
    });

    it.each([
      ['a page of zero', { page: 0 }],
      ['a negative page', { page: -1 }],
      ['a page that is not a number', { page: 'one' }],
      ['a size of zero', { pageSize: 0 }],
      ['a size over a hundred', { pageSize: 101 }],
      ['a size that is not a number', { pageSize: 'many' }],
      ['a kind of request that does not exist', { type: 'PURCHASE' }],
      ['a department to filter by, which the queue does not offer', { departmentId: REQUEST_ID }],
      ['an employee to filter by, which the queue does not offer', { assigneeEmployeeId: REQUEST_ID }],
    ])('refuses %s with 422, before anything is read', async (_name, query) => {
      const response = await request(app.getHttpServer())
        .get(URL)
        .query(query)
        .set('Authorization', as('EMPLOYEE'))
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(queue).not.toHaveBeenCalled();
    });
  });

  describe('what it answers', () => {
    it('wraps the page in the envelope with its own message, and the serializer accepts the row', async () => {
      const response = await request(app.getHttpServer()).get(URL).set('Authorization', as('EMPLOYEE')).expect(200);

      expect(bodyOf(response)).toMatchObject({
        success: true,
        message: 'NEED_DECISION.LISTED',
        data: { items: [{ requestId: REQUEST_ID, stepKind: 'NEED', lineCount: 3 }], pagination: { totalItems: 1 } },
      });
    });

    it('answers an empty page for a person who holds nothing', async () => {
      queue.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });

      const response = await request(app.getHttpServer()).get(URL).set('Authorization', as('EMPLOYEE')).expect(200);

      expect(bodyOf(response).data).toEqual({
        items: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      });
    });
  });
});
