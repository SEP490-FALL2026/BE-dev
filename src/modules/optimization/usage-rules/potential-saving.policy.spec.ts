import { potentialSavingOf } from './potential-saving.policy';

const price = (monthlyPriceMinor: bigint | null, billingCycle: 'MONTHLY' | 'ANNUAL' | 'QUARTERLY' | 'OTHER') => ({
  monthlyPriceMinor,
  currency: 'VND',
  billingCycle,
});

describe('the potential saving of a seat (FR-4.15, R-J09, US-10-04 AC-3, DA6-31, W3-02)', () => {
  it('K2 on an annual plan reads monthlyPriceMinor directly (15 and 180)', () => {
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(15n, 'ANNUAL') })).toMatchObject({
      monthlyAmountMinor: '15',
      amountAtPointMinor: '180',
      currency: 'VND',
      realisableAt: 'UNKNOWN',
      realisableOn: null,
    });
  });

  it('W3-02: reads pre-rounded monthlyPriceMinor directly without floor division', () => {
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(83_334n, 'ANNUAL') })).toMatchObject({
      monthlyAmountMinor: '83334',
      amountAtPointMinor: '1000008',
    });
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(83_333n, 'ANNUAL') })).toMatchObject({
      monthlyAmountMinor: '83333',
      amountAtPointMinor: '999996',
    });
  });

  it('K2 on a monthly plan is a month at the point (15 and 15)', () => {
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(15n, 'MONTHLY') })).toMatchObject({
      monthlyAmountMinor: '15',
      amountAtPointMinor: '15',
    });
  });

  it('K1 is a month at the next billing', () => {
    expect(potentialSavingOf({ provisioningType: 'K1', price: price(15n, 'QUARTERLY') })).toMatchObject({
      monthlyAmountMinor: '15',
      amountAtPointMinor: '15',
    });
  });

  it('K4 can never be had; a plan with no price, null monthly price, or an unknown cycle has none', () => {
    expect(potentialSavingOf({ provisioningType: 'K4', price: price(15n, 'MONTHLY') })).toMatchObject({
      realisableAt: 'NEVER',
      monthlyAmountMinor: null,
    });
    expect(potentialSavingOf({ provisioningType: 'K2', price: null })).toBeNull();
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(null, 'ANNUAL') })).toBeNull();
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(15n, 'OTHER') })).toBeNull();
  });
});
