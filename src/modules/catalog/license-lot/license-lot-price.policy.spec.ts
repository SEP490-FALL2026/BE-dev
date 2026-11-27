import {
  accountLotGrantable,
  chooseAccountLot,
  countOpenTasksByLot,
  excessGrantableOf,
  pickK4LotUnitPrice,
  type AccountLotCandidate,
} from './license-lot-price.policy';

const candidate = (over: Partial<AccountLotCandidate> = {}): AccountLotCandidate => ({
  id: 'lot-1',
  purchasedOn: '2027-01-10',
  licenseCount: 3,
  unitPriceMinor: 12_000_000n,
  purpose: 'OPENING',
  requestId: null,
  legacySubscriptionId: null,
  free: 2,
  keysInStore: 2,
  openTasksWithoutKey: 0,
  beneficiaries: 1,
  chargedExcess: 0,
  ...over,
});

describe('pickK4LotUnitPrice (K-A5)', () => {
  it('picks the unit price of the newest lot with free > 0 ordered by purchasedOn DESC, id DESC', () => {
    const price = pickK4LotUnitPrice([
      { id: 'lot-old', purchasedOn: '2027-01-01', unitPriceMinor: 11_000_000n, free: 2 },
      { id: 'lot-new', purchasedOn: '2027-04-01', unitPriceMinor: 12_000_000n, free: 1 },
    ]);

    expect(price).toBe(12_000_000n);
  });

  it('skips the newest lot when it has free = 0 and falls back to the older lot with free > 0 (W3-24 AC-6)', () => {
    const price = pickK4LotUnitPrice([
      { id: 'lot-01', purchasedOn: '2027-01-01', unitPriceMinor: 11_000_000n, free: 1 },
      { id: 'lot-04', purchasedOn: '2027-04-01', unitPriceMinor: 12_000_000n, free: 0 },
    ]);

    expect(price).toBe(11_000_000n);
  });

  it('breaks equal purchasedOn ties by id DESC and returns null when all lots have free = 0', () => {
    expect(
      pickK4LotUnitPrice([
        { id: 'lot-a', purchasedOn: '2027-04-01', unitPriceMinor: 10_000_000n, free: 1 },
        { id: 'lot-b', purchasedOn: '2027-04-01', unitPriceMinor: 12_500_000n, free: 2 },
      ]),
    ).toBe(12_500_000n);
    expect(
      pickK4LotUnitPrice([{ id: 'lot-a', purchasedOn: '2027-04-01', unitPriceMinor: 10_000_000n, free: 0 }]),
    ).toBeNull();
  });
});

describe('accountLotGrantable and excessGrantableOf (W3-24 AC-2 & F11)', () => {
  it('computes grantable = min(free, keysInStore - openTasksWithoutKey), floored at 0', () => {
    expect(accountLotGrantable({ free: 2, keysInStore: 1, openTasksWithoutKey: 0 })).toBe(1);
    expect(accountLotGrantable({ free: 3, keysInStore: 3, openTasksWithoutKey: 2 })).toBe(1);
    expect(accountLotGrantable({ free: 2, keysInStore: 1, openTasksWithoutKey: 3 })).toBe(0);
  });

  it('computes excess grantable = n - m - chargedExcess for a REQUEST lot (SPEC F11)', () => {
    expect(excessGrantableOf({ licenseCount: 3, beneficiaries: 1, chargedExcess: 0 })).toBe(2);
    expect(excessGrantableOf({ licenseCount: 3, beneficiaries: 1, chargedExcess: 2 })).toBe(0);
    expect(excessGrantableOf({ licenseCount: 2, beneficiaries: 3, chargedExcess: 0 })).toBe(0);
  });
});

describe('chooseAccountLot (W3-24 & F11)', () => {
  it('picks the request own REQUEST lot first even when an older OPENING lot exists', () => {
    const decision = chooseAccountLot({
      ownRequestId: 'req-1',
      lots: [
        candidate({ id: 'lot-opening', purchasedOn: '2027-01-01', purpose: 'OPENING' }),
        candidate({ id: 'lot-req', purchasedOn: '2027-04-01', purpose: 'REQUEST', requestId: 'req-1' }),
      ],
    });

    expect(decision.kind).toBe('SELECTED');
    if (decision.kind === 'SELECTED') expect(decision.lot.id).toBe('lot-req');
  });

  it('never falls back to another lot when the request own REQUEST lot is exhausted', () => {
    const decision = chooseAccountLot({
      ownRequestId: 'req-1',
      lots: [
        candidate({ id: 'lot-opening', purchasedOn: '2027-01-01', purpose: 'OPENING', free: 2, keysInStore: 2 }),
        candidate({
          id: 'lot-req',
          purchasedOn: '2027-04-01',
          purpose: 'REQUEST',
          requestId: 'req-1',
          free: 0,
          keysInStore: 0,
        }),
      ],
    });

    expect(decision.kind).toBe('NO_CAPACITY');
    if (decision.kind === 'NO_CAPACITY') {
      expect(decision.reason).toBe('OWN_LOT_EXHAUSTED');
      expect(decision.lot?.id).toBe('lot-req');
    }
  });

  it('picks oldest grantable lot by purchasedOn ASC, id ASC when request has no own REQUEST lot', () => {
    const decision = chooseAccountLot({
      ownRequestId: 'req-other',
      lots: [
        candidate({ id: 'lot-b', purchasedOn: '2027-01-05', free: 1, keysInStore: 1 }),
        candidate({ id: 'lot-a', purchasedOn: '2027-01-05', free: 1, keysInStore: 1 }),
        candidate({ id: 'lot-full', purchasedOn: '2027-01-01', free: 0, keysInStore: 0 }),
      ],
    });

    expect(decision.kind).toBe('SELECTED');
    if (decision.kind === 'SELECTED') expect(decision.lot.id).toBe('lot-a');
  });

  it('returns RESERVED_FOR_REQUEST (F11) when remaining free key is held for the lot owning request', () => {
    const decision = chooseAccountLot({
      ownRequestId: 'req-minh',
      lots: [
        candidate({
          id: 'lot-duc',
          purpose: 'REQUEST',
          requestId: 'req-duc',
          licenseCount: 3,
          beneficiaries: 1,
          chargedExcess: 2,
          free: 1,
          keysInStore: 1,
        }),
      ],
    });

    expect(decision.kind).toBe('RESERVED_FOR_REQUEST');
    if (decision.kind === 'RESERVED_FOR_REQUEST') expect(decision.lot.id).toBe('lot-duc');
  });

  it('SPEC F11: countOpenTasksByLot attributes unassigned tasks purely FIFO by (purchasedOn ASC, id ASC)', () => {
    const counts = countOpenTasksByLot(
      [
        {
          id: 'lot-req-a',
          purchasedOn: '2027-01-01',
          purpose: 'REQUEST',
          requestId: 'req-c',
          legacySubscriptionId: null,
          free: 3,
          keysInStore: 3,
        },
        {
          id: 'lot-req-b',
          purchasedOn: '2027-01-02',
          purpose: 'REQUEST',
          requestId: 'req-d',
          legacySubscriptionId: null,
          free: 3,
          keysInStore: 3,
        },
      ],
      [
        {
          taskId: 'task-1',
          requestId: 'req-other-1',
          subscriptionId: null,
          createdAt: new Date('2027-01-03T00:00:00Z'),
        },
        {
          taskId: 'task-2',
          requestId: 'req-other-2',
          subscriptionId: null,
          createdAt: new Date('2027-01-03T00:01:00Z'),
        },
      ],
    );

    expect(counts.get('lot-req-a')).toBe(2);
    expect(counts.get('lot-req-b')).toBe(0);
  });
});
