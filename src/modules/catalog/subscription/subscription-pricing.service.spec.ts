import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { FinanceApi } from '../../finance/public/finance.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { declareSubscriptionBodySchema, updateSubscriptionBodySchema } from './subscription.dto';
import { SubscriptionPriceMismatchError, SubscriptionPriceNotVndError } from './subscription.errors';
import { toSubscriptionApiException } from './subscription.http-errors';
import { resolveSubscriptionPrices } from './subscription.policy';
import { SubscriptionPricingService } from './subscription-pricing.service';

describe('QĐ-111an: the pricing of a subscription reads dong and no exchange rate', () => {
  const parseMoney = jest.fn(({ amount, currency }: { amount: string; currency: string }) =>
    Promise.resolve({ amountMinor: BigInt(amount.replace('.', '')), currency }),
  );
  const businessToday = jest.fn(() => Promise.resolve('2026-11-14'));
  // `snapshotMoney` is not given on purpose: the service must not call it, or the test fails by a TypeError.
  const finance = { parseMoney } as unknown as FinanceApi;
  const organization = { businessToday } as unknown as OrganizationReadApi;
  const service = new SubscriptionPricingService(finance, organization);
  const tx = {} as DbTx;

  beforeEach(() => jest.clearAllMocks());

  it('refuses a unit price in another currency before the amount is read', async () => {
    await expect(service.read({ amount: '1200.00', currency: 'USD' })).rejects.toThrow(SubscriptionPriceNotVndError);
    expect(parseMoney).not.toHaveBeenCalled();
  });

  it('reads a unit price in dong and refuses a negative one', async () => {
    await expect(service.read({ amount: '600000', currency: 'VND' })).resolves.toEqual({
      amountMinor: 600000n,
      currency: 'VND',
    });
    await expect(service.read({ amount: '-1', currency: 'VND' })).rejects.toThrow(MoneyOutOfRangeError);
  });

  it('reads the original price in its own currency, any supported one, and refuses a negative one', async () => {
    await expect(service.readOriginal({ amount: '48.00', currency: 'USD' })).resolves.toEqual({
      amountMinor: 4800n,
      currency: 'USD',
    });
    await expect(service.readOriginal({ amount: '-4.00', currency: 'USD' })).rejects.toThrow(MoneyOutOfRangeError);
  });

  it('names the field of the body in the money error it throws, and passes it to the finance facade', async () => {
    await expect(service.read({ amount: '-1', currency: 'VND' })).rejects.toMatchObject({ path: 'unitPrice' });
    await expect(service.readOriginal({ amount: '-4.00', currency: 'USD' })).rejects.toMatchObject({
      path: 'originalPrice',
    });
    expect(parseMoney).toHaveBeenCalledWith(expect.anything(), 'unitPrice');
    expect(parseMoney).toHaveBeenCalledWith(expect.anything(), 'originalPrice');
  });

  it('names the field where the caller says the price sits in its body, such as the new period of a renewal (FIX-E-R2)', async () => {
    await expect(service.read({ amount: '-1', currency: 'VND' }, 'nextPeriod.unitPrice')).rejects.toMatchObject({
      path: 'nextPeriod.unitPrice',
    });
    expect(parseMoney).toHaveBeenLastCalledWith(expect.anything(), 'nextPeriod.unitPrice');
    await expect(
      service.readOriginal({ amount: '-4.00', currency: 'USD' }, 'nextPeriod.originalPrice'),
    ).rejects.toMatchObject({
      path: 'nextPeriod.originalPrice',
    });
    expect(parseMoney).toHaveBeenLastCalledWith(expect.anything(), 'nextPeriod.originalPrice');
  });

  it('records a price today with the snapshot of the same currency: rate 1, `SAME_CURRENCY`, the price as the reporting price, no rate row', async () => {
    const priced = await service.priceToday(tx, { amountMinor: 600000n, currency: 'VND' });

    expect(priced).toEqual({
      unitPrice: { amountMinor: 600000n, currency: 'VND', recordedOn: '2026-11-14' },
      priceSnapshot: {
        rate: 10_000_000_000n,
        rateDate: '2026-11-14',
        rateSource: 'SAME_CURRENCY',
        reportingMinor: 600000n,
        reportingCurrency: 'VND',
        exchangeRateId: null,
      },
    });
    expect(businessToday).toHaveBeenCalledWith(undefined, tx);
  });

  it('leaves no price and no snapshot when none is given, and never a price in dollars with a snapshot', async () => {
    await expect(service.priceToday(tx, null)).resolves.toEqual({ unitPrice: null, priceSnapshot: null });
    await expect(service.priceToday(tx, { amountMinor: 1n, currency: 'USD' })).rejects.toThrow(
      SubscriptionPriceNotVndError,
    );
  });
});

describe('W3-02 #4: resolveSubscriptionPrices & write DTO billingCycle', () => {
  const vnd = (amountMinor: bigint) => ({ amountMinor, currency: 'VND' });

  it.each([
    {
      label: 'monthlyUnitPrice 500.000 ANNUAL -> monthly 500.000, unit 6.000.000',
      cycle: 'ANNUAL' as const,
      sentMonthly: vnd(500_000n),
      sentUnit: undefined,
      expectedMonthly: 500_000n,
      expectedUnit: 6_000_000n,
    },
    {
      label: 'unitPrice 6.000.000 ANNUAL -> monthly 500.000, unit 6.000.000',
      cycle: 'ANNUAL' as const,
      sentMonthly: undefined,
      sentUnit: vnd(6_000_000n),
      expectedMonthly: 500_000n,
      expectedUnit: 6_000_000n,
    },
    {
      label: 'unitPrice 1.000.001 ANNUAL (kills ceil) -> monthly 83.333, unit 999.996',
      cycle: 'ANNUAL' as const,
      sentMonthly: undefined,
      sentUnit: vnd(1_000_001n),
      expectedMonthly: 83_333n,
      expectedUnit: 999_996n,
    },
    {
      label: 'unitPrice 1.000.002 ANNUAL (boundary, kills floor) -> monthly 83.334, unit 1.000.008',
      cycle: 'ANNUAL' as const,
      sentMonthly: undefined,
      sentUnit: vnd(1_000_002n),
      expectedMonthly: 83_334n,
      expectedUnit: 1_000_008n,
    },
    {
      label: 'monthlyUnitPrice 500.000 MONTHLY -> monthly 500.000, unit 500.000',
      cycle: 'MONTHLY' as const,
      sentMonthly: vnd(500_000n),
      sentUnit: undefined,
      expectedMonthly: 500_000n,
      expectedUnit: 500_000n,
    },
    {
      label: 'matching monthly 500.000 and unit 6.000.000 ANNUAL -> accepted',
      cycle: 'ANNUAL' as const,
      sentMonthly: vnd(500_000n),
      sentUnit: vnd(6_000_000n),
      expectedMonthly: 500_000n,
      expectedUnit: 6_000_000n,
    },
  ])('$label', ({ cycle, sentMonthly, sentUnit, expectedMonthly, expectedUnit }) => {
    const resolved = resolveSubscriptionPrices({
      kind: 'TERM',
      billingCycle: cycle,
      cycleChanged: false,
      sentMonthly,
      sentUnit,
    });

    expect(resolved.monthlyUnitPriceMinor).toBe(expectedMonthly);
    expect(resolved.unitMoney).toEqual({ amountMinor: expectedUnit, currency: 'VND' });
  });

  it('refuses mismatched monthlyUnitPrice and unitPrice with 422 SUBSCRIPTION.PRICE_MISMATCH and details.expectedUnitPrice', () => {
    let caught: unknown;
    try {
      resolveSubscriptionPrices({
        kind: 'TERM',
        billingCycle: 'ANNUAL',
        cycleChanged: false,
        sentMonthly: vnd(500_000n),
        sentUnit: vnd(6_000_001n),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SubscriptionPriceMismatchError);
    const httpEx = toSubscriptionApiException(caught);
    expect(httpEx).toMatchObject({
      status: 422,
      response: {
        code: 'SUBSCRIPTION.PRICE_MISMATCH',
        details: { expectedUnitPrice: { amount: '6000000', currency: 'VND' } },
      },
    });
  });

  it.each(['QUARTERLY', 'OTHER'] as const)(
    'rejects %s in write DTOs (422 VALIDATION_ERROR at HTTP boundary) while accepting MONTHLY and ANNUAL',
    (badCycle) => {
      const baseCreate = { planId: '00000000-0000-4000-8000-000000000001', kind: 'TERM' as const };
      expect(declareSubscriptionBodySchema.safeParse({ ...baseCreate, billingCycle: badCycle }).success).toBe(false);
      expect(updateSubscriptionBodySchema.safeParse({ billingCycle: badCycle }).success).toBe(false);
      expect(declareSubscriptionBodySchema.safeParse({ ...baseCreate, billingCycle: 'ANNUAL' }).success).toBe(true);
      expect(updateSubscriptionBodySchema.safeParse({ billingCycle: 'MONTHLY' }).success).toBe(true);
    },
  );
});
