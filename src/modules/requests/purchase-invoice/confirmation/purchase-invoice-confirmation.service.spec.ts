import type { DbTx, TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { BudgetsApi } from '../../../budgets/public/budgets.api';
import type { PurchaseInvoiceRecordInput } from '../../../budgets/public/budgets.types';
import type { NotificationsApi } from '../../../notifications/public/notifications.api';
import type { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import type { LicensingApi } from '../../../licensing/public/licensing.api';
import type { InvoiceDiscrepancyOpeningService } from '../../invoice-discrepancy/invoice-discrepancy-opening.service';
import type { PurchaseInvoicePlanService } from '../purchase-invoice-plan.service';
import { PurchaseInvoiceRefusedError } from '../purchase-invoice.errors';
import type { PurchaseInvoiceRepo, PurchaseInvoiceRow } from '../purchase-invoice.repo';
import { ConfirmationSettlementService } from './confirmation-settlement.service';
import { PurchaseInvoiceConfirmationService } from './purchase-invoice-confirmation.service';

const TX = {} as DbTx;
const ACTOR = {
  subject: 'u-fin',
  appUserId: 'u-fin',
  sessionId: 'sess-1',
  employeeId: 'emp-fin',
  directRoles: ['FINANCE'],
  roles: ['FINANCE'],
} as unknown as AuthenticatedPrincipal;

function makeRow(over: Partial<PurchaseInvoiceRow> = {}): PurchaseInvoiceRow {
  return {
    id: 'pi-1',
    organizationId: 'org-1',
    linkKind: 'SUBSCRIPTION',
    requestId: null,
    provisioningTaskId: null,
    subscriptionId: 'sub-1',
    vendorId: 'vendor-1',
    number: 'INV-001',
    issuedOn: new Date('2027-07-02T00:00:00.000Z'),
    serviceMonth: new Date('2027-07-01T00:00:00.000Z'),
    label: 'RENEWAL',
    periodIndex: null,
    periodCount: null,
    quantity: 11,
    unitPriceOriginalMinor: 500_000n,
    unitPriceOriginalCurrency: 'VND',
    netMinor: 68_000_000n,
    deductibleTaxMinor: 0n,
    nonDeductibleTaxMinor: 0n,
    matchResult: 'MATCHED',
    paymentSource: 'COMPANY_CARD',
    flags: [],
    chargedCostCenterId: null,
    unallocatedReason: null,
    state: 'SUBMITTED',
    submittedByEmployeeId: 'emp-it',
    submittedAt: new Date('2027-07-02T01:00:00.000Z'),
    decidedByEmployeeId: null,
    decidedAt: null,
    returnReason: null,
    resubmissionOfId: null,
    invoiceId: null,
    expectedQuantity: 11,
    expectedUnitPriceOriginalMinor: 500_000n,
    expectedUnitPriceOriginalCurrency: 'VND',
    seatPurchaseId: null,
    subscriptionLineIds: [],
    licenseLotId: null,
    ...over,
  };
}

function build(
  opts: {
    row?: PurchaseInvoiceRow | null;
    poolFacts?: unknown;
    threshold?: number;
  } = {},
) {
  const row = opts.row === undefined ? makeRow() : opts.row;
  const confirmedRow = row ? { ...row, state: 'CONFIRMED' as const, invoiceId: 'inv-1' } : null;
  const lock = jest.fn().mockResolvedValue(row);
  const find = jest.fn().mockResolvedValue(confirmedRow);
  const markConfirmed = jest.fn().mockResolvedValue(true);
  const isBeneficiary = jest.fn().mockResolvedValue(false);
  const recordPurchaseInvoice = jest.fn().mockResolvedValue({
    invoiceId: 'inv-1',
    booking: 'SUBSCRIPTION',
    commitmentId: null,
    costCenterId: null,
    subscriptionId: 'sub-1',
    actualCostMinor: row ? row.netMinor + row.nonDeductibleTaxMinor : 0n,
    appliedMinor: 0n,
    matchResult: row?.matchResult === 'PRICE_QUANTITY_EXCEPTION' ? 'PRICE_QUANTITY_EXCEPTION' : 'MATCHED',
  });
  const openDiscrepancy = jest.fn().mockResolvedValue('case-1');
  const poolExpectationFactsOf = jest.fn().mockResolvedValue(
    opts.poolFacts ?? {
      isK2: true,
      poolSubscriptionId: 'sub-1',
      timeZone: 'Asia/Ho_Chi_Minh',
      source: {
        kind: 'SUBSCRIPTION',
        billingCycle: 'ANNUAL',
        purchasedQuantity: 11,
        monthlyPriceMinor: 500_000n,
      },
    },
  );
  const getValue = jest.fn().mockResolvedValue(opts.threshold ?? 5);
  const recordRealisedSaving = jest.fn().mockResolvedValue({ recorded: false });
  const runner = {
    run: jest.fn((work: (tx: DbTx) => Promise<unknown>) => work(TX)),
  } as unknown as TransactionRunner;
  const settlement = new ConfirmationSettlementService(
    { open: openDiscrepancy } as unknown as InvoiceDiscrepancyOpeningService,
    { recordRealisedSaving } as unknown as LicensingApi,
  );

  const service = new PurchaseInvoiceConfirmationService(
    runner,
    { lock, find, markConfirmed, isBeneficiary, requestFacts: jest.fn() } as unknown as PurchaseInvoiceRepo,
    { recordPurchaseInvoice } as unknown as BudgetsApi,
    { notifyInApp: jest.fn().mockResolvedValue(true) } as unknown as NotificationsApi,
    { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
    settlement,
    { poolExpectationFactsOf, poolSubscriptionOfRequest: jest.fn() } as unknown as PurchaseInvoicePlanService,
    { getValue } as unknown as OperatingParametersApi,
  );

  return { service, recordPurchaseInvoice, openDiscrepancy, recordRealisedSaving, getValue, poolExpectationFactsOf };
}

describe('PurchaseInvoiceConfirmationService (W3-05)', () => {
  it('merges PRICE_QUANTITY_EXCEPTION mismatches and EXPECTED_AMOUNT into a single discrepancy case without duplicates', async () => {
    const row = makeRow({
      quantity: 12,
      netMinor: 69_500_000n,
      matchResult: 'PRICE_QUANTITY_EXCEPTION',
      expectedQuantity: 11,
    });
    const { service, recordPurchaseInvoice, openDiscrepancy } = build({ row });

    await service.confirm(ACTOR, 'pi-1');

    const recorded = (recordPurchaseInvoice.mock.calls[0] as [unknown, unknown, PurchaseInvoiceRecordInput])[2];
    expect(recorded.poolFigures).toEqual({
      expectedMinor: 66_000_000n,
      varianceMinor: 3_500_000n,
      varianceMonth: '2026-11-01',
      inReview: true,
    });
    expect(openDiscrepancy).toHaveBeenCalledTimes(1);
    expect(openDiscrepancy).toHaveBeenCalledWith(
      TX,
      ACTOR,
      expect.objectContaining({
        purchaseInvoiceId: 'pi-1',
        mismatches: ['QUANTITY', 'EXPECTED_AMOUNT'],
      }),
    );
  });

  it('opens EXPECTED_AMOUNT case when quantity/price match but net exceeds K2 threshold', async () => {
    const row = makeRow({
      netMinor: 69_500_000n,
      nonDeductibleTaxMinor: 0n,
      matchResult: 'MATCHED',
    });
    const { service, recordPurchaseInvoice, openDiscrepancy } = build({ row });

    await service.confirm(ACTOR, 'pi-1');

    const recorded = (recordPurchaseInvoice.mock.calls[0] as [unknown, unknown, PurchaseInvoiceRecordInput])[2];
    expect(recorded.poolFigures).toEqual({
      expectedMinor: 66_000_000n,
      varianceMinor: 3_500_000n,
      varianceMonth: '2026-11-01',
      inReview: true,
    });
    expect(openDiscrepancy).toHaveBeenCalledWith(
      TX,
      ACTOR,
      expect.objectContaining({
        mismatches: ['EXPECTED_AMOUNT'],
      }),
    );
  });

  it('records poolFigures with inReview=false and opens no case when within threshold (including non-deductible tax)', async () => {
    const row = makeRow({
      netMinor: 60_000_000n,
      nonDeductibleTaxMinor: 6_000_000n,
    });
    const { service, recordPurchaseInvoice, openDiscrepancy } = build({
      row,
      poolFacts: {
        isK2: true,
        poolSubscriptionId: 'sub-1',
        timeZone: 'Asia/Ho_Chi_Minh',
        source: {
          kind: 'SUBSCRIPTION',
          billingCycle: 'ANNUAL',
          purchasedQuantity: 2,
          monthlyPriceMinor: 2_500_000n,
        },
      },
    });

    await service.confirm(ACTOR, 'pi-1');

    const recorded = (recordPurchaseInvoice.mock.calls[0] as [unknown, unknown, PurchaseInvoiceRecordInput])[2];
    expect(recorded.poolFigures).toEqual({
      expectedMinor: 60_000_000n,
      varianceMinor: 6_000_000n,
      varianceMonth: '2026-11-01',
      inReview: false,
    });
    expect(openDiscrepancy).not.toHaveBeenCalled();
  });

  it('records expectedMinor=null, variance=actual, inReview=false and opens no case when expectation is missing', async () => {
    const row = makeRow({ netMinor: 10_000_000n, nonDeductibleTaxMinor: 0n });
    const { service, recordPurchaseInvoice, openDiscrepancy } = build({
      row,
      poolFacts: {
        isK2: true,
        poolSubscriptionId: 'sub-1',
        timeZone: 'Asia/Ho_Chi_Minh',
        source: {
          kind: 'SUBSCRIPTION',
          billingCycle: 'ANNUAL',
          purchasedQuantity: 11,
          monthlyPriceMinor: null,
        },
      },
    });

    await service.confirm(ACTOR, 'pi-1');

    const recorded = (recordPurchaseInvoice.mock.calls[0] as [unknown, unknown, PurchaseInvoiceRecordInput])[2];
    expect(recorded.poolFigures).toEqual({
      expectedMinor: null,
      varianceMinor: 10_000_000n,
      varianceMonth: '2026-11-01',
      inReview: false,
    });
    expect(openDiscrepancy).not.toHaveBeenCalled();
  });

  it('passes poolFigures=null for K1/K4 invoices and does not open EXPECTED_AMOUNT case', async () => {
    const row = makeRow({ linkKind: 'REQUEST', requestId: 'req-1', subscriptionId: null, netMinor: 10_000_000n });
    const { service, recordPurchaseInvoice, openDiscrepancy, getValue } = build({
      row,
      poolFacts: { isK2: false },
    });

    await service.confirm(ACTOR, 'pi-1');

    expect(getValue).not.toHaveBeenCalled();
    expect(recordPurchaseInvoice).toHaveBeenCalledWith(
      TX,
      ACTOR,
      expect.objectContaining({
        poolFigures: null,
      }),
    );
    expect(openDiscrepancy).not.toHaveBeenCalled();
  });

  it('uses Finance threshold parameter (e.g. 3%) when evaluating pool variance', async () => {
    const row = makeRow({ netMinor: 68_000_000n });
    const { service, openDiscrepancy, getValue } = build({ row, threshold: 3 });

    await service.confirm(ACTOR, 'pi-1');

    expect(getValue).toHaveBeenCalledWith('K2_INVOICE_VARIANCE_THRESHOLD_PERCENT', TX);
    expect(openDiscrepancy).toHaveBeenCalledWith(
      TX,
      ACTOR,
      expect.objectContaining({ mismatches: ['EXPECTED_AMOUNT'] }),
    );
  });

  it('refuses SAME_PERSON before recording anything', async () => {
    const row = makeRow({ submittedByEmployeeId: ACTOR.employeeId });
    const { service, recordPurchaseInvoice } = build({ row });

    await expect(service.confirm(ACTOR, 'pi-1')).rejects.toEqual(new PurchaseInvoiceRefusedError('SAME_PERSON'));
    expect(recordPurchaseInvoice).not.toHaveBeenCalled();
  });

  it('W3-09: records realised saving when SUBSCRIPTION RENEWAL/PERIOD invoice confirms cleanly without SBF-11a', async () => {
    const row = makeRow({ linkKind: 'SUBSCRIPTION', subscriptionId: 'sub-1', label: 'RENEWAL', netMinor: 66_000_000n });
    const { service, recordRealisedSaving, openDiscrepancy } = build({ row });

    await service.confirm(ACTOR, 'pi-1');

    expect(openDiscrepancy).not.toHaveBeenCalled();
    expect(recordRealisedSaving).toHaveBeenCalledTimes(1);
    const [callTx, callInput] = recordRealisedSaving.mock.calls[0] as [DbTx, Record<string, unknown>];
    expect(callTx).toBe(TX);
    expect(callInput).toMatchObject({
      newPeriodId: 'sub-1',
      invoiceId: 'inv-1',
      serviceMonth: '2027-07-01',
    });
    expect(callInput.now).toBeInstanceOf(Date);

    const periodRow = makeRow({
      linkKind: 'SUBSCRIPTION',
      subscriptionId: 'sub-2',
      label: 'PERIOD',
      netMinor: 66_000_000n,
    });
    const periodRun = build({ row: periodRow });
    await periodRun.service.confirm(ACTOR, 'pi-1');
    expect(periodRun.recordRealisedSaving).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ newPeriodId: 'sub-2', invoiceId: 'inv-1', serviceMonth: '2027-07-01' }),
    );
  });

  it('W3-09: defers realised saving when confirm opens an SBF-11a discrepancy case (PRICE_QUANTITY_EXCEPTION or EXPECTED_AMOUNT)', async () => {
    const variance = build({ row: makeRow({ netMinor: 69_500_000n, matchResult: 'MATCHED' }) });
    await variance.service.confirm(ACTOR, 'pi-1');
    expect(variance.openDiscrepancy).toHaveBeenCalledTimes(1);
    expect(variance.recordRealisedSaving).not.toHaveBeenCalled();

    const pq = build({
      row: makeRow({
        netMinor: 66_000_000n,
        matchResult: 'PRICE_QUANTITY_EXCEPTION',
        quantity: 10,
        expectedQuantity: 11,
      }),
    });
    await pq.service.confirm(ACTOR, 'pi-1');
    expect(pq.openDiscrepancy).toHaveBeenCalledTimes(1);
    expect(pq.recordRealisedSaving).not.toHaveBeenCalled();
  });

  it('W3-09: does not trigger realised saving for REQUEST or ADJUSTMENT invoices', async () => {
    const req = build({
      row: makeRow({ linkKind: 'REQUEST', requestId: 'req-1', subscriptionId: null }),
      poolFacts: { isK2: false },
    });
    await req.service.confirm(ACTOR, 'pi-1');
    expect(req.recordRealisedSaving).not.toHaveBeenCalled();

    const adj = build({ row: makeRow({ label: 'NEW_PURCHASE', netMinor: 66_000_000n }) });
    await adj.service.confirm(ACTOR, 'pi-1');
    expect(adj.recordRealisedSaving).not.toHaveBeenCalled();
  });
});
