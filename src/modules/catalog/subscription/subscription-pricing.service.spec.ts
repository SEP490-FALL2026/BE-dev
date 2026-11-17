import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { FinanceApi } from '../../finance/public/finance.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SubscriptionPriceNotVndError } from './subscription.errors';
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
