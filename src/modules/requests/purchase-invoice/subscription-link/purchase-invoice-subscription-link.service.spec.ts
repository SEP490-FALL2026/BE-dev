import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { PurchaseInvoiceRefusedError } from '../purchase-invoice.errors';
import { PurchaseInvoiceSubscriptionLinkService } from './purchase-invoice-subscription-link.service';

const tx = {} as DbTx;

/** Who answers for an invoice by its link (`QĐ-118d`, `QĐ-118f`, Owner 28/11/2026). */
describe('PurchaseInvoiceSubscriptionLinkService', () => {
  const build = (over: { responsible?: string | null; lot?: Record<string, unknown> | null } = {}) => {
    const invoicedLinesForMonth = jest
      .fn()
      .mockResolvedValue({ wholePeriodInvoiced: false, lineIds: new Set(['line-1']) });
    const service = new PurchaseInvoiceSubscriptionLinkService(
      { invoicedLinesForMonth } as never,
      {
        getPlanVendorId: jest.fn().mockResolvedValue('vendor-1'),
        getSubscriptionResponsibleItAdmin: jest.fn().mockResolvedValue(over.responsible ?? null),
      } as never,
      {
        lockPeriod: jest.fn().mockResolvedValue(null),
        getPurchaseFacts: jest.fn().mockResolvedValue([{ subscriptionId: 'sub-1', planId: 'plan-1' }]),
        linesOfSubscription: jest
          .fn()
          .mockResolvedValue([
            { id: 'line-1', subscriptionId: 'sub-1', monthlyUnitPriceMinor: 500_000n, closedReason: null },
          ]),
        findLot: jest.fn().mockResolvedValue(over.lot ?? null),
      } as never,
      {} as never,
      { findUsableItAdminEmployeeIds: jest.fn() } as never,
    );

    return { service, invoicedLinesForMonth };
  };

  describe('factsOf: the invoice of a subscription is the work of the IT Admin who answers for it', () => {
    const forms = {
      period: { seatPurchaseId: null, lines: [] as string[] },
      'seat purchase': { seatPurchaseId: 'sp-1', lines: [] as string[] },
      'chosen lines': { seatPurchaseId: null, lines: ['line-1'] },
    };

    it.each(Object.entries(forms))(
      'refuses another IT Admin for a %s invoice with NOT_RESPONSIBLE, before reading anything of the lines',
      async (_name, form) => {
        const { service, invoicedLinesForMonth } = build({ responsible: 'it-2' });

        await expect(
          service.factsOf('sub-1', 'it-1', '2026-11-01', form.seatPurchaseId, form.lines, tx),
        ).rejects.toMatchObject({ constructor: PurchaseInvoiceRefusedError, reason: 'NOT_RESPONSIBLE' });
        expect(invoicedLinesForMonth).not.toHaveBeenCalled();
      },
    );

    it('refuses everyone when the subscription names no IT Admin', async () => {
      await expect(
        build({ responsible: null }).service.factsOf('sub-1', 'it-1', '2026-11-01', null, [], tx),
      ).rejects.toMatchObject({
        reason: 'NOT_RESPONSIBLE',
      });
    });

    it('rejects the lines chosen when any of them is already invoiced for that service month, for the IT Admin who answers', async () => {
      await expect(
        build({ responsible: 'it-1' }).service.factsOf('sub-1', 'it-1', '2026-11-01', null, ['line-1'], tx),
      ).rejects.toMatchObject({ reason: 'LINE_ALREADY_INVOICED' });
    });
    it('lets the IT Admin who answers for the subscription past the check (the next refusal is the one of the lines)', async () => {
      await expect(
        build({ responsible: 'it-1' }).service.factsOf('sub-1', 'it-1', '2026-11-01', null, [], tx),
      ).rejects.toMatchObject({ reason: 'LINE_ALREADY_INVOICED' });
    });
  });

  describe('requireToResubmit: who may submit a returned invoice again, judged before its state', () => {
    const subscription = {
      linkKind: 'SUBSCRIPTION',
      submittedByEmployeeId: 'it-1',
      subscriptionId: 'sub-1',
      licenseLotId: null,
    };
    const lot = { linkKind: 'LICENSE_LOT', submittedByEmployeeId: 'it-1', subscriptionId: null, licenseLotId: 'lot-1' };
    const request = { linkKind: 'REQUEST', submittedByEmployeeId: 'it-1', subscriptionId: null, licenseLotId: null };

    it('lets the IT Admin who answers now submit again an invoice of a subscription they did not submit', async () => {
      await expect(
        build({ responsible: 'it-2' }).service.requireToResubmit(subscription, 'it-2', tx),
      ).resolves.toBeUndefined();
    });

    it('refuses the one who submitted it once someone else answers, and a third IT Admin, with NOT_RESPONSIBLE', async () => {
      const { service } = build({ responsible: 'it-2' });

      for (const actor of ['it-1', 'it-3']) {
        await expect(service.requireToResubmit(subscription, actor, tx)).rejects.toMatchObject({
          reason: 'NOT_RESPONSIBLE',
        });
      }
    });

    it('does the same for a lot that is not for a request, whoever submitted it', async () => {
      const { service } = build({ lot: { purpose: 'STOCK', responsibleItAdminEmployeeId: 'it-2' } });

      await expect(service.requireToResubmit(lot, 'it-2', tx)).resolves.toBeUndefined();
      await expect(service.requireToResubmit(lot, 'it-1', tx)).rejects.toMatchObject({ reason: 'NOT_RESPONSIBLE' });
      await expect(service.requireToResubmit(lot, 'it-3', tx)).rejects.toMatchObject({ reason: 'NOT_RESPONSIBLE' });
    });

    it('keeps the invoice of a request, and of the lot bought for it, with the one who submitted it: NOT_FOUND for anyone else', async () => {
      const { service } = build({ lot: { purpose: 'REQUEST', responsibleItAdminEmployeeId: 'it-9' } });

      await expect(service.requireToResubmit(request, 'it-1', tx)).resolves.toBeUndefined();
      await expect(service.requireToResubmit(request, 'it-2', tx)).rejects.toMatchObject({ reason: 'NOT_FOUND' });
      await expect(service.requireToResubmit(lot, 'it-1', tx)).resolves.toBeUndefined();
      await expect(service.requireToResubmit(lot, 'it-9', tx)).rejects.toMatchObject({ reason: 'NOT_FOUND' });
    });
  });

  describe('recipientOf: who is told what became of the invoice', () => {
    const subscription = {
      linkKind: 'SUBSCRIPTION',
      submittedByEmployeeId: 'it-1',
      subscriptionId: 'sub-1',
      licenseLotId: null,
    };

    it('tells the IT Admin who answers for the subscription now, and the one who submitted it when none is named', async () => {
      expect(await build({ responsible: 'it-2' }).service.recipientOf(subscription, tx)).toBe('it-2');
      expect(await build({ responsible: null }).service.recipientOf(subscription, tx)).toBe('it-1');
    });

    it('tells the IT Admin who answers for a lot that is not for a request, and the one who submitted the invoice of a request', async () => {
      const lotRow = {
        linkKind: 'LICENSE_LOT',
        submittedByEmployeeId: 'it-1',
        subscriptionId: null,
        licenseLotId: 'lot-1',
      };
      const stock = build({ lot: { purpose: 'STOCK', responsibleItAdminEmployeeId: 'it-2' } }).service;
      const forRequest = build({ lot: { purpose: 'REQUEST', responsibleItAdminEmployeeId: 'it-2' } }).service;

      expect(await stock.recipientOf(lotRow, tx)).toBe('it-2');
      expect(await forRequest.recipientOf(lotRow, tx)).toBe('it-1');
      expect(
        await forRequest.recipientOf(
          { linkKind: 'REQUEST', submittedByEmployeeId: 'it-1', subscriptionId: null, licenseLotId: null },
          tx,
        ),
      ).toBe('it-1');
    });
  });
});
