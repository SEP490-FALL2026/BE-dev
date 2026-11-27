import { choosePoolLine, judgePurchase, type PoolStock } from './shared-pool.policy';
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

describe('choosePoolLine', () => {
  it('prefers lines with free seats, then orders by lineCreatedAt and subscriptionLineId', () => {
    const olderFull = {
      subscriptionId: 'sub-1',
      subscriptionLineId: 'line-1',
      lineCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      purchasedQuantity: 2,
      isPrimaryForPlan: true,
    };
    const newerFreeB = {
      subscriptionId: 'sub-2',
      subscriptionLineId: 'line-b',
      lineCreatedAt: new Date('2026-02-01T00:00:00.000Z'),
      purchasedQuantity: 2,
      isPrimaryForPlan: false,
    };
    const newerFreeA = {
      subscriptionId: 'sub-3',
      subscriptionLineId: 'line-a',
      lineCreatedAt: new Date('2026-02-01T00:00:00.000Z'),
      purchasedQuantity: 1,
      isPrimaryForPlan: false,
    };
    const stock: PoolStock = {
      free: 2,
      inRevocation: 0,
      freeSubscriptionIds: ['sub-2', 'sub-3'],
      freeBySubscription: new Map([
        ['sub-1', 0],
        ['sub-2', 1],
        ['sub-3', 1],
      ]),
    };

    expect(choosePoolLine([olderFull, newerFreeB, newerFreeA], stock)?.subscriptionLineId).toBe('line-a');
  });

  it('when all lines are full, picks oldest lineCreatedAt then subscriptionLineId', () => {
    const lineB = {
      subscriptionId: 'sub-2',
      subscriptionLineId: 'line-b',
      lineCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      purchasedQuantity: 1,
      isPrimaryForPlan: false,
    };
    const lineA = {
      subscriptionId: 'sub-1',
      subscriptionLineId: 'line-a',
      lineCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      purchasedQuantity: 1,
      isPrimaryForPlan: true,
    };
    const stock: PoolStock = {
      free: 0,
      inRevocation: 0,
      freeSubscriptionIds: [],
      freeBySubscription: new Map([
        ['sub-1', 0],
        ['sub-2', 0],
      ]),
    };

    expect(choosePoolLine([lineB, lineA], stock)?.subscriptionLineId).toBe('line-a');
  });
});
