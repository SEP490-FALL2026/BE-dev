import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const URL = `/api/v1/access-requests/${ID}/finance-review`;
const OPINION = { outcome: 'ASSESSED', opinion: 'An exception worth making', direction: 'RECOMMEND_OVERRIDE' };

/**
 * The route that ends the review of Finance, as a request that waits for a budget makes it callable too (`financeReviewComplete`, F65,
 * spec J.3): its guard, and what a body must carry, judged before anything is read (e2e, no database).
 */
describe('ending the review of Finance (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token', async () => {
    const response = await request(app.getHttpServer()).post(URL).send(OPINION).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the Super Admin, who never does business work', ['SUPER_ADMIN'], []],
    ['the IT Admin', ['IT_ADMIN'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s with 403', async (_name, direct, derived) => {
    const response = await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', bearer(principal([...direct, ...derived])))
      .send(OPINION)
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    ['no outcome', {}],
    ['an outcome the route does not know', { outcome: 'APPROVED', reason: 'x' }],
    ['an opinion with no text', { outcome: 'ASSESSED', direction: 'RECOMMEND_APPROVE' }],
    ['an opinion with no direction', { outcome: 'ASSESSED', opinion: 'Reviewed' }],
    ['an opinion that gives a reason', { ...OPINION, reason: 'x' }],
    ['a blank opinion', { ...OPINION, opinion: '   ' }],
    ['a direction the route does not know', { ...OPINION, direction: 'RECOMMEND_NOTHING' }],
    ['a request given back with no reason', { outcome: 'RETURN_TO_HEAD' }],
    ['a request given back with a blank reason', { outcome: 'RETURN_TO_HEAD', reason: '  ' }],
    ['a request given back with an opinion', { outcome: 'RETURN_TO_HEAD', reason: 'x', opinion: 'y' }],
    ['a budget asked for with no reason', { outcome: 'NEEDS_BUDGET' }],
    ['a budget asked for with a direction', { outcome: 'NEEDS_BUDGET', reason: 'x', direction: 'RECOMMEND_APPROVE' }],
    ['a field the route does not know', { outcome: 'RETURN_TO_HEAD', reason: 'x', year: 2026 }],
  ])('refuses %s with 422, before anything is read', async (_name, payload) => {
    const response = await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', bearer(principal(['FINANCE'])))
      .send(payload)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a request id that is not an id with 422', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/access-requests/not-an-id/finance-review')
      .set('Authorization', bearer(principal(['FINANCE'])))
      .send(OPINION)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
