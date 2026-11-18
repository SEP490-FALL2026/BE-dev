import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { FinanceApi } from '../../finance/public/finance.api';
import { AssessmentQuoteRefusedError } from './assessment.errors';
import { QuoteService } from './quote.service';

describe('QĐ-111an: the quote of an assessment is in dong, the price the vendor quoted is only kept', () => {
  const parseMoney = jest.fn(({ amount, currency }: { amount: string; currency: string }) =>
    Promise.resolve({ amountMinor: BigInt(amount.replace('.', '')), currency }),
  );
  // `snapshotMoney` is not given on purpose: the quote converts nothing.
  const service = new QuoteService({ parseMoney } as unknown as FinanceApi);
  const quote = (
    unitPrice: { amount: string; currency: string },
    originalPrice?: { amount: string; currency: string },
  ) => ({
    unitPrice,
    ...(originalPrice ? { originalPrice } : {}),
    billingCycle: 'MONTHLY' as const,
    validFrom: '2026-11-01',
    validUntil: null,
  });

  beforeEach(() => jest.clearAllMocks());

  it('reads a quote in dong with no original price', async () => {
    await expect(service.read(quote({ amount: '200000', currency: 'VND' }), 'quote')).resolves.toEqual({
      unitPrice: { amountMinor: 200000n, currency: 'VND' },
      originalPrice: null,
      billingCycle: 'MONTHLY',
      validFrom: '2026-11-01',
      validUntil: null,
    });
  });

  it('keeps the price the vendor quoted in its own currency beside the quote in dong', async () => {
    const read = await service.read(
      quote({ amount: '203200', currency: 'VND' }, { amount: '8.00', currency: 'USD' }),
      'quote',
    );

    expect(read.unitPrice).toEqual({ amountMinor: 203200n, currency: 'VND' });
    expect(read.originalPrice).toEqual({ amountMinor: 800n, currency: 'USD' });
  });

  it('refuses a quote in another currency with QUOTE_PRICE_NOT_VND, before the amount is read', async () => {
    const refused = service.read(quote({ amount: '8.00', currency: 'USD' }), 'quote');

    await expect(refused).rejects.toThrow(AssessmentQuoteRefusedError);
    await expect(refused).rejects.toMatchObject({ reason: 'QUOTE_PRICE_NOT_VND' });
    expect(parseMoney).not.toHaveBeenCalled();
  });

  it('refuses a negative quote and a negative original price', async () => {
    await expect(service.read(quote({ amount: '-1', currency: 'VND' }), 'quote')).rejects.toThrow(MoneyOutOfRangeError);
    await expect(
      service.read(quote({ amount: '1', currency: 'VND' }, { amount: '-1.00', currency: 'USD' }), 'quote'),
    ).rejects.toThrow(MoneyOutOfRangeError);
  });

  it.each([['quote'], ['spend.quote']])(
    'names the field of the body in the money error it throws, and passes it to the finance facade, where the quote sits at %s',
    async (at) => {
      await expect(service.read(quote({ amount: '-1', currency: 'VND' }), at)).rejects.toMatchObject({
        path: `${at}.unitPrice`,
      });
      await expect(
        service.read(quote({ amount: '1', currency: 'VND' }, { amount: '-1.00', currency: 'USD' }), at),
      ).rejects.toMatchObject({ path: `${at}.originalPrice` });
      expect(parseMoney).toHaveBeenCalledWith(expect.anything(), `${at}.unitPrice`);
      expect(parseMoney).toHaveBeenCalledWith(expect.anything(), `${at}.originalPrice`);
    },
  );

  it('refuses to price a request from a quote kept in another currency (one an earlier release stored and no rate could convert): QUOTE_PRICE_NOT_VND', () => {
    const kept = {
      unitPrice: { amountMinor: 800n, currency: 'USD' },
      originalPrice: null,
      billingCycle: 'MONTHLY' as const,
      validFrom: '2026-01-01',
      validUntil: null,
    };
    const price = () => service.price(kept, { beneficiaries: 1, endDate: null }, { checkDate: '2026-10-23' });

    expect(price).toThrow(AssessmentQuoteRefusedError);
    expect(price).toThrow(expect.objectContaining({ reason: 'QUOTE_PRICE_NOT_VND' }) as Error);
  });

  it('prices the request from a quote kept in dong', () => {
    const kept = {
      unitPrice: { amountMinor: 200000n, currency: 'VND' },
      originalPrice: null,
      billingCycle: 'MONTHLY' as const,
      validFrom: '2026-01-01',
      validUntil: null,
    };

    const priced = service.price(kept, { beneficiaries: 2, endDate: null }, { checkDate: '2026-10-23' });

    expect(priced).toMatchObject({ status: 'PRICED', amount: { currency: 'VND' } });
  });

  it('still refuses a quote that ends before it begins', async () => {
    await expect(
      service.read({ ...quote({ amount: '1', currency: 'VND' }), validUntil: '2026-10-31' }, 'quote'),
    ).rejects.toMatchObject({ reason: 'QUOTE_PERIOD_INVALID' });
  });
});
