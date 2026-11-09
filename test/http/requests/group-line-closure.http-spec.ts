import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { GroupLineQueryService } from '../../../src/modules/requests/group-line-decisions/group-line-query.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const PERSON = '7a1d2c3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d';
const URL = `/api/v1/access-requests/${ID}/lines/${PERSON}/departure-closure`;

describe('BR-MF1-02 the line of a one-step group (HTTP contract)', () => {
  let app: INestApplication<App>;
  const employee = { employeeId: PERSON, employeeCode: 'E-1', fullName: 'An' };
  const item = {
    employee, position: 1, state: 'NEED_CONFIRMED',
    needStep: { id: ID, state: 'NOT_REQUIRED', assignee: null },
    expectedEndDate: null, needDecision: null, spendDecision: null, cost: null, share: null,
    endedAt: null, endedBy: null, endReason: null, cancelCause: null,
  };
  const page = { items: [item], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } };
  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: GroupLineQueryService, useValue: {
      page: jest.fn().mockResolvedValue(page),
    } }] });
  });
  afterAll(async () => { await app?.close(); });

  it('BR-MF1-02 accepts NOT_REQUIRED without an assignee or a need decision in the response', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/access-requests/${ID}/lines`)
      .set('Authorization', bearer(principal(['EMPLOYEE']))).expect(200);
    expect(bodyOf(response).data).toEqual(page);
  });
});

describe('removing a person who left from a request for a group (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token (US-03-04 AC-25)', async () => {
    const response = await request(app.getHttpServer()).post(URL).send({ cause: 'BENEFICIARY_LEFT' }).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the Super Admin, who never does business work', ['SUPER_ADMIN'], []],
    ['the finance officer', ['FINANCE'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403', async (_name, direct, derived) => {
    const response = await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', bearer(principal([...direct, ...derived])))
      .send({ cause: 'BENEFICIARY_LEFT' })
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['no cause', {}],
    ['a cause the route does not know', { cause: 'REQUESTER_WITHDREW' }],
    ['a blank note', { cause: 'BENEFICIARY_LEFT', note: '   ' }],
    ['a blank evidence', { cause: 'BENEFICIARY_LEFT', evidence: ' ' }],
    ['a closing for a transfer that gives no reason (F29)', { cause: 'BENEFICIARY_TRANSFERRED' }],
    ['a field the route does not know', { cause: 'BENEFICIARY_LEFT', reason: 'x' }],
  ])('refuses %s with 422', async (_name, payload) => {
    const response = await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(payload)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a request id or a person id that is not an id with 422', async () => {
    for (const url of [
      `/api/v1/access-requests/not-an-id/lines/${PERSON}/departure-closure`,
      `/api/v1/access-requests/${ID}/lines/not-an-id/departure-closure`,
    ]) {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send({ cause: 'BENEFICIARY_LEFT' })
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });
});
