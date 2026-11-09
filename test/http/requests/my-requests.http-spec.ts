import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TransientDatabaseError } from '../../../src/infrastructure/database/transaction-runner';
import { MyRequestsRepo } from '../../../src/modules/requests/my-requests/my-requests.repo';
import { MyRequestsService } from '../../../src/modules/requests/my-requests/my-requests.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const PATH = '/api/v1/me/access-requests';
const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const PERSON = { employeeId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d12', employeeCode: 'E-12', fullName: 'Linh Tran' };
const ROW = {
  id: ID,
  type: 'GRANT',
  branch: 'PAID_IN_CATALOG',
  state: 'PENDING',
  routing: { mode: 'VIA_HEAD', oneStepReason: null },
  plan: {
    planId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d13',
    planName: 'Business',
    applicationId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d14',
    applicationName: 'Figma',
  },
  softwareName: null,
  beneficiary: PERSON,
  lineCount: 1,
  termMonths: null,
  expectedEndDate: '2027-03-31',
  submittedAt: '2026-10-30T02:00:00.000Z',
  updatedAt: '2026-10-30T02:00:00.000Z',
  needStep: { state: 'PENDING', assignee: PERSON, waitingReason: null },
  spend: null,
  outcome: null,
  withdrawal: null,
  canWithdraw: true,
};
const PAGE = { items: [ROW], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } };

/**
 * The contract of "my requests" (`meAccessRequestList`), with the service replaced, so what is proved is the route: who may call it,
 * what it accepts, and the shape and message of its answer. What it lists, and for whom, is proved on PostgreSQL
 * (`my-requests.integration-spec.ts`). The route asks for no role, as the drafts and the sending of a request do not (an Employee, a
 * head who sends for themselves): the Super Admin also reads their own historical requests — judged by the real service, below.
 */
describe('my requests route (e2e, no database)', () => {
  let app: INestApplication<App>;
  const list = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: MyRequestsService, useValue: { list } }] });
  });

  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue(PAGE);
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (path: string, who = principal(['EMPLOYEE'], { employeeId: 'e-77' })) =>
    request(app.getHttpServer()).get(path).set('Authorization', bearer(who));

  it('without a token is 401', async () => {
    const response = await request(app.getHttpServer()).get(PATH).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(list).not.toHaveBeenCalled();
  });

  it('answers a page for the caller with the defaults, under its own message', async () => {
    const response = await get(PATH).expect(200);

    expect(response.body).toEqual({ success: true, message: 'ME.ACCESS_REQUESTS_LISTED', data: PAGE });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-77' }), { page: 1, pageSize: 20 });
  });

  it('BR-MF1-02 returns one-step revision with NOT_REQUIRED need and no retired flags', async () => {
    const item = {
      ...ROW,
      state: 'AWAITING_REQUESTER_REVISION',
      routing: { mode: 'ONE_STEP', oneStepReason: 'NO_DEPARTMENT_HEAD' },
      needStep: { state: 'NOT_REQUIRED', assignee: null, waitingReason: null },
    };
    list.mockResolvedValue({ ...PAGE, items: [item] });
    const response = await get(PATH).expect(200);
    const data = bodyOf(response).data as unknown as { items: unknown[] };
    expect(data.items).toEqual([item]);
    expect(data.items[0]).not.toHaveProperty('samePersonAsSpend');
  });

  it('reads every narrowing and gives them to the service as they are', async () => {
    await get(
      `${PATH}?view=open&state=PENDING,AWAITING_SPEND_DECISION&type=GROUP_GRANT&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z&page=2&pageSize=5`,
    ).expect(200);

    expect(list).toHaveBeenCalledWith(expect.anything(), {
      page: 2,
      pageSize: 5,
      view: 'open',
      state: 'PENDING,AWAITING_SPEND_DECISION',
      type: 'GROUP_GRANT',
      from: '2026-10-01T00:00:00Z',
      to: '2026-11-01T00:00:00Z',
    });
  });

  it.each([
    ['an Employee', ['EMPLOYEE'], []],
    ['a department head who holds no Employee role of their own', [], ['MANAGER']],
    ['an IT Admin', ['IT_ADMIN'], []],
    ['Finance', ['FINANCE'], []],
  ])('lists the requests %s sent: no role is asked for, as for the drafts', async (_name, direct, derived) => {
    await get(PATH, principal([...direct, ...derived], { employeeId: 'e-5' })).expect(200);

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-5' }), expect.anything());
  });

  it.each([
    ['a parameter that names a person', `${PATH}?employeeId=${ID}`],
    ['a parameter that names a requester', `${PATH}?requesterId=${ID}`],
    ['page 0', `${PATH}?page=0`],
    ['a page size of 101', `${PATH}?pageSize=101`],
    ['a page size of 0', `${PATH}?pageSize=0`],
    ['a view that is neither group', `${PATH}?view=all`],
    ['a draft among the states', `${PATH}?state=DRAFT`],
    ['a state that does not exist', `${PATH}?state=PENDING,GONE`],
    ['a state twice', `${PATH}?state=PENDING,PENDING`],
    ['a type that does not exist', `${PATH}?type=RETURN`],
    ['a moment that is not one', `${PATH}?from=yesterday`],
    ['a window that ends before it begins', `${PATH}?from=2026-11-01T00:00:00Z&to=2026-10-01T00:00:00Z`],
  ])('turns away %s, 422', async (_name, path) => {
    const response = await get(path).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(list).not.toHaveBeenCalled();
  });

  it('answers 503 when the database cannot answer, without detail', async () => {
    list.mockRejectedValueOnce(new TransientDatabaseError('57P01', new Error('terminating connection')));

    const response = await get(PATH).expect(503);

    expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('terminating');
  });

  it('has no way to write the list', async () => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const response = await request(app.getHttpServer())
        [method](PATH)
        .set('Authorization', bearer(principal(['EMPLOYEE'])));

      expect([404, 405]).toContain(response.status);
    }
  });
});

describe('my requests route and the Super Admin (e2e, no database)', () => {
  let app: INestApplication<App>;
  const pageOf = jest.fn();
  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: MyRequestsRepo, useValue: { pageOf, proposalNames: jest.fn().mockResolvedValue(new Map()) } },
      ],
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  it('returns the Super Admin own empty page through the real service', async () => {
    pageOf.mockResolvedValue({ rows: [], total: 0 });
    const response = await request(app.getHttpServer())
      .get(PATH)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .expect(200);
    expect(bodyOf(response).data).toMatchObject({ items: [], pagination: { totalItems: 0 } });
    expect(pageOf).toHaveBeenCalledWith(expect.objectContaining({ requesterEmployeeId: 'e1' }));
  });
});
