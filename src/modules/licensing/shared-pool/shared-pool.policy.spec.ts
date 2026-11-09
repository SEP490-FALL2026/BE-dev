import { avoidedCostOf, judgePurchase, type PoolStock } from './shared-pool.policy';
import { PurchaseNotAllowedError, PurchaseNotApplicableError, PurchaseReasonRequiredError } from './shared-pool.errors';

const EMPTY: PoolStock = { free: 0, inRevocation: 0, freeSubscriptionIds: [], freeBySubscription: new Map() };

describe('judgePurchase', () => {
  it('BR-MF1-09a: a grant with no purchase is not judged', () => {
    expect(judgePurchase({ provisioningType: 'K2', purchase: undefined, stock: null })).toEqual({ purchased: false });
  });

  it('BR-MF1-09a: refuses a purchase while the pool still has a free seat of the plan', () => {
    const stock: PoolStock = {
      free: 2,
      inRevocation: 0,
      freeSubscriptionIds: ['s1'],
      freeBySubscription: new Map([['s1', 2]]),
    };
    const call = () => judgePurchase({ provisioningType: 'K2', purchase: {}, stock });

    expect(call).toThrow(PurchaseNotAllowedError);
    try {
      call();
    } catch (error) {
      expect(error).toMatchObject({ freeSeats: 2, subscriptionIds: ['s1'] });
    }
  });

  it('BR-MF1-09a: with nothing free and a seat being taken back, a purchase without a reason is refused', () => {
    const stock: PoolStock = { ...EMPTY, inRevocation: 1 };

    expect(() => judgePurchase({ provisioningType: 'K2', purchase: {}, stock })).toThrow(PurchaseReasonRequiredError);
    expect(() => judgePurchase({ provisioningType: 'K2', purchase: { reason: '   ' }, stock })).toThrow(
      PurchaseReasonRequiredError,
    );
  });

  it('BR-MF1-09a: with nothing free and a seat being taken back, a purchase with a reason is recorded', () => {
    const stock: PoolStock = { ...EMPTY, inRevocation: 1 };

    expect(judgePurchase({ provisioningType: 'K2', purchase: { reason: ' waiting breaks the SLA ' }, stock })).toEqual({
      purchased: true,
      kind: 'POOL_TOP_UP',
      reason: 'waiting breaks the SLA',
    });
  });

  it('BR-MF1-09b: with the pool empty and nothing being taken back, no reason is needed; K4 buys a key', () => {
    expect(judgePurchase({ provisioningType: 'K2', purchase: {}, stock: EMPTY })).toEqual({
      purchased: true,
      kind: 'POOL_TOP_UP',
      reason: null,
    });
    expect(judgePurchase({ provisioningType: 'K4', purchase: {}, stock: EMPTY })).toEqual({
      purchased: true,
      kind: 'KEY_PURCHASE',
      reason: null,
    });
  });

  it('BR-MF1-09b: only K2 and K4 have a pool to top up', () => {
    for (const provisioningType of ['K1', 'K3', 'K5'] as const) {
      expect(() => judgePurchase({ provisioningType, purchase: {}, stock: EMPTY })).toThrow(PurchaseNotApplicableError);
    }
  });
});

describe('avoidedCostOf', () => {
  const recurring = (amountMinor: bigint, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER') => ({
    kind: 'RECURRING' as const,
    unitPrice: { amountMinor, currency: 'VND' },
    billingCycle,
  });

  it('BR-MF1-09c: a K2 seat granted in July is the monthly price for 6 months (13 − 7)', () => {
    expect(
      avoidedCostOf({ provisioningType: 'K2', completedOn: '2026-07-14', price: recurring(15n, 'MONTHLY') }),
    ).toEqual({ provisioningType: 'K2', months: 6, unitMinor: 15n, amountMinor: 90n, currency: 'VND' });
  });

  it('BR-MF1-09c: an annual price is put per month and rounded up to the minor unit', () => {
    expect(
      avoidedCostOf({ provisioningType: 'K2', completedOn: '2026-01-02', price: recurring(1000n, 'ANNUAL') }),
    ).toEqual({ provisioningType: 'K2', months: 12, unitMinor: 84n, amountMinor: 1008n, currency: 'VND' });
  });

  it('BR-MF1-09c: December counts one whole month', () => {
    expect(
      avoidedCostOf({ provisioningType: 'K2', completedOn: '2026-12-31', price: recurring(10n, 'MONTHLY') })?.months,
    ).toBe(1);
  });

  it('BR-MF1-09c: a K4 key is its purchase price, once', () => {
    expect(
      avoidedCostOf({
        provisioningType: 'K4',
        completedOn: '2026-07-14',
        price: { kind: 'ONE_TIME', unitPrice: { amountMinor: 250n, currency: 'VND' }, billingCycle: 'OTHER' },
      }),
    ).toEqual({ provisioningType: 'K4', months: null, unitMinor: 250n, amountMinor: 250n, currency: 'VND' });
  });

  it('G9-03 BR-MF1-09c: a seat priced in USD is avoided at its monthly price converted to the reporting currency', () => {
    expect(
      avoidedCostOf({
        provisioningType: 'K2',
        completedOn: '2026-09-10',
        price: {
          kind: 'RECURRING',
          unitPrice: { amountMinor: 1_500n, currency: 'USD' },
          reportingUnitPrice: { amountMinor: 375_000n, currency: 'VND' },
          billingCycle: 'MONTHLY',
        },
      }),
    ).toEqual({ provisioningType: 'K2', months: 4, unitMinor: 375_000n, amountMinor: 1_500_000n, currency: 'VND' });
  });

  it('G9-03 BR-MF1-09c: a K4 key of a perpetual purchase (no billing cycle, read OTHER) is its converted purchase price', () => {
    expect(
      avoidedCostOf({
        provisioningType: 'K4',
        completedOn: '2026-09-10',
        price: {
          kind: 'ONE_TIME',
          unitPrice: { amountMinor: 100n, currency: 'USD' },
          reportingUnitPrice: { amountMinor: 2_500_000n, currency: 'VND' },
          billingCycle: 'OTHER',
        },
      }),
    ).toEqual({
      provisioningType: 'K4',
      months: null,
      unitMinor: 2_500_000n,
      amountMinor: 2_500_000n,
      currency: 'VND',
    });
  });

  it('BR-MF1-09c: nothing is recorded without a price, for a cycle that has no month, or for another kind of plan', () => {
    expect(avoidedCostOf({ provisioningType: 'K2', completedOn: '2026-07-14', price: null })).toBeNull();
    expect(
      avoidedCostOf({ provisioningType: 'K2', completedOn: '2026-07-14', price: recurring(10n, 'OTHER') }),
    ).toBeNull();
    expect(
      avoidedCostOf({ provisioningType: 'K1', completedOn: '2026-07-14', price: recurring(10n, 'MONTHLY') }),
    ).toBeNull();
  });
});
