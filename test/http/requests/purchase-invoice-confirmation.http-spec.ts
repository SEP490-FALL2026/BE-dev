import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { FinanceApi } from '../../../src/modules/finance/public/finance.api';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { InvoiceDiscrepancyClosureService } from '../../../src/modules/requests/invoice-discrepancy/invoice-discrepancy-closure.service';
import {
  InvoiceDiscrepancyRepo,
  type InvoiceDiscrepancyRow,
} from '../../../src/modules/requests/invoice-discrepancy/invoice-discrepancy.repo';
import { InvoiceDiscrepancyQueryService } from '../../../src/modules/requests/invoice-discrepancy-queue/invoice-discrepancy-query.service';
import { PurchaseInvoiceConfirmationService } from '../../../src/modules/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service';
import { PurchaseInvoiceQueryService } from '../../../src/modules/requests/purchase-invoice/purchase-invoice-query.service';
import {
  PurchaseInvoiceRepo,
  type PurchaseInvoiceRow,
} from '../../../src/modules/requests/purchase-invoice/purchase-invoice.repo';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const PI_ID = '22222222-2222-4222-8222-222222222222';
const SUB_ID = '33333333-3333-4333-8333-333333333333';
const VENDOR_ID = '44444444-4444-4444-8444-444444444444';
const INVOICE_ID = '55555555-5555-4555-8555-555555555555';
const CASE_ID = '66666666-6666-4666-8666-666666666666';
const IT_ADMIN_ID = '77777777-7777-4777-8777-777777777777';
const FINANCE_ID = '88888888-8888-4888-8888-888888888888';
const NOW = new Date('2026-11-25T03:00:00.000Z');

interface MoneyWire {
  amount: string;
  currency: string;
}

interface PurchaseInvoiceDetailBody {
  success: boolean;
  data: {
    id: string;
    state: string;
    flags: string[];
    poolExpected: MoneyWire | null;
    poolVariance: MoneyWire | null;
    invoiceId: string | null;
  };
  error: { code: string };
}

interface DiscrepancyDetailBody {
  success: boolean;
  data: {
    id: string;
    state: string;
    mismatches: string[];
    outcome: string | null;
    closure: null | {
      outcome: string;
      reason: string;
      differenceAmount: MoneyWire;
    };
  };
  error: { code: string };
}

function makePurchaseRow(over: Partial<PurchaseInvoiceRow> = {}): PurchaseInvoiceRow {
  return {
    id: PI_ID,
    organizationId: ORG_ID,
    state: 'CONFIRMED',
    label: 'PERIOD',
    serviceMonth: new Date('2026-11-01'),
    periodIndex: null,
    periodCount: null,
    matchResult: 'MATCHED',
    flags: [],
    linkKind: 'SUBSCRIPTION',
    requestId: null,
    subscriptionId: SUB_ID,
    vendorId: VENDOR_ID,
    number: 'INV-K2-01',
    issuedOn: new Date('2026-11-05'),
    quantity: 10,
    netMinor: 12_360_000n,
    paymentSource: 'COMPANY_CARD',
    submittedByEmployeeId: IT_ADMIN_ID,
    submittedAt: NOW,
    decidedByEmployeeId: FINANCE_ID,
    decidedAt: NOW,
    returnReason: null,
    resubmissionOfId: null,
    provisioningTaskId: null,
    unitPriceOriginalMinor: 1500n,
    unitPriceOriginalCurrency: 'USD',
    deductibleTaxMinor: 0n,
    nonDeductibleTaxMinor: 0n,
    chargedCostCenterId: null,
    unallocatedReason: null,
    invoiceId: INVOICE_ID,
    expectedQuantity: 10,
    expectedUnitPriceOriginalMinor: 1500n,
    expectedUnitPriceOriginalCurrency: 'USD',
    ...over,
  };
}

function makeCaseRow(over: Partial<InvoiceDiscrepancyRow> = {}): InvoiceDiscrepancyRow {
  return {
    id: CASE_ID,
    organizationId: ORG_ID,
    purchaseInvoiceId: PI_ID,
    state: 'CLOSED',
    mismatches: ['QUANTITY', 'UNIT_PRICE', 'EXPECTED_AMOUNT'],
    outcome: 'EXCHANGE_RATE_LINE_PRICE_UPDATED',
    reason: 'Vendor updated FX and per-seat price',
    differenceMinor: 0n,
    closedByEmployeeId: FINANCE_ID,
    closedAt: NOW,
    openedAt: NOW,
    purchaseInvoice: {
      id: PI_ID,
      vendorId: VENDOR_ID,
      number: 'INV-K2-01',
      serviceMonth: new Date('2026-11-01'),
      linkKind: 'SUBSCRIPTION',
      requestId: null,
      subscriptionId: SUB_ID,
      quantity: 12,
      unitPriceOriginalMinor: 1600n,
      unitPriceOriginalCurrency: 'USD',
      expectedQuantity: 10,
      expectedUnitPriceOriginalMinor: 1500n,
      expectedUnitPriceOriginalCurrency: 'USD',
      netMinor: 12_360_000n,
    },
    ...over,
  };
}

describe('purchase invoice confirmation & pool variance (http contract, no database)', () => {
  let app: INestApplication<App>;
  const confirm = jest.fn();
  const giveBack = jest.fn();
  const closeCase = jest.fn();
  const readableInvoice = jest.fn();
  const documentsOf = jest.fn();
  const resubmittedAs = jest.fn();
  const purchaseInvoiceInfo = jest.fn();
  const readableCase = jest.fn();
  const findCurrency = jest.fn();
  const getItAdminScope = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: PurchaseInvoiceConfirmationService, useValue: { confirm, giveBack } },
        { token: InvoiceDiscrepancyClosureService, useValue: { close: closeCase } },
        { token: PurchaseInvoiceRepo, useValue: { readableBy: readableInvoice, documentsOf, resubmittedAs } },
        { token: InvoiceDiscrepancyRepo, useValue: { readableBy: readableCase } },
        { token: BudgetsApi, useValue: { purchaseInvoiceInfo } },
        { token: FinanceApi, useValue: { findCurrency } },
        { token: OrganizationReadApi, useValue: { getItAdminScope } },
        { token: IdentityAccessApi, useValue: { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue([]) } },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    documentsOf.mockResolvedValue(new Map());
    resubmittedAs.mockResolvedValue(new Map());
    findCurrency.mockImplementation((code: string) => Promise.resolve({ code, minorUnit: code === 'VND' ? 0 : 2 }));
    getItAdminScope.mockResolvedValue([]);
    confirm.mockResolvedValue(makePurchaseRow());
    purchaseInvoiceInfo.mockResolvedValue({
      subscriptionId: SUB_ID,
      poolFigures: {
        expectedMinor: 12_000_000n,
        varianceMinor: 360_000n,
        varianceMonth: '2026-11-01',
        inReview: false,
      },
    });
    readableInvoice.mockResolvedValue(makePurchaseRow());
    closeCase.mockResolvedValue(makeCaseRow());
    readableCase.mockResolvedValue(makeCaseRow());
  });

  it('POST /purchase-invoices/:id/confirmation requires FINANCE role and returns poolExpected & poolVariance', async () => {
    await request(app.getHttpServer()).post(`/api/v1/purchase-invoices/${PI_ID}/confirmation`).expect(401);

    const forbidden = await request(app.getHttpServer())
      .post(`/api/v1/purchase-invoices/${PI_ID}/confirmation`)
      .set('Authorization', bearer(principal(['IT_ADMIN'], { employeeId: IT_ADMIN_ID })))
      .expect(403);
    expect((forbidden.body as PurchaseInvoiceDetailBody).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    expect(confirm).not.toHaveBeenCalled();

    const ok = await request(app.getHttpServer())
      .post(`/api/v1/purchase-invoices/${PI_ID}/confirmation`)
      .set('Authorization', bearer(principal(['FINANCE'], { employeeId: FINANCE_ID })))
      .expect(201);
    const body = ok.body as PurchaseInvoiceDetailBody;
    expect(body.success).toBe(true);
    expect(body.data.poolExpected).toEqual({ amount: '12000000', currency: 'VND' });
    expect(body.data.poolVariance).toEqual({ amount: '360000', currency: 'VND' });
    expect(body.data.flags).toEqual([]);
  });

  it('serializes NO_EXPECTED_AMOUNT, null poolExpected with non-null poolVariance, and 3 flags max on GET', async () => {
    readableInvoice.mockResolvedValueOnce(
      makePurchaseRow({
        flags: ['OVER_APPROVED', 'OUTSIDE_TERM'],
        nonDeductibleTaxMinor: 100_000n,
      }),
    );
    purchaseInvoiceInfo.mockResolvedValueOnce({
      subscriptionId: SUB_ID,
      poolFigures: {
        expectedMinor: null,
        varianceMinor: 12_460_000n,
        varianceMonth: '2026-11-01',
        inReview: false,
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/purchase-invoices/${PI_ID}`)
      .set('Authorization', bearer(principal(['FINANCE'], { employeeId: FINANCE_ID })))
      .expect(200);
    const body = response.body as PurchaseInvoiceDetailBody;
    expect(body.data.poolExpected).toBeNull();
    expect(body.data.poolVariance).toEqual({ amount: '12460000', currency: 'VND' });
    expect(body.data.flags).toEqual(['OVER_APPROVED', 'OUTSIDE_TERM', 'NO_EXPECTED_AMOUNT']);
  });

  it('serializes null poolExpected & poolVariance when K1/K4 poolFigures is null', async () => {
    purchaseInvoiceInfo.mockResolvedValueOnce({ subscriptionId: SUB_ID, poolFigures: null });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/purchase-invoices/${PI_ID}`)
      .set('Authorization', bearer(principal(['FINANCE'], { employeeId: FINANCE_ID })))
      .expect(200);
    const body = response.body as PurchaseInvoiceDetailBody;
    expect(body.data.poolExpected).toBeNull();
    expect(body.data.poolVariance).toBeNull();
  });

  it('POST /invoice-discrepancies/:id/closure accepts EXCHANGE_RATE_LINE_PRICE_UPDATED with 0 difference and 3 mismatches', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/invoice-discrepancies/${CASE_ID}/closure`)
      .set('Authorization', bearer(principal(['FINANCE'], { employeeId: FINANCE_ID })))
      .send({
        outcome: 'EXCHANGE_RATE_LINE_PRICE_UPDATED',
        reason: 'Vendor adjusted list price and exchange rate',
        differenceAmount: { amount: '0' },
      })
      .expect(201);

    const body = response.body as DiscrepancyDetailBody;
    expect(body.data.mismatches).toEqual(['QUANTITY', 'UNIT_PRICE', 'EXPECTED_AMOUNT']);
    expect(body.data.outcome).toBe('EXCHANGE_RATE_LINE_PRICE_UPDATED');
    expect(body.data.closure).toMatchObject({
      outcome: 'EXCHANGE_RATE_LINE_PRICE_UPDATED',
      reason: 'Vendor updated FX and per-seat price',
      differenceAmount: { amount: '0', currency: 'VND' },
      closedBy: { employeeId: FINANCE_ID },
      closedAt: NOW.toISOString(),
    });
  });

  it('POST /invoice-discrepancies/:id/closure validates outcome and non-negative difference', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/invoice-discrepancies/${CASE_ID}/closure`)
      .set('Authorization', bearer(principal(['FINANCE'], { employeeId: FINANCE_ID })))
      .send({
        outcome: 'INVALID_OUTCOME',
        reason: 'Test',
        differenceAmount: { amount: '0' },
      })
      .expect(422);

    await request(app.getHttpServer())
      .post(`/api/v1/invoice-discrepancies/${CASE_ID}/closure`)
      .set('Authorization', bearer(principal(['FINANCE'], { employeeId: FINANCE_ID })))
      .send({
        outcome: 'EXCHANGE_RATE_LINE_PRICE_UPDATED',
        reason: '   ',
        differenceAmount: { amount: '0' },
      })
      .expect(422);
    expect(closeCase).not.toHaveBeenCalled();

    expect(typeof PurchaseInvoiceQueryService).toBe('function');
    expect(typeof InvoiceDiscrepancyQueryService).toBe('function');
  });
});
