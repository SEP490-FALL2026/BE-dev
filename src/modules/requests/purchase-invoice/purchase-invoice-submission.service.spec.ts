import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PurchaseInvoiceRefusedError } from './purchase-invoice.errors';
import type { PurchaseInvoiceRepo } from './purchase-invoice.repo';
import { PurchaseInvoicePlanService } from './purchase-invoice-plan.service';
import { PurchaseInvoiceSubmissionService } from './purchase-invoice-submission.service';

const tx = { kind: 'tx' } as unknown as DbTx;
const actor = { employeeId: 'it-1' } as unknown as AuthenticatedPrincipal;

describe('PurchaseInvoiceSubmissionService.resubmit', () => {
  function build(options: { resubmitted: boolean }) {
    const resubmittedAs = jest.fn(() =>
      Promise.resolve(options.resubmitted ? new Map([['inv-1', 'inv-2']]) : new Map()),
    );
    const invoices = {
      lock: jest.fn(() => Promise.resolve({ id: 'inv-1', submittedByEmployeeId: 'it-1', state: 'RETURNED' })),
      resubmittedAs,
    } as unknown as PurchaseInvoiceRepo;
    const runner = {
      run: jest.fn((work: (client: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;
    const service = new PurchaseInvoiceSubmissionService(
      runner,
      {} as never,
      {} as never,
      invoices,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, resubmittedAs };
  }

  it('asks whether the returned invoice was already submitted again through the transaction of the call, not through the pool', async () => {
    const { service, resubmittedAs } = build({ resubmitted: true });

    await expect(service.resubmit(actor, 'inv-1', {} as never)).rejects.toThrow(PurchaseInvoiceRefusedError);

    expect(resubmittedAs).toHaveBeenCalledWith(['inv-1'], tx);
  });

  describe('who may submit a returned invoice again (QĐ-118f, Owner 28/11/2026)', () => {
    const buildWith = (row: Record<string, unknown>, ofResponsible: boolean) => {
      const plan = jest.fn().mockRejectedValue(new PurchaseInvoiceRefusedError('NOT_RESPONSIBLE'));
      const invoices = {
        lock: jest.fn(() => Promise.resolve({ id: 'inv-1', state: 'RETURNED', subscriptionLineIds: [], ...row })),
        resubmittedAs: jest.fn(() => Promise.resolve(new Map())),
      } as unknown as PurchaseInvoiceRepo;
      const runner = {
        run: jest.fn((work: (client: DbTx) => Promise<unknown>) => work(tx)),
      } as unknown as TransactionRunner;
      const plans = { plan, moneyOf: jest.fn() };
      const pool = { isOfResponsibleItAdmin: jest.fn().mockResolvedValue(ofResponsible) };

      return new PurchaseInvoiceSubmissionService(
        runner,
        plans as never,
        pool as never,
        invoices,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    };

    it('does not let another IT Admin submit again an invoice of a request: NOT_FOUND', async () => {
      const service = buildWith({ submittedByEmployeeId: 'it-2', linkKind: 'REQUEST', requestId: 'req-1' }, false);
      await expect(service.resubmit(actor, 'inv-1', {} as never)).rejects.toMatchObject({ reason: 'NOT_FOUND' });
    });

    it('reads a subscription invoice against the one who answers now, not the one who submitted it: the plan decides (NOT_RESPONSIBLE)', async () => {
      const service = buildWith(
        { submittedByEmployeeId: 'it-2', linkKind: 'SUBSCRIPTION', subscriptionId: 'sub-1', seatPurchaseId: null },
        true,
      );
      await expect(service.resubmit(actor, 'inv-1', { documentIds: [] } as never)).rejects.toMatchObject({
        reason: 'NOT_RESPONSIBLE',
      });
    });
  });
});

describe('the invoice of a subscription comes only from the IT Admin who answers for it (QĐ-118d, QĐ-118f, Owner 28/11/2026)', () => {
  const serviceOf = (responsible: string | null) =>
    new PurchaseInvoicePlanService(
      {
        invoicedLinesForMonth: jest.fn().mockResolvedValue({ wholePeriodInvoiced: false, lineIds: new Set(['x']) }),
      } as never,
      {
        getPlanVendorId: jest.fn().mockResolvedValue('vendor-1'),
        getSubscriptionResponsibleItAdmin: jest.fn().mockResolvedValue(responsible),
      } as never,
      {
        lockPeriod: jest.fn().mockResolvedValue(null),
        getPurchaseFacts: jest.fn().mockResolvedValue([{ subscriptionId: 'sub-1', planId: 'plan-1' }]),
      } as never,
      {} as never,
      {} as never,
      { getItAdminActingScope: jest.fn().mockResolvedValue(['dept-1']) } as never,
      { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['it-1'])) } as never,
      {} as never,
    );
  const forms = {
    period: { subscriptionId: 'sub-1' },
    seatPurchase: { subscriptionId: 'sub-1', seatPurchaseId: 'sp-1' },
    lines: { subscriptionId: 'sub-1', subscriptionLineIds: ['line-1'] },
  };

  it.each(Object.entries(forms))(
    'refuses another IT Admin for a %s invoice with NOT_RESPONSIBLE',
    async (_name, link) => {
      await expect(
        serviceOf('it-2').plan(actor, { link, servicePeriodMonth: '2026-11' } as never, tx),
      ).rejects.toMatchObject({
        constructor: PurchaseInvoiceRefusedError,
        reason: 'NOT_RESPONSIBLE',
      });
    },
  );

  it('refuses everyone when the subscription names no IT Admin', async () => {
    await expect(
      serviceOf(null).plan(actor, { link: forms.period, servicePeriodMonth: '2026-11' } as never, tx),
    ).rejects.toMatchObject({ reason: 'NOT_RESPONSIBLE' });
  });

  it('lets the IT Admin who answers for the subscription past the check (the next refusal is the one of the lines)', async () => {
    await expect(
      serviceOf('it-1').plan(actor, { link: forms.period, servicePeriodMonth: '2026-11' } as never, tx),
    ).rejects.toMatchObject({ reason: 'LINE_ALREADY_INVOICED' });
  });
});
