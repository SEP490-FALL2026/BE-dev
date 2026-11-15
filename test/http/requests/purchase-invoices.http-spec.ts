import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const URL = '/api/v1/purchase-invoices';
const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const FILE = '8a1d2c3e-4f5a-4b6c-9d7e-0f1a2b3c4d5e';

const form = (over: Record<string, unknown> = {}) => ({
  link: { requestId: ID },
  vendorInvoiceNumber: 'INV-1',
  issuedOn: '2026-11-02',
  servicePeriodMonth: '2026-11',
  quantity: 10,
  unitPriceOriginal: { amount: '15', currency: 'USD' },
  netAmount: { amount: '3840000' },
  paymentSource: 'COMPANY_CARD',
  ...over,
});
const submission = (over: Record<string, unknown> = {}) => ({ ...form(), documentIds: [FILE], ...over });

/**
 * The routes of purchase invoices (`PI-1`, `QĐ-111u`): who may call each, and what a body or a query must carry, judged before anything is read
 * (e2e, no database). What a submission reads and keeps, the label and the department that bears it are proved by
 * `purchase-invoice.integration-spec.ts`.
 */
describe('the routes of purchase invoices (e2e, no database)', () => {
  let app: INestApplication<App>;
  const as = (roles: string[]) => bearer(principal(roles));

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('needs a token to sign and to return, and refuses everyone but Finance with 403', async () => {
    for (const url of [`${URL}/${ID}/confirmation`, `${URL}/${ID}/return`]) {
      const unauthenticated = await request(app.getHttpServer()).post(url).send({ reason: 'x' }).expect(401);
      expect(bodyOf(unauthenticated).error.code).toBe('AUTHENTICATION_REQUIRED');
      for (const roles of [['IT_ADMIN'], ['EMPLOYEE'], ['SUPER_ADMIN']]) {
        const refused = await request(app.getHttpServer())
          .post(url)
          .set('Authorization', as(roles))
          .send({ reason: 'x' })
          .expect(403);
        expect(bodyOf(refused).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      }
    }
  });

  it.each([
    ['no reason', {}],
    ['a blank reason', { reason: '   ' }],
    ['a reason of 1001 characters', { reason: 'x'.repeat(1001) }],
    ['a field the return does not have', { reason: 'x', note: 'y' }],
  ])('refuses a return with %s with 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(`${URL}/${ID}/return`)
      .set('Authorization', as(['FINANCE']))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a signature or a return whose id is not an id with 422', async () => {
    for (const path of ['confirmation', 'return']) {
      const response = await request(app.getHttpServer())
        .post(`${URL}/hoa-don/${path}`)
        .set('Authorization', as(['FINANCE']))
        .send({ reason: 'x' })
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it.each([
    ['preview', 'post', `${URL}/preview`],
    ['submission', 'post', URL],
    ['resubmission', 'post', `${URL}/${ID}/resubmission`],
    ['list', 'get', URL],
    ['detail', 'get', `${URL}/${ID}`],
  ] as const)('needs a token for the %s', async (_name, method, url) => {
    const response = await request(app.getHttpServer())[method](url).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['an employee', ['EMPLOYEE']],
    ['the Super Admin, who never does business work', ['SUPER_ADMIN']],
    ['Finance, who signs but never submits', ['FINANCE']],
  ])('refuses the preview, the submission and the resubmission to %s with 403', async (_name, roles) => {
    for (const [url, body] of [
      [`${URL}/preview`, form()],
      [URL, submission()],
      [`${URL}/${ID}/resubmission`, { ...submission(), link: undefined }],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', as(roles))
        .send(body)
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each([
    ['an employee', ['EMPLOYEE']],
    ['the Super Admin', ['SUPER_ADMIN']],
  ])('refuses the list and the detail to %s with 403', async (_name, roles) => {
    for (const url of [URL, `${URL}/${ID}`]) {
      await request(app.getHttpServer()).get(url).set('Authorization', as(roles)).expect(403);
    }
  });

  it.each([
    ['no file (a purchase invoice needs at least one)', { documentIds: [] }],
    ['twenty-one files (at most twenty)', { documentIds: Array.from({ length: 21 }, () => FILE) }],
    ['a file that is not an id', { documentIds: ['hoa-don.pdf'] }],
    ['no link', { link: {} }],
    ['a request and a subscription together', { link: { requestId: ID, subscriptionId: ID } }],
    ['a task with a subscription', { link: { subscriptionId: ID, provisioningTaskId: ID } }],
    ['a month that is not a month', { servicePeriodMonth: '2026-13' }],
    ['a day instead of a month', { servicePeriodMonth: '2026-11-01' }],
    ['a count of 0', { quantity: 0 }],
    ['a count that is not whole', { quantity: 1.5 }],
    ['a payment source the system does not know', { paymentSource: 'CASH' }],
    ['a currency on the dong amount', { netAmount: { amount: '1', currency: 'VND' } }],
    ['a currency of two letters', { unitPriceOriginal: { amount: '15', currency: 'US' } }],
    ['a blank number', { vendorInvoiceNumber: '   ' }],
    ['a number of 65 characters', { vendorInvoiceNumber: 'x'.repeat(65) }],
    ['no date', { issuedOn: undefined }],
    ['a date that does not exist', { issuedOn: '2026-02-30' }],
    ['no price', { netAmount: undefined }],
    ['an amount that is not text', { netAmount: { amount: 100 } }],
    ['a currency on the tax', { deductibleTax: { amount: '1', currency: 'VND' } }],
    ['a currency on the tax that cannot be deducted', { nonDeductibleTax: { amount: '1', currency: 'VND' } }],
    ['a field the form does not have', { departmentId: ID }],
  ])('refuses a submission with %s with 422', async (_name, over) => {
    const response = await request(app.getHttpServer())
      .post(URL)
      .set('Authorization', as(['IT_ADMIN']))
      .send(submission(over))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a preview that carries files, and a resubmission that names a link, with 422', async () => {
    for (const [url, body] of [
      [`${URL}/preview`, submission()],
      [`${URL}/${ID}/resubmission`, submission()],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', as(['IT_ADMIN']))
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it.each([
    ['a state the list does not know', { state: 'PAID' }],
    ['a label the list does not know', { label: 'Mua mới' }],
    ['a vendor that is not an id', { vendorId: 'figma' }],
    ['a month that is not a month', { servicePeriodMonth: '11/2026' }],
    ['a page of 0', { page: 0 }],
    ['a page size of 101', { pageSize: 101 }],
  ])('refuses listing with %s with 422', async (_name, query) => {
    for (const roles of [['IT_ADMIN'], ['FINANCE']]) {
      const response = await request(app.getHttpServer())
        .get(URL)
        .query(query)
        .set('Authorization', as(roles))
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('refuses a detail whose id is not an id with 422', async () => {
    const response = await request(app.getHttpServer())
      .get(`${URL}/hoa-don`)
      .set('Authorization', as(['FINANCE']))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
