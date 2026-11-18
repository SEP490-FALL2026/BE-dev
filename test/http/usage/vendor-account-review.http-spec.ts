import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const DISCREPANCIES = '/api/v1/vendor-account-discrepancies';
const CASES = '/api/v1/out-of-process-cases';
const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const FILE = '8a1d2c3e-4f5a-4b6c-9d7e-0f1a2b3c4d5e';

const deciding = (over: Record<string, unknown> = {}) => ({
  decision: 'FALSE_ALARM',
  note: 'Tài khoản thử nghiệm',
  ...over,
});
const closing = (over: Record<string, unknown> = {}) => ({
  outcome: 'REPORT_ONLY',
  note: 'Không có chứng từ',
  ...over,
});

/**
 * The routes of the review of the accounts at the vendors and of the cases outside the process (`RC-2`, `QĐ-111y`): who may call each, and what a body or a
 * query must carry, judged before anything is read (e2e, no database). What a difference holds, how it is made, what a closing records and where the money
 * goes are proved by `vendor-account-review.integration-spec.ts`.
 */
describe('the routes of the review of the accounts at the vendors (e2e, no database)', () => {
  let app: INestApplication<App>;
  const as = (roles: string[]) => bearer(principal(roles));

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token on every route', async () => {
    for (const response of [
      await request(app.getHttpServer()).get(DISCREPANCIES).expect(401),
      await request(app.getHttpServer()).post(`${DISCREPANCIES}/${ID}/decision`).send(deciding()).expect(401),
      await request(app.getHttpServer()).get(CASES).expect(401),
      await request(app.getHttpServer()).post(`${CASES}/${ID}/closure`).send(closing()).expect(401),
    ]) {
      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    }
  });

  it('lets only the IT Admin read and decide the differences', async () => {
    for (const roles of [['FINANCE'], ['EMPLOYEE'], ['SUPER_ADMIN'], ['SPENDING_APPROVER']]) {
      const read = await request(app.getHttpServer()).get(DISCREPANCIES).set('Authorization', as(roles)).expect(403);
      expect(bodyOf(read).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      const decided = await request(app.getHttpServer())
        .post(`${DISCREPANCIES}/${ID}/decision`)
        .set('Authorization', as(roles))
        .send(deciding())
        .expect(403);
      expect(bodyOf(decided).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('lets only Finance and the IT Admin read and close the cases', async () => {
    for (const roles of [['EMPLOYEE'], ['SUPER_ADMIN'], ['SPENDING_APPROVER']]) {
      const read = await request(app.getHttpServer()).get(CASES).set('Authorization', as(roles)).expect(403);
      expect(bodyOf(read).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      const closed = await request(app.getHttpServer())
        .post(`${CASES}/${ID}/closure`)
        .set('Authorization', as(roles))
        .send(closing())
        .expect(403);
      expect(bodyOf(closed).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each([
    ['no decision', deciding({ decision: undefined })],
    ['a decision the review does not have', deciding({ decision: 'IGNORE' })],
    ['no note', deciding({ note: undefined })],
    ['a blank note', deciding({ note: '   ' })],
    ['a note of 1001 characters', deciding({ note: 'x'.repeat(1001) })],
    ['a field the decision does not have', deciding({ reason: 'x' })],
  ])('refuses a decision with %s with 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(`${DISCREPANCIES}/${ID}/decision`)
      .set('Authorization', as(['IT_ADMIN']))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['no outcome', closing({ outcome: undefined })],
    ['an outcome the case does not have', closing({ outcome: 'EXPLAINED' })],
    ['no note', closing({ note: undefined })],
    ['a blank note', closing({ note: '  ' })],
    ['no file in a list of files', closing({ documentIds: [] })],
    ['a file that is not an id', closing({ documentIds: ['hoa-don'] })],
    ['twenty-one files', closing({ documentIds: Array.from({ length: 21 }, () => FILE) })],
    ['an amount that carries a currency', closing({ amount: { amount: '1', currency: 'VND' } })],
    ['a Cost Center that is neither an id nor UNALLOCATED', closing({ costCenterId: 'phong-ban' })],
    ['a field the closing does not have', closing({ reason: 'x' })],
  ])('refuses a closing with %s with 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(`${CASES}/${ID}/closure`)
      .set('Authorization', as(['FINANCE']))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a difference or a case whose id is not an id with 422', async () => {
    for (const response of [
      await request(app.getHttpServer())
        .post(`${DISCREPANCIES}/diferencia/decision`)
        .set('Authorization', as(['IT_ADMIN']))
        .send(deciding())
        .expect(422),
      await request(app.getHttpServer())
        .post(`${CASES}/caso/closure`)
        .set('Authorization', as(['FINANCE']))
        .send(closing())
        .expect(422),
    ]) {
      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it.each([
    ['a page size of 101', { pageSize: 101 }],
    ['a page of 0', { page: 0 }],
    ['a state that is not one', { state: 'DONE' }],
    ['a source that is not one', { source: 'BANK_STATEMENT' }],
    ['an application that is not an id', { applicationId: 'figma' }],
    ['a filter the list does not have', { vendorId: ID }],
  ])('refuses a list of differences with %s with 422', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get(DISCREPANCIES)
      .query(query)
      .set('Authorization', as(['IT_ADMIN']))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['a state that is not one', { state: 'DONE' }],
    ['an outcome that is not one', { outcome: 'EXPLAINED' }],
    ['a page size of 0', { pageSize: 0 }],
  ])('refuses a list of cases with %s with 422', async (_name, query) => {
    const response = await request(app.getHttpServer())
      .get(CASES)
      .query(query)
      .set('Authorization', as(['FINANCE']))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
