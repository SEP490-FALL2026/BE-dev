import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { SeatPurchaseRecord } from '../../catalog/public/seat-ledger.api';
import type { SeatLedgerApi } from '../../catalog/public/seat-ledger.api';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import { SeatPurchaseInvoiceDueService } from './seat-purchase-invoice-due.service';

const makePurchase = (over: Partial<SeatPurchaseRecord> = {}): SeatPurchaseRecord => ({
  id: 'purchase-1',
  organizationId: 'org-1',
  subscriptionLineId: 'line-1',
  code: 'MUA-000001',
  kind: 'TOP_UP',
  purchasedOn: '2026-11-21',
  quantity: 2,
  invoiceObligation: 'WORKING_DAYS',
  invoiceDueOn: '2026-11-27',
  recordedByEmployeeId: 'emp-rec',
  recordedAt: new Date('2026-11-21T08:00:00.000Z'),
  ...over,
});

describe('SeatPurchaseInvoiceDueService (W3-18)', () => {
  function build(
    options: {
      awaiting?: SeatPurchaseRecord[];
      responsible?: string | null;
      usableItAdmins?: string[];
      superAdmin?: string | null;
    } = {},
  ) {
    const seatLedger = {
      listAwaitingInvoicePurchases: jest.fn().mockResolvedValue(options.awaiting ?? [makePurchase()]),
      findLinePeriodIds: jest.fn().mockResolvedValue(new Map([['line-1', 'sub-1']])),
    } as unknown as SeatLedgerApi;
    const periods = {
      getPeriods: jest.fn().mockResolvedValue([
        {
          subscriptionId: 'sub-1',
          responsibleItAdminEmployeeId: options.responsible === undefined ? 'emp-resp' : options.responsible,
        },
      ]),
    } as unknown as SubscriptionPeriodApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest
        .fn()
        .mockResolvedValue(new Set(options.usableItAdmins ?? ['emp-rec', 'emp-resp'])),
      findUsableSuperAdminEmployeeId: jest.fn().mockResolvedValue(options.superAdmin ?? 'sa-1'),
    } as unknown as IdentityAccessApi;
    const notifyInApp = jest.fn().mockResolvedValue(true);
    const notifications = { notifyInApp } as unknown as NotificationsApi;

    const tx = {} as DbTx;
    const runner = {
      run: jest.fn((fn: (dbTx: DbTx) => Promise<unknown>) => fn(tx)),
    } as unknown as TransactionRunner;

    return {
      tx,
      seatLedger,
      notifyInApp,
      service: new SeatPurchaseInvoiceDueService(runner, seatLedger, periods, identity, notifications),
    };
  }

  it('does NOT notify on boundary day invoiceDueOn === today (2026-11-27)', async () => {
    const { service, notifyInApp } = build();

    const result = await service.remindOverdue('org-1', '2026-11-27');

    expect(result).toEqual({ told: 0, failed: 0 });
    expect(notifyInApp).not.toHaveBeenCalled();
  });

  it('notifies recorder and R1 IT Admin once each (deduplicated) when invoiceDueOn < today (2026-11-28)', async () => {
    const { service, notifyInApp, tx } = build();

    const result = await service.remindOverdue('org-1', '2026-11-28');

    expect(result).toEqual({ told: 2, failed: 0 });
    expect(notifyInApp).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'emp-rec',
      code: 'SEAT_PURCHASE_INVOICE_OVERDUE',
      subject: { type: 'SEAT_PURCHASE', id: 'purchase-1' },
      params: { seatPurchaseId: 'purchase-1', subscriptionId: 'sub-1', dueOn: '2026-11-27' },
      eventKey: 'SEAT_PURCHASE_INVOICE_OVERDUE:purchase-1',
    });
    expect(notifyInApp).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipientEmployeeId: 'emp-resp',
        code: 'SEAT_PURCHASE_INVOICE_OVERDUE',
        eventKey: 'SEAT_PURCHASE_INVOICE_OVERDUE:purchase-1',
      }),
    );
  });

  it('deduplicates when recorder is also responsible IT admin, and falls back to Super Admin when responsible is unusable', async () => {
    const { service, notifyInApp, tx } = build({
      responsible: 'emp-left',
      usableItAdmins: ['emp-rec'],
      superAdmin: 'sa-1',
    });

    const result = await service.remindOverdue('org-1', '2026-11-28');

    expect(result).toEqual({ told: 2, failed: 0 });
    expect(notifyInApp).toHaveBeenCalledWith(tx, expect.objectContaining({ recipientEmployeeId: 'emp-rec' }));
    expect(notifyInApp).toHaveBeenCalledWith(tx, expect.objectContaining({ recipientEmployeeId: 'sa-1' }));
  });
});
