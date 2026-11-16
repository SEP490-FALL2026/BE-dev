import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const PATH = '/api/v1/budget-adjustments';
const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const COST_CENTER = '5b7a1e9c-0d11-4f6a-8d2c-3f0c7d549e1b';

/**
 * The routes of the adjustment of the budget in the year (`AD-1`): who may call them, and what the body, the query and the id must carry, judged before anything is read (e2e, no
 * database). The figures, the floor and the effective budget are proved by `budget-adjustment.integration-spec.ts`.
 */
describe('the routes of the adjustments of the budget (e2e, no database)', () => {
  let app: INestApplication<App>;
  const as = (roles: string[]) => bearer(principal(roles));
  const create = (body: object, roles: string[] = ['FINANCE']) =>
    request(app.getHttpServer()).post(PATH).set('Authorization', as(roles)).send(body);
  const list = (query: object, roles: string[] = ['FINANCE']) =>
    request(app.getHttpServer()).get(PATH).query(query).set('Authorization', as(roles));
  const decide = (id: string, body: object, roles: string[] = ['SPENDING_APPROVER']) =>
    request(app.getHttpServer()).post(`${PATH}/${id}/decision`).set('Authorization', as(roles)).send(body);
  const supplement = {
    year: 2026,
    kind: 'SUPPLEMENT',
    toCostCenterId: COST_CENTER,
    amount: { amount: '20000000' },
    reason: 'Dự án mới',
  };

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token', async () => {
    expect(bodyOf(await request(app.getHttpServer()).get(PATH).expect(401)).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('lets only Finance ask for an adjustment', async () => {
    for (const roles of [['EMPLOYEE'], ['IT_ADMIN'], ['SPENDING_APPROVER'], ['MANAGER'], ['SUPER_ADMIN']]) {
      expect(bodyOf(await create(supplement, roles).expect(403)).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('lets only the spending approver decide', async () => {
    for (const roles of [['EMPLOYEE'], ['IT_ADMIN'], ['FINANCE'], ['MANAGER'], ['SUPER_ADMIN']]) {
      expect(bodyOf(await decide(ID, { decision: 'APPROVE' }, roles).expect(403)).error.code).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
    }
  });

  it('lets Finance, the spending approver and the manager of a department read the adjustments, and nobody else', async () => {
    for (const roles of [['EMPLOYEE'], ['IT_ADMIN'], ['SUPER_ADMIN']]) {
      expect(bodyOf(await list({}, roles).expect(403)).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('refuses a body with no kind, no amount, no reason, a kind it does not know, an amount that is not a string and a key it does not know, before reading anything', async () => {
    const { kind, ...noKind } = supplement;
    const { amount, ...noAmount } = supplement;
    const { reason, ...noReason } = supplement;
    expect([kind, amount, reason]).toHaveLength(3);
    for (const body of [
      noKind,
      noAmount,
      noReason,
      { ...supplement, kind: 'GIFT' },
      { ...supplement, amount: '20000000' },
      { ...supplement, amount: { amount: '1', currency: 'VND' } },
      { ...supplement, reason: '   ' },
      { ...supplement, year: 1999 },
      { ...supplement, toCostCenterId: 'not-an-id' },
      { ...supplement, transferReason: 'BECAUSE' },
      { ...supplement, unknown: 'x' },
    ]) {
      expect(bodyOf(await create(body).expect(422)).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('refuses a page too large, a year out of range, a state it does not know, an id that is not one and a key it does not know', async () => {
    for (const response of [
      await list({ pageSize: 101 }).expect(422),
      await list({ year: 1999 }).expect(422),
      await list({ state: 'DONE' }).expect(422),
      await list({ costCenterId: 'x' }).expect(422),
      await list({ unknown: 'x' }).expect(422),
      await decide('not-an-id', { decision: 'APPROVE' }).expect(422),
      await decide(ID, { decision: 'MAYBE' }).expect(422),
      await decide(ID, { decision: 'APPROVE', unknown: 'x' }).expect(422),
      await decide(ID, { decision: 'REJECT', reason: '  ' }).expect(422),
    ]) {
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });
});
