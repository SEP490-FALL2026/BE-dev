import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const SUBSCRIPTION = '8a1f2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const CONTRACTS = '/api/v1/contracts';

/**
 * The routes of the contracts (`contractList`, `contractUpdate`, `contractSubscriptionLink`, `contractSubscriptionUnlink`; `QĐ-111t`): the guard,
 * and what a request must carry, judged before anything is read (e2e, no database). What a contract does with the vendor, the days and the
 * subscriptions is proved by `contracts.integration-spec.ts`.
 */
describe('the routes of the contracts (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const as = (req: request.Test, roles: string[]) => req.set('Authorization', bearer(principal(roles)));

  it.each([
    ['get', CONTRACTS],
    ['patch', `${CONTRACTS}/${ID}`],
    ['post', `${CONTRACTS}/${ID}/subscriptions`],
    ['delete', `${CONTRACTS}/${ID}/subscriptions/${SUBSCRIPTION}`],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the department head, whose role is derived', [], ['MANAGER']],
    ['an employee', ['EMPLOYEE'], []],
    ['the Super Admin, who never does business work', ['SUPER_ADMIN'], []],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ['an account with no role', [], []],
  ])(
    'refuses %s every route of the contracts with 403 and no contract in the answer (SoD-2)',
    async (_name, direct, derived) => {
      const server = app.getHttpServer();
      const roles = [...direct, ...derived];

      for (const response of [
        await as(request(server).get(CONTRACTS), roles),
        await as(request(server).get(`${CONTRACTS}/${ID}`), roles),
        await as(request(server).patch(`${CONTRACTS}/${ID}`).send({ note: 'x', reason: 'r' }), roles),
        await as(
          request(server).post(`${CONTRACTS}/${ID}/subscriptions`).send({ subscriptionId: SUBSCRIPTION }),
          roles,
        ),
        await as(request(server).delete(`${CONTRACTS}/${ID}/subscriptions/${SUBSCRIPTION}`), roles),
      ]) {
        expect(response.status).toBe(403);
        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
        expect(JSON.stringify(response.body)).not.toContain(ID);
      }
    },
  );

  it('lets Finance read the list and the contracts and nothing else: it changes and links nothing', async () => {
    const server = app.getHttpServer();
    const finance = ['FINANCE'];

    for (const response of [
      await as(request(server).patch(`${CONTRACTS}/${ID}`).send({ note: 'x', reason: 'r' }), finance),
      await as(
        request(server).post(`${CONTRACTS}/${ID}/subscriptions`).send({ subscriptionId: SUBSCRIPTION }),
        finance,
      ),
      await as(request(server).delete(`${CONTRACTS}/${ID}/subscriptions/${SUBSCRIPTION}`), finance),
    ]) {
      expect(response.status).toBe(403);
    }
  });

  it.each([
    ['a list with a page of 0', 'get', CONTRACTS, undefined, { page: 0 }],
    ['a list with a page size of 101', 'get', CONTRACTS, undefined, { pageSize: 101 }],
    ['a list by a status that is not one', 'get', CONTRACTS, undefined, { status: 'IN_EFFECT' }],
    ['a list by a vendor that is not an id', 'get', CONTRACTS, undefined, { vendorId: 'atlassian' }],
    ['a list by a day that does not exist', 'get', CONTRACTS, undefined, { effectiveOn: '2026-02-30' }],
    ['a list by the kind of a contract, which there is none of', 'get', CONTRACTS, undefined, { kind: 'TERM' }],
    ['a list by a department, which a contract does not have', 'get', CONTRACTS, undefined, { departmentId: ID }],
    ['a change of an id that is not a UUID', 'patch', `${CONTRACTS}/not-a-uuid`, { note: 'x', reason: 'r' }, undefined],
    [
      'a change that names the kind of the contract',
      'patch',
      `${CONTRACTS}/${ID}`,
      { kind: 'TERM', reason: 'r' },
      undefined,
    ],
    ['a change that takes the vendor away', 'patch', `${CONTRACTS}/${ID}`, { vendorId: null, reason: 'r' }, undefined],
    [
      'a change of a day that does not exist',
      'patch',
      `${CONTRACTS}/${ID}`,
      { effectiveTo: '2026-13-01', reason: 'r' },
      undefined,
    ],
    [
      'a change with a note of 2001 characters',
      'patch',
      `${CONTRACTS}/${ID}`,
      { note: 'n'.repeat(2001), reason: 'r' },
      undefined,
    ],
    [
      'a change with a number of 101 characters',
      'patch',
      `${CONTRACTS}/${ID}`,
      { number: 'n'.repeat(101), reason: 'r' },
      undefined,
    ],
    [
      'a change that names who made the contract',
      'patch',
      `${CONTRACTS}/${ID}`,
      { createdBy: ID, reason: 'r' },
      undefined,
    ],
    ['a link with no subscription', 'post', `${CONTRACTS}/${ID}/subscriptions`, {}, undefined],
    [
      'a link of a subscription that is not an id',
      'post',
      `${CONTRACTS}/${ID}/subscriptions`,
      { subscriptionId: 'jira' },
      undefined,
    ],
    [
      'a link that names a plan too',
      'post',
      `${CONTRACTS}/${ID}/subscriptions`,
      { subscriptionId: SUBSCRIPTION, planId: ID },
      undefined,
    ],
    [
      'an unlink of a subscription that is not an id',
      'delete',
      `${CONTRACTS}/${ID}/subscriptions/jira`,
      undefined,
      undefined,
    ],
  ] as const)('refuses %s with 422 before any contract is read', async (_name, method, path, body, query) => {
    const test = request(app.getHttpServer())[method](path);
    if (query) test.query(query);
    if (body) test.send(body);

    const response = await as(test, ['IT_ADMIN']).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('has no route that deletes a contract', async () => {
    await as(request(app.getHttpServer()).delete(`${CONTRACTS}/${ID}`), ['IT_ADMIN']).expect(404);
  });
});
