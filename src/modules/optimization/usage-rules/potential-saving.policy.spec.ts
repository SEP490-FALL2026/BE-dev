import { potentialSavingOf } from './potential-saving.policy';

const price = (amountMinor: bigint, billingCycle: 'MONTHLY' | 'ANNUAL' | 'QUARTERLY' | 'OTHER') => ({
  amountMinor,
  currency: 'USD',
  billingCycle,
});

describe('the potential saving of a seat (FR-4.15, R-J09, US-10-04 AC-3, DA6-31)', () => {
  it('K2 on an annual plan is the month and the year at the renewal (15 and 180)', () => {
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(180n, 'ANNUAL') })).toMatchObject({
      monthlyAmountMinor: '15',
      amountAtPointMinor: '180',
      currency: 'USD',
      realisableAt: 'UNKNOWN',
      realisableOn: null,
    });
  });

  it('K2 on a monthly plan is a month at the point (15 and 15)', () => {
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(15n, 'MONTHLY') })).toMatchObject({
      monthlyAmountMinor: '15',
      amountAtPointMinor: '15',
    });
  });

  it('K1 is a month at the next billing; a quarter is a third', () => {
    expect(potentialSavingOf({ provisioningType: 'K1', price: price(45n, 'QUARTERLY') })).toMatchObject({
      monthlyAmountMinor: '15',
      amountAtPointMinor: '15',
    });
  });

  it('K4 can never be had; a plan with no price or an unknown cycle has none', () => {
    expect(potentialSavingOf({ provisioningType: 'K4', price: price(15n, 'MONTHLY') })).toMatchObject({
      realisableAt: 'NEVER',
      monthlyAmountMinor: null,
    });
    expect(potentialSavingOf({ provisioningType: 'K2', price: null })).toBeNull();
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(15n, 'OTHER') })).toBeNull();
  });
});
