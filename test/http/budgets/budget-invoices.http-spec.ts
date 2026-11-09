import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { InvoiceService } from '../../../src/modules/budgets/invoice/invoice.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const BODY = { number: 'INV-1', issuedOn: '2026-11-03', netAmount: { amount: '12000000' } };
const FINANCE = bearer(principal(['FINANCE']));
const money = (amount: string) => ({ amount, currency: 'VND' });
const RECORDED = {
  invoice: {
    id: '4f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22',
    number: 'INV-9',
    issuedOn: '2026-11-03',
    netAmount: money('12000000'),
    deductibleTax: money('1200000'),
    nonDeductibleTax: money('0'),
    actualCost: money('12000000'),
    matchResult: 'TAX_ONLY',
    note: 'first half',
    recordedBy: { employeeId: '5f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d33', employeeCode: 'NV-1', fullName: 'An Nguyen' },
    recordedAt: '2026-11-03T02:00:00.000Z',
  },
  commitment: {
    id: ID,
    requestId: '6f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d44',
    costCenter: { id: '7f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d55', code: 'ENG', name: 'Engineering' },
    year: 2026,
    amount: money('20000000'),
    released: money('0'),
    held: money('8000000'),
    state: 'HELD',
    request: null,
    invoiced: money('12000000'),
    invoiceCount: 1,
    hasDiscrepancy: false,
    attached: true,
    attachedAt: '2026-01-02T00:00:00.000Z',
    unattachedReason: null,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
};

describe('the invoice routes of a commitment (HTTP contract, no database)', () => {
  let app: INestApplication<App>;
  const record = jest.fn();
  const page = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: InvoiceService, useValue: { record, page } }] });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    record.mockReset().mockResolvedValue(RECORDED);
    page
      .mockReset()
      .mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  it.each([
    ['post', `/api/v1/budget-commitments/${ID}/invoices`],
    ['get', `/api/v1/budget-commitments/${ID}/invoices`],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);
    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['post', `/api/v1/budget-commitments/${ID}/invoices`],
    ['get', `/api/v1/budget-commitments/${ID}/invoices`],
  ] as const)('refuses every role but Finance with 403 on %s %s, the IT Admin included', async (method, path) => {
    for (const roles of [['IT_ADMIN'], ['MANAGER'], ['EMPLOYEE'], ['SUPER_ADMIN'], ['SPENDING_APPROVER'], []]) {
      const req = request(app.getHttpServer())
        [method](path)
        .set('Authorization', bearer(principal(roles)));
      const response = await (method === 'post' ? req.send(BODY) : req).expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(record).not.toHaveBeenCalled();
    expect(page).not.toHaveBeenCalled();
  });

  it.each([
    ['no number', { issuedOn: BODY.issuedOn, netAmount: BODY.netAmount }],
    ['a blank number', { ...BODY, number: '   ' }],
    ['a number of 65 characters', { ...BODY, number: 'x'.repeat(65) }],
    ['no date', { number: BODY.number, netAmount: BODY.netAmount }],
    ['a date that does not exist', { ...BODY, issuedOn: '2026-02-30' }],
    ['no price', { number: BODY.number, issuedOn: BODY.issuedOn }],
    ['a currency beside the amounts', { ...BODY, currency: 'VND' }],
    ['a currency in an amount', { ...BODY, netAmount: { amount: '100', currency: 'USD' } }],
    ['a currency in the tax', { ...BODY, deductibleTax: { amount: '1', currency: 'VND' } }],
    ['an amount that is not text', { ...BODY, netAmount: { amount: 100 } }],
    ['an empty note', { ...BODY, note: '' }],
    ['a note of 1001 characters', { ...BODY, note: 'x'.repeat(1001) }],
    ['an unknown field', { ...BODY, vendorId: ID }],
  ])('turns away %s with 422', async (_name, input) => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/budget-commitments/${ID}/invoices`)
      .set('Authorization', FINANCE)
      .send(input)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(record).not.toHaveBeenCalled();
  });

  it('turns away a commitment id that is not an id with 422, on both routes', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/budget-commitments/not-an-id/invoices')
      .set('Authorization', FINANCE)
      .send(BODY)
      .expect(422);
    await request(app.getHttpServer())
      .get('/api/v1/budget-commitments/not-an-id/invoices')
      .set('Authorization', FINANCE)
      .expect(422);
  });

  it.each([['page=0'], ['pageSize=101'], ['pageSize=0'], ['sort=newest']])(
    'turns away the query %s of the list with 422',
    async (query) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/budget-commitments/${ID}/invoices?${query}`)
        .set('Authorization', FINANCE)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(page).not.toHaveBeenCalled();
    },
  );

  it('records an invoice for Finance, passes the body on trimmed and answers 201 in the envelope', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/budget-commitments/${ID}/invoices`)
      .set('Authorization', FINANCE)
      .send({ ...BODY, number: '  INV-9  ', deductibleTax: { amount: '1200000' }, note: ' first half ' })
      .expect(201);

    const envelope = response.body as { success: boolean; message: string; data: typeof RECORDED };
    expect(envelope).toMatchObject({ success: true, message: 'BUDGET_COMMITMENT.INVOICE_RECORDED' });
    expect(envelope.data).toEqual(RECORDED);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['FINANCE'] }),
      ID,
      expect.objectContaining({
        number: 'INV-9',
        issuedOn: '2026-11-03',
        netAmount: { amount: '12000000' },
        deductibleTax: { amount: '1200000' },
        note: 'first half',
      }),
    );
  });

  it('lists the invoices for Finance and passes the page on', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/budget-commitments/${ID}/invoices?page=2&pageSize=5`)
      .set('Authorization', FINANCE)
      .expect(200);

    expect((response.body as { message: string }).message).toBe('BUDGET_COMMITMENT.INVOICES_LISTED');
    expect(page).toHaveBeenCalledWith(ID, expect.objectContaining({ page: 2, pageSize: 5 }));
  });
});
