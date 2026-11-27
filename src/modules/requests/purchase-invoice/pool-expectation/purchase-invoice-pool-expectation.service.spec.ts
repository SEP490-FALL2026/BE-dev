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
