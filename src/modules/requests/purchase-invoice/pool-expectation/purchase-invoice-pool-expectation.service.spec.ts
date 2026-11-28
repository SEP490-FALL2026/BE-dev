import type { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { SubscriptionPurchaseFacts } from '../../../catalog/public/subscription-period.types';
import { PurchaseInvoicePoolService } from './purchase-invoice-pool-expectation.service';
import { expectedPoolAmountOf } from './purchase-invoice-pool-expectation.policy';

type Lines = Awaited<ReturnType<SubscriptionPeriodApi['linesOfSubscriptions']>>;
type LineOfPeriod = NonNullable<ReturnType<Lines['get']>>[number];

const period = {
  subscriptionId: 'sub-1',
  billingCycle: 'MONTHLY',
  monthlyPriceMinor: 1_000_000n,
  renewalDate: '2027-07-01',
  endDate: null,
} as unknown as SubscriptionPurchaseFacts;

const line = (over: Partial<LineOfPeriod>): LineOfPeriod =>
  ({
    planId: 'standard',
    monthlyUnitPriceMinor: 500_000n,
    closedReason: null,
    createdAt: new Date('2027-01-01T00:00:00Z'),
    ...over,
  }) as LineOfPeriod;

function serviceWith(lines: LineOfPeriod[]) {
  const periods = { linesOfSubscriptions: jest.fn().mockResolvedValue(new Map([['sub-1', lines]])) };
  const service = new PurchaseInvoicePoolService(
    periods as unknown as SubscriptionPeriodApi,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );

  return { service, periods };
}

describe('PurchaseInvoicePoolService.topUpSource (a period with lines is priced by its lines)', () => {
  const standard = line({});
  const premium = line({ planId: 'premium', monthlyUnitPriceMinor: 800_000n });

  it('prices the top-up of a Premium request at the Premium line, not at the column of the period', async () => {
    const { service } = serviceWith([standard, premium]);

    const source = await service.topUpSource(period, 'premium', ['2027-03-10']);

    expect(source).toMatchObject({ kind: 'REQUEST_TOP_UP', monthlyPriceMinor: 800_000n });
  });

  it('prices the top-up of a Standard request at the Standard line', async () => {
    const { service } = serviceWith([standard, premium]);

    expect(await service.topUpSource(period, 'standard', ['2027-03-10'])).toMatchObject({
      monthlyPriceMinor: 500_000n,
    });
  });

  it('follows the price of the line after it is edited: the amount expected of the invoice moves with it', async () => {
    const before = await serviceWith([premium]).service.topUpSource(period, 'premium', ['2027-03-10']);
    const after = await serviceWith([line({ planId: 'premium', monthlyUnitPriceMinor: 900_000n })]).service.topUpSource(
      period,
      'premium',
      ['2027-03-10'],
    );

    // Bought 10/03, the month runs to 31/03: 22 of 31 days of the monthly price (rounded half away).
    expect(expectedPoolAmountOf(before)).toBe(567_742n);
    expect(expectedPoolAmountOf(after)).toBe(638_710n);
  });

  it('falls back to the column of the period only when the period has no line', async () => {
    const { service } = serviceWith([]);

    expect(await service.topUpSource(period, 'standard', null)).toMatchObject({ monthlyPriceMinor: 1_000_000n });
  });

  it('has no price for a plan with no line on a period that has lines, so the expectation stays absent', async () => {
    const { service } = serviceWith([standard]);

    const source = await service.topUpSource(period, 'premium', ['2027-03-10']);

    expect(source).toMatchObject({ monthlyPriceMinor: null });
    expect(expectedPoolAmountOf(source)).toBeNull();
  });

  it('keeps an absent period as no price', async () => {
    const { service } = serviceWith([standard]);

    expect(await service.topUpSource(undefined, 'standard', null)).toMatchObject({
      billingCycle: null,
      monthlyPriceMinor: null,
    });
  });
});

describe('PurchaseInvoicePoolService.seatPricingOf (the ceiling of an invoice of the pool is judged by the line)', () => {
  const priced = { ...period, cycleMonths: 1 } as unknown as SubscriptionPurchaseFacts;
  const standard = line({});
  const premium = line({ planId: 'premium', monthlyUnitPriceMinor: 800_000n });

  it('prices a seat of the Premium plan at the Premium line and keeps the cycle and renewal day of the period', async () => {
    const { service } = serviceWith([standard, premium]);

    expect(await service.seatPricingOf(priced, 'premium')).toEqual({
      monthlyMinor: 800_000n,
      cycleMonths: 1,
      renewalDate: '2027-07-01',
    });
  });

  it('knows no price for a plan that has no line on a period that has lines', async () => {
    const { service } = serviceWith([standard]);

    expect((await service.seatPricingOf(priced, 'premium')).monthlyMinor).toBeNull();
  });

  it('uses the column of the period only when it has no line', async () => {
    const { service } = serviceWith([]);

    expect((await service.seatPricingOf(priced, 'standard')).monthlyMinor).toBe(1_000_000n);
  });
});

describe('PurchaseInvoicePoolService.buildLicenseLotLinkFacts (who submits the invoice of a lot, QĐ-118d, Owner 28/11/2026)', () => {
  const lotOf = (over: Record<string, unknown>) => ({
    id: 'lot-1',
    organizationId: 'org-1',
    purpose: 'STOCK',
    requestId: null,
    invoiceActualMinor: null,
    responsibleItAdminEmployeeId: 'it-1',
    planId: 'plan-1',
    licenseCount: 3,
    unitPriceMinor: 1_000_000n,
    ...over,
  });
  const build = (lot: Record<string, unknown>, actorEmployeeId: string, scope: readonly string[] = []) => {
    const service = new PurchaseInvoicePoolService(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      { findLot: jest.fn().mockResolvedValue(lot) } as never,
    );

    return service.buildLicenseLotLinkFacts({
      licenseLotId: 'lot-1',
      serviceMonth: '2026-11-01',
      scope,
      actorEmployeeId,
      invoices: {
        requestFacts: jest.fn().mockResolvedValue({ departmentId: 'dept-1', costCenterId: 'cc-1' }),
      } as never,
      catalog: {
        getPlanVendorId: jest.fn().mockResolvedValue('vendor-1'),
        getPlanOriginalPrice: jest.fn().mockResolvedValue(null),
      } as never,
    });
  };

  it.each(['STOCK', 'OPENING', 'REPLACEMENT'])(
    'refuses an IT Admin who does not answer for a %s lot with NOT_RESPONSIBLE',
    async (purpose) => {
      await expect(build(lotOf({ purpose }), 'it-2')).rejects.toMatchObject({ reason: 'NOT_RESPONSIBLE' });
    },
  );

  it('refuses everyone when a lot of another purpose names no IT Admin', async () => {
    await expect(build(lotOf({ responsibleItAdminEmployeeId: null }), 'it-1')).rejects.toMatchObject({
      reason: 'NOT_RESPONSIBLE',
    });
  });

  it('lets the IT Admin who answers for the lot submit it', async () => {
    await expect(build(lotOf({}), 'it-1')).resolves.toMatchObject({ link: { kind: 'LICENSE_LOT' } });
  });

  it('keeps the lot bought for a request by the department of the request, whoever answers for the lot', async () => {
    const lot = lotOf({ purpose: 'REQUEST', requestId: 'req-1', responsibleItAdminEmployeeId: 'it-9' });
    await expect(build(lot, 'it-1', ['dept-1'])).resolves.toMatchObject({ requestCostCenterId: 'cc-1' });
    await expect(build(lot, 'it-1', ['dept-2'])).rejects.toMatchObject({ reason: 'LINK_NOT_FOUND' });
  });
});
