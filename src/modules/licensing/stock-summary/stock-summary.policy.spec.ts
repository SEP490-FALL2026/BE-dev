import { stockOfPlan, type StockCounts } from './stock-summary.policy';

const counts = (parts: Partial<StockCounts> = {}): StockCounts => ({
  seats: new Map(),
  keys: new Map(),
  holders: new Map(),
  deviceOccupied: new Map(),
  ...parts,
});

describe('stockOfPlan (QĐ-111n: the stock counted by what the plan gives out, never by the subscription records)', () => {
  describe('a K2 plan counts seats', () => {
    it('adds the seats bought, taken and being taken back over the subscriptions of the plan, and the free seats of each one', () => {
      const stock = stockOfPlan(
        {
          provisioningType: 'K2',
          subscriptions: [
            { subscriptionId: 'a', purchasedQuantity: 10 },
            { subscriptionId: 'b', purchasedQuantity: 5 },
          ],
        },
        counts({
          seats: new Map([
            ['a', { occupied: 4, inRevocation: 1 }],
            ['b', { occupied: 5, inRevocation: 0 }],
          ]),
        }),
      );

      expect(stock).toEqual({ kind: 'SEATS', purchased: 15, assigned: 9, free: 6, revoking: 1 });
    });

    it('never counts a negative free seat of a subscription that holds more than it bought, and does not lend it to another', () => {
      const stock = stockOfPlan(
        {
          provisioningType: 'K2',
          subscriptions: [
            { subscriptionId: 'a', purchasedQuantity: 5 },
            { subscriptionId: 'b', purchasedQuantity: 5 },
          ],
        },
        counts({
          seats: new Map([
            ['a', { occupied: 7, inRevocation: 0 }],
            ['b', { occupied: 1, inRevocation: 0 }],
          ]),
        }),
      );

      expect(stock).toEqual({ kind: 'SEATS', purchased: 10, assigned: 8, free: 4, revoking: 0 });
    });

    it('counts a subscription nobody holds a seat of as all free', () => {
      const stock = stockOfPlan(
        { provisioningType: 'K2', subscriptions: [{ subscriptionId: 'a', purchasedQuantity: 3 }] },
        counts(),
      );

      expect(stock).toEqual({ kind: 'SEATS', purchased: 3, assigned: 0, free: 3, revoking: 0 });
    });

    it('says the seats bought and free are not known when a subscription has no quantity, and still counts what is held', () => {
      const stock = stockOfPlan(
        {
          provisioningType: 'K2',
          subscriptions: [
            { subscriptionId: 'a', purchasedQuantity: 10 },
            { subscriptionId: 'flat', purchasedQuantity: null },
          ],
        },
        counts({
          seats: new Map([
            ['a', { occupied: 2, inRevocation: 0 }],
            ['flat', { occupied: 3, inRevocation: 2 }],
          ]),
        }),
      );

      expect(stock).toEqual({ kind: 'SEATS', purchased: null, assigned: 5, free: null, revoking: 2 });
    });
  });

  describe('a K4 plan counts keys', () => {
    it('adds the keys in the store, given out and withdrawn over the subscriptions of the plan', () => {
      const stock = stockOfPlan(
        {
          provisioningType: 'K4',
          subscriptions: [
            { subscriptionId: 'a', purchasedQuantity: 10 },
            { subscriptionId: 'b', purchasedQuantity: 4 },
          ],
        },
        counts({
          keys: new Map([
            ['a', { inStore: 2, assigned: 7, withdrawn: 1 }],
            ['b', { inStore: 3, assigned: 0, withdrawn: 0 }],
          ]),
        }),
      );

      expect(stock).toEqual({ kind: 'KEYS', inStore: 5, assigned: 7, withdrawn: 1 });
    });

    it('counts a purchase that holds no key yet as zero keys, not as the seats bought', () => {
      const stock = stockOfPlan(
        { provisioningType: 'K4', subscriptions: [{ subscriptionId: 'a', purchasedQuantity: 10 }] },
        counts(),
      );

      expect(stock).toEqual({ kind: 'KEYS', inStore: 0, assigned: 0, withdrawn: 0 });
    });
  });

  describe('a K1 plan counts rights', () => {
    it('adds the people who hold the personal account over the subscriptions of the plan, with no figure of a free seat', () => {
      const stock = stockOfPlan(
        {
          provisioningType: 'K1',
          subscriptions: [
            { subscriptionId: 'a', purchasedQuantity: 1 },
            { subscriptionId: 'b', purchasedQuantity: 1 },
            { subscriptionId: 'c', purchasedQuantity: 1 },
          ],
        },
        counts({
          holders: new Map([
            ['a', 1],
            ['c', 1],
          ]),
        }),
      );

      expect(stock).toEqual({ kind: 'HOLDERS', holders: 2 });
    });
  });
});

describe('stockOfPlan for a K4 plan whose key goes on a machine (W2-21)', () => {
  const plan = (quantities: (number | null)[]) => ({
    provisioningType: 'K4' as const,
    keyBinding: 'DEVICE_KEY' as const,
    subscriptions: quantities.map((purchasedQuantity, index) => ({ subscriptionId: `s${index}`, purchasedQuantity })),
  });

  it('counts the licenses bought and the licenses held on machines, and what each purchase has left', () => {
    const stock = stockOfPlan(
      plan([25, 10]),
      counts({
        deviceOccupied: new Map([
          ['s0', 10],
          ['s1', 12],
        ]),
      }),
    );

    // The second purchase holds more than it bought and lends nothing to the first: 15 free + 0 free.
    expect(stock).toEqual({ kind: 'LICENSES', purchased: 35, occupied: 22, free: 15 });
  });

  it('counts a purchase that holds nothing as having all its licenses free', () => {
    expect(stockOfPlan(plan([25]), counts())).toEqual({ kind: 'LICENSES', purchased: 25, occupied: 0, free: 25 });
  });

  it('does not know the licenses bought or free when a purchase has no quantity, and still counts what is held', () => {
    const stock = stockOfPlan(plan([25, null]), counts({ deviceOccupied: new Map([['s0', 3]]) }));

    expect(stock).toEqual({ kind: 'LICENSES', purchased: null, occupied: 3, free: null });
  });

  it('keeps counting keys for a K4 plan whose key is given to an account', () => {
    const stock = stockOfPlan(
      {
        provisioningType: 'K4',
        keyBinding: 'ACCOUNT',
        subscriptions: [{ subscriptionId: 'a', purchasedQuantity: 10 }],
      },
      counts({ keys: new Map([['a', { inStore: 4, assigned: 5, withdrawn: 1 }]]) }),
    );

    expect(stock).toEqual({ kind: 'KEYS', inStore: 4, assigned: 5, withdrawn: 1 });
  });
});
