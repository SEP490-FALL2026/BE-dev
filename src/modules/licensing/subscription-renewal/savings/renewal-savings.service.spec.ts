import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { SubscriptionPurchaseFacts } from '../../../catalog/public/subscription-period.types';
import type { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type { RenewalSavingsCandidate, RenewalSavingsRepo } from './renewal-savings.repo';
import { RenewalSavingsService } from './renewal-savings.service';

const TX = {} as DbTx;

function candidateOf(over: Partial<RenewalSavingsCandidate> = {}): RenewalSavingsCandidate {
  return {
    id: 'ren-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-old',
    nextSubscriptionId: 'sub-new',
    state: 'OUTCOME_RECORDED',
    outcome: 'AS_DECIDED',
    decidedChoice: 'REDUCE',
    decidedQuantity: 11,
    realisedSavingsMinor: null,
    realisedSavingsCurrency: null,
    realisedSavingsRecordedAt: null,
    realisedSavingsInvoiceId: null,
    ...over,
  };
}

function periodFactsOf(
  subscriptionId: string,
  over: Partial<SubscriptionPurchaseFacts> = {},
): SubscriptionPurchaseFacts {
  return {
    subscriptionId,
    planId: 'plan-1',
    responsibleItAdminEmployeeId: 'emp-it',
    kind: 'TERM',
    status: 'ACTIVE',
    provisioningType: 'K2',
    commitmentTermMonths: 12,
    billingCycle: 'MONTHLY',
    purchasedQuantity: 12,
    monthlyPriceMinor: 500_000n,
    cycleMonths: 1,
    startDate: '2027-07-01',
    endDate: '2028-06-30',
    endExclusive: '2028-07-01',
    renewalDate: '2028-07-01',
    noticeDeadline: '2028-06-01',
    noticePeriodDays: 30,
    autoRenew: true,
    vendorMinimumSeats: null,
    nextPeriodPurchasedQuantity: null,
    ...over,
  };
}

function build(
  opts: {
    candidate?: RenewalSavingsCandidate | null;
    prior?: Partial<SubscriptionPurchaseFacts>;
    next?: Partial<SubscriptionPurchaseFacts>;
    writeResult?: boolean;
  } = {},
) {
  const candidate = opts.candidate === undefined ? candidateOf() : opts.candidate;
  const lockByNextSubscriptionId = jest.fn().mockResolvedValue(candidate);
  const recordRealisedSaving = jest.fn().mockResolvedValue(opts.writeResult ?? true);
  const getPurchaseFacts = jest
    .fn()
    .mockResolvedValue([
      periodFactsOf('sub-old', { startDate: '2026-07-01', purchasedQuantity: 12, ...opts.prior }),
      periodFactsOf('sub-new', { startDate: '2027-07-01', purchasedQuantity: 11, ...opts.next }),
    ]);
  const getSubscriptionPrice = jest.fn().mockResolvedValue({
    kind: 'RECURRING',
    unitPrice: { amountMinor: 500_000n, currency: 'VND' },
    reportingUnitPrice: null,
    monthlyPriceMinor: 500_000n,
    billingCycle: 'MONTHLY',
  });
  const service = new RenewalSavingsService(
    { lockByNextSubscriptionId, recordRealisedSaving } as unknown as RenewalSavingsRepo,
    { endingAmong: jest.fn() } as unknown as SubscriptionRenewalRepo,
    { getPurchaseFacts } as unknown as SubscriptionPeriodApi,
    { getSubscriptionPrice } as unknown as CatalogApi,
  );

  return { service, lockByNextSubscriptionId, recordRealisedSaving, getPurchaseFacts, getSubscriptionPrice };
}

describe('RenewalSavingsService (W3-09)', () => {
  const now = new Date('2027-07-05T10:00:00.000Z');

  it('records full T=12 realised saving once on first invoice month even when billed monthly', async () => {
    const { service, recordRealisedSaving } = build();

    const result = await service.recordRealisedSaving(TX, {
      newPeriodId: 'sub-new',
      invoiceId: 'inv-july',
      serviceMonth: '2027-07-01',
      now,
    });

    expect(result).toEqual({ recorded: true, amountMinor: 6_000_000n, currency: 'VND' });
    expect(recordRealisedSaving).toHaveBeenCalledWith(TX, {
      renewalId: 'ren-1',
      minor: 6_000_000n,
      currency: 'VND',
      recordedAt: now,
      invoiceId: 'inv-july',
    });
  });

  it('does not record on second month invoice (2027-08-01) when newPeriod starts 2027-07-01', async () => {
    const { service, recordRealisedSaving } = build();

    const result = await service.recordRealisedSaving(TX, {
      newPeriodId: 'sub-new',
      invoiceId: 'inv-aug',
      serviceMonth: '2027-08-01',
      now,
    });

    expect(result).toEqual({ recorded: false });
    expect(recordRealisedSaving).not.toHaveBeenCalled();
  });

  it('records 0n when price rise exceeds seat reduction (100 x 150k -> 88 x 180k)', async () => {
    const { service, recordRealisedSaving } = build({
      prior: { purchasedQuantity: 100, monthlyPriceMinor: 150_000n, commitmentTermMonths: 12 },
      next: { purchasedQuantity: 88, monthlyPriceMinor: 180_000n, commitmentTermMonths: 12 },
    });

    const result = await service.recordRealisedSaving(TX, {
      newPeriodId: 'sub-new',
      invoiceId: 'inv-july',
      serviceMonth: '2027-07-01',
      now,
    });

    expect(result).toEqual({ recorded: true, amountMinor: 0n, currency: 'VND' });
    expect(recordRealisedSaving).toHaveBeenCalledWith(TX, expect.objectContaining({ minor: 0n }));
  });

  it('does not record for auto-renewal without a subscription_renewals row', async () => {
    const { service, recordRealisedSaving, getPurchaseFacts } = build({ candidate: null });

    const result = await service.recordRealisedSaving(TX, { newPeriodId: 'sub-auto', invoiceId: 'inv-1', now });

    expect(result).toEqual({ recorded: false });
    expect(getPurchaseFacts).not.toHaveBeenCalled();
    expect(recordRealisedSaving).not.toHaveBeenCalled();
  });

  it('is idempotent when realisedSavingsRecordedAt is already populated or outcome !== AS_DECIDED', async () => {
    const already = build({
      candidate: candidateOf({
        realisedSavingsRecordedAt: new Date('2027-07-01T00:00:00Z'),
        realisedSavingsMinor: 6_000_000n,
      }),
    });
    expect(await already.service.recordRealisedSaving(TX, { newPeriodId: 'sub-new', invoiceId: 'inv-2', now })).toEqual(
      {
        recorded: false,
      },
    );
    expect(already.recordRealisedSaving).not.toHaveBeenCalled();

    const different = build({ candidate: candidateOf({ outcome: 'DIFFERENT' }) });
    expect(
      await different.service.recordRealisedSaving(TX, { newPeriodId: 'sub-new', invoiceId: 'inv-1', now }),
    ).toEqual({ recorded: false });
    expect(different.recordRealisedSaving).not.toHaveBeenCalled();
  });
});
