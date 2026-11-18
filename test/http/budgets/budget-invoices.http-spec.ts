import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { InvoiceService } from '../../../src/modules/budgets/invoice/invoice.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const FINANCE = bearer(principal(['FINANCE']));
const money = (amount: string) => ({ amount, currency: 'VND' });
const INVOICE = {
  id: '4f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d22',
  number: 'INV-9',
  issuedOn: '2026-11-03',
  netAmount: money('12000000'),
  deductibleTax: money('1200000'),
  nonDeductibleTax: money('0'),
  actualCost: money('12000000'),
  matchResult: 'TAX_ONLY',
  servicePeriodMonth: '2026-11',
  label: 'NEW_PURCHASE',
  paymentSource: 'COMPANY_CARD',
  note: null,
  recordedBy: { employeeId: '5f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d33', employeeCode: 'NV-1', fullName: 'An Nguyen' },
  recordedAt: '2026-11-03T02:00:00.000Z',
};

describe('the invoice routes of a commitment (HTTP contract, no database)', () => {
  let app: INestApplication<App>;
  const page = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: InvoiceService, useValue: { page } }] });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    page
      .mockReset()
      .mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  it('answers 401 to the list without a token', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/budget-commitments/${ID}/invoices`).expect(401);
    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('refuses every role but Finance with 403 on the list, the IT Admin included', async () => {
    for (const roles of [['IT_ADMIN'], ['MANAGER'], ['EMPLOYEE'], ['SUPER_ADMIN'], ['SPENDING_APPROVER'], []]) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/budget-commitments/${ID}/invoices`)
        .set('Authorization', bearer(principal(roles)))
        .expect(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(page).not.toHaveBeenCalled();
  });

  it('has no route that records an invoice: Finance no longer writes one by hand, an invoice enters through the signature of a purchase invoice (PI-1.7)', async () => {
    for (const token of [FINANCE, bearer(principal(['IT_ADMIN'])), undefined]) {
      const req = request(app.getHttpServer()).post(`/api/v1/budget-commitments/${ID}/invoices`);
      const response = await (token ? req.set('Authorization', token) : req)
        .send({ number: 'INV-1', issuedOn: '2026-11-03', netAmount: { amount: '12000000' } })
        .expect(404);
      expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
    }
    expect(page).not.toHaveBeenCalled();
  });

  it('turns away a commitment id that is not an id with 422', async () => {
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

  it('lists the invoices for Finance and passes the page on', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/budget-commitments/${ID}/invoices?page=2&pageSize=5`)
      .set('Authorization', FINANCE)
      .expect(200);

    expect((response.body as { message: string }).message).toBe('BUDGET_COMMITMENT.INVOICES_LISTED');
    expect(page).toHaveBeenCalledWith(ID, expect.objectContaining({ page: 2, pageSize: 5 }));
  });

  it('shows the month, the label and the way of payment of an invoice of a purchase, and nothing of them for one kept from before', async () => {
    const old = {
      ...INVOICE,
      id: '8f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d66',
      servicePeriodMonth: null,
      label: null,
      paymentSource: null,
    };
    const items = [
      INVOICE,
      old,
      { ...INVOICE, id: '9f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d77', label: 'RENEWAL', paymentSource: 'IT_ADVANCE' },
    ];
    page.mockResolvedValue({ items, pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1 } });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/budget-commitments/${ID}/invoices`)
      .set('Authorization', FINANCE)
      .expect(200);

    expect((response.body as { data: { items: unknown[] } }).data.items).toEqual(items);
  });
});
