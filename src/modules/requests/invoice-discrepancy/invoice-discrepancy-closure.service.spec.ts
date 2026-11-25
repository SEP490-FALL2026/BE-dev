import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { BudgetsApi } from '../../budgets/public/budgets.api';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { FinanceApi } from '../../finance/public/finance.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InvoiceDiscrepancyReferralListeners } from '../public/requests.extension-points';
import { InvoiceDiscrepancyClosureService } from './invoice-discrepancy-closure.service';
import { InvoiceDiscrepancyNotifierService } from './invoice-discrepancy-notifier.service';
import { InvoiceDiscrepancyRefusedError } from './invoice-discrepancy.errors';
import type { InvoiceDiscrepancyRepo, InvoiceDiscrepancyRow } from './invoice-discrepancy.repo';

const TX = {} as DbTx;
const ACTOR = {
  subject: 'u-fin',
  appUserId: 'u-fin',
  sessionId: 'sess-1',
  employeeId: 'emp-fin',
  directRoles: ['FINANCE'],
  roles: ['FINANCE'],
} as unknown as AuthenticatedPrincipal;

function makeCaseRow(over: Partial<InvoiceDiscrepancyRow> = {}): InvoiceDiscrepancyRow {
  return {
    id: 'case-1',
    organizationId: 'org-1',
    purchaseInvoiceId: 'pi-1',
    mismatches: ['EXPECTED_AMOUNT'],
    state: 'OPEN',
    openedAt: new Date('2027-07-02T01:00:00.000Z'),
    closedByEmployeeId: null,
    closedAt: null,
    outcome: null,
    reason: null,
    differenceMinor: null,
    purchaseInvoice: {
      id: 'pi-1',
      vendorId: 'v-1',
      number: 'INV-1',
      serviceMonth: new Date('2027-07-01T00:00:00.000Z'),
      linkKind: 'SUBSCRIPTION',
      requestId: null,
      subscriptionId: 'sub-1',
      quantity: 11,
      unitPriceOriginalMinor: 500_000n,
      unitPriceOriginalCurrency: 'VND',
      expectedQuantity: 11,
      expectedUnitPriceOriginalMinor: 500_000n,
      expectedUnitPriceOriginalCurrency: 'VND',
      netMinor: 69_500_000n,
    },
    ...over,
  };
}

function build(
  opts: {
    row?: InvoiceDiscrepancyRow;
    responsible?: string | null;
    usableItAdmins?: string[];
    superAdmin?: string | null;
    recordedSubscriptionId?: string | null;
  } = {},
) {
  const row = opts.row ?? makeCaseRow();
  const lock = jest.fn().mockResolvedValue(row);
  const markClosed = jest.fn().mockResolvedValue(true);
  const find = jest.fn().mockResolvedValue({ ...row, state: 'CLOSED' });
  const markPoolVarianceResolved = jest.fn().mockResolvedValue(true);
  const purchaseInvoiceInfo = jest.fn().mockResolvedValue({
    subscriptionId: opts.recordedSubscriptionId ?? row.purchaseInvoice.subscriptionId,
    poolFigures: null,
  });
  const emit = jest.fn().mockResolvedValue(undefined);
  const notifyInApp = jest.fn().mockResolvedValue(true);
  const getPurchaseFacts = jest.fn().mockResolvedValue([
    {
      subscriptionId: opts.recordedSubscriptionId ?? row.purchaseInvoice.subscriptionId ?? 'sub-1',
      responsibleItAdminEmployeeId: opts.responsible === undefined ? 'emp-it-owner' : opts.responsible,
    },
  ]);
  const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(opts.usableItAdmins ?? ['emp-it-owner']));
  const findUsableSuperAdminEmployeeId = jest
    .fn()
    .mockResolvedValue(opts.superAdmin === undefined ? 'emp-sa' : opts.superAdmin);
  const notifier = new InvoiceDiscrepancyNotifierService(
    { getPurchaseFacts } as unknown as SubscriptionPeriodApi,
    { findUsableItAdminEmployeeIds, findUsableSuperAdminEmployeeId } as unknown as IdentityAccessApi,
    { notifyInApp } as unknown as NotificationsApi,
  );
  const runner = {
    run: jest.fn((work: (tx: DbTx) => Promise<unknown>) => work(TX)),
  } as unknown as TransactionRunner;
  const service = new InvoiceDiscrepancyClosureService(
    runner,
    { lock, markClosed, find } as unknown as InvoiceDiscrepancyRepo,
    {
      parseMoney: jest.fn(({ amount }: { amount: string }) => Promise.resolve({ amountMinor: BigInt(amount) })),
    } as unknown as FinanceApi,
    { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
    { emit } as unknown as InvoiceDiscrepancyReferralListeners,
    { markPoolVarianceResolved, purchaseInvoiceInfo } as unknown as BudgetsApi,
    notifier,
  );

  return { service, markClosed, markPoolVarianceResolved, emit, notifyInApp };
}

describe('InvoiceDiscrepancyClosureService (W3-05)', () => {
  it('closes with EXCHANGE_RATE_LINE_PRICE_UPDATED (0 difference), resolves pool variance, skips referral, and notifies R1 IT Admin', async () => {
    const { service, markPoolVarianceResolved, emit, notifyInApp } = build();

    await service.close(ACTOR, 'case-1', {
      outcome: 'EXCHANGE_RATE_LINE_PRICE_UPDATED',
      reason: 'Updated monthly price after FX fluctuation',
      differenceAmount: '0',
    });

    expect(markPoolVarianceResolved).toHaveBeenCalledWith(TX, 'pi-1', expect.any(Date));
    expect(emit).not.toHaveBeenCalled();
    expect(notifyInApp).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        organizationId: 'org-1',
        recipientEmployeeId: 'emp-it-owner',
        code: 'SUBSCRIPTION_PRICE_REVIEW',
        subject: { type: 'SUBSCRIPTION', id: 'sub-1' },
        params: { subscriptionId: 'sub-1', purchaseInvoiceId: 'pi-1' },
        eventKey: 'SUBSCRIPTION_PRICE_REVIEW:pi-1',
      }),
    );
  });

  it('falls back to usable Super Admin when responsible IT Admin is null or unusable (R1)', async () => {
    const { service, notifyInApp } = build({
      responsible: 'emp-left',
      usableItAdmins: [],
      superAdmin: 'emp-sa',
    });

    await service.close(ACTOR, 'case-1', {
      outcome: 'EXCHANGE_RATE_LINE_PRICE_UPDATED',
      reason: 'FX fee updated',
      differenceAmount: '3500000',
    });

    expect(notifyInApp).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        recipientEmployeeId: 'emp-sa',
        code: 'SUBSCRIPTION_PRICE_REVIEW',
      }),
    );
  });

  it('resolves pool subscription from recorded invoice for REQUEST top-up discrepancies', async () => {
    const row = makeCaseRow({
      purchaseInvoice: {
        ...makeCaseRow().purchaseInvoice,
        linkKind: 'REQUEST',
        requestId: 'req-1',
        subscriptionId: null,
      },
    });
    const { service, notifyInApp } = build({ row, recordedSubscriptionId: 'sub-pool-1' });

    await service.close(ACTOR, 'case-1', {
      outcome: 'EXCHANGE_RATE_LINE_PRICE_UPDATED',
      reason: 'FX fee updated',
      differenceAmount: '100000',
    });

    expect(notifyInApp).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        subject: { type: 'SUBSCRIPTION', id: 'sub-pool-1' },
        params: { subscriptionId: 'sub-pool-1', purchaseInvoiceId: 'pi-1' },
      }),
    );
  });

  it('resolves pool variance on EXPLAINED and OUT_OF_PROCESS_SUSPECTED too, without sending SUBSCRIPTION_PRICE_REVIEW', async () => {
    const explained = build();
    await explained.service.close(ACTOR, 'case-1', {
      outcome: 'EXPLAINED',
      reason: 'Vendor surcharge',
      differenceAmount: '500000',
    });
    expect(explained.markPoolVarianceResolved).toHaveBeenCalledWith(TX, 'pi-1', expect.any(Date));
    expect(explained.notifyInApp).not.toHaveBeenCalled();

    const suspected = build();
    await suspected.service.close(ACTOR, 'case-1', {
      outcome: 'OUT_OF_PROCESS_SUSPECTED',
      reason: 'Unexplained charge',
      differenceAmount: '500000',
    });
    expect(suspected.markPoolVarianceResolved).toHaveBeenCalledWith(TX, 'pi-1', expect.any(Date));
    expect(suspected.emit).toHaveBeenCalledTimes(1);
    expect(suspected.notifyInApp).not.toHaveBeenCalled();
  });

  it('refuses negative difference for EXCHANGE_RATE_LINE_PRICE_UPDATED with DIFFERENCE_INVALID', async () => {
    const { service, markClosed } = build();

    await expect(
      service.close(ACTOR, 'case-1', {
        outcome: 'EXCHANGE_RATE_LINE_PRICE_UPDATED',
        reason: 'Bad amount',
        differenceAmount: '-1',
      }),
    ).rejects.toEqual(new InvoiceDiscrepancyRefusedError('DIFFERENCE_INVALID'));
    expect(markClosed).not.toHaveBeenCalled();
  });
});
