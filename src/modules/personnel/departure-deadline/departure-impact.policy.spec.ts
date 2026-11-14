import { commitmentToRelease, rightToRevokeOf, type SeatFacts } from './departure-impact.policy';

describe('what goes back to the budget', () => {
  it('adds what is held by currency, in the order of the currency code, as strings, and leaves out what holds nothing', () => {
    expect(
      commitmentToRelease([
        { requestId: 'a', currency: 'VND', heldMinor: 5_000_000n },
        { requestId: 'b', currency: 'USD', heldMinor: 12_345n },
        { requestId: 'c', currency: 'VND', heldMinor: 2_500_000n },
        { requestId: 'd', currency: 'EUR', heldMinor: 0n },
      ]),
    ).toEqual([
      { currency: 'USD', amountMinor: '12345' },
      { currency: 'VND', amountMinor: '7500000' },
    ]);
  });

  it('is empty when nothing is held', () => {
    expect(commitmentToRelease([])).toEqual([]);
  });
});

describe('a seat the departure would take away', () => {
  const seat = (extra: Partial<SeatFacts> = {}): SeatFacts => ({
    assignmentId: 'asg-1',
    planId: 'plan-1',
    planName: 'Team',
    applicationId: 'app-1',
    applicationName: 'Figma',
    provisioningType: 'K2',
    revocationNote: null,
    dataLossOnRemoval: false,
    revocation: null,
    ...extra,
  });

  it('says what the seat is, how it is taken away and whether a task already works on it', () => {
    expect(rightToRevokeOf(seat({ dataLossOnRemoval: true, revocationNote: 'Export first' }))).toEqual({
      assignmentId: 'asg-1',
      application: { id: 'app-1', name: 'Figma' },
      plan: { id: 'plan-1', name: 'Team' },
      provisioningType: 'K2',
      revocable: true,
      dataLossOnRemoval: true,
      revocationNote: 'Export first',
      revocationUnderWay: false,
    });
    expect(rightToRevokeOf(seat({ revocation: { taskId: 't', status: 'QUEUED', source: 'DEPARTURE' } }))).toMatchObject(
      { revocationUnderWay: true },
    );
  });

  it.each([
    ['K1', true],
    ['K2', true],
    ['K4', true],
    ['K5', true],
    ['K3', false],
  ])('a seat of kind %s is revocable: %s', (provisioningType, revocable) => {
    expect(rightToRevokeOf(seat({ provisioningType })).revocable).toBe(revocable);
  });
});
