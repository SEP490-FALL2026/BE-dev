import {
  allocateEvenly,
  lineAmountsOf,
  scaledPricing,
  scaleAmount,
  shareToRelease,
  sharesOf,
} from './line-allocation.policy';

const sum = (values: readonly bigint[]) => values.reduce((total, value) => total + value, 0n);

describe('dividing the cost of a year among the people of a group (US-05-17 AC-9)', () => {
  it('gives each person the same when it divides', () => {
    expect(allocateEvenly(7_200n, 4)).toEqual([1_800n, 1_800n, 1_800n, 1_800n]);
  });

  it('gives the remainder one minor unit at a time to the first people, in the order they are named', () => {
    expect(allocateEvenly(10n, 4)).toEqual([3n, 3n, 2n, 2n]);
    expect(allocateEvenly(11n, 3)).toEqual([4n, 4n, 3n]);
    expect(allocateEvenly(1n, 3)).toEqual([1n, 0n, 0n]);
  });

  it.each([
    [0n, 1],
    [1n, 1],
    [999n, 7],
    [1_000_000_007n, 10],
    [3n, 100],
  ])('always adds up to the cost exactly (%s among %s people), with shares at most one apart', (total, people) => {
    const shares = allocateEvenly(total, people);

    expect(shares).toHaveLength(people);
    expect(sum(shares)).toBe(total);
    expect(shares.every((share) => share >= 0n)).toBe(true);
    expect(shares[0] - shares[shares.length - 1]).toBeLessThanOrEqual(1n);
  });

  it('refuses nobody to divide among and a negative cost', () => {
    expect(() => allocateEvenly(10n, 0)).toThrow();
    expect(() => allocateEvenly(-1n, 2)).toThrow();
  });

  it('gives a person their share of every year, and nothing for a year whose part rounds to nothing', () => {
    const costs = [
      { year: 2026, amountMinor: 10n },
      { year: 2027, amountMinor: 1n },
    ];

    expect(sharesOf(costs, 4, 0)).toEqual([
      { year: 2026, amountMinor: 3n },
      { year: 2027, amountMinor: 1n },
    ]);
    expect(sharesOf(costs, 4, 3)).toEqual([{ year: 2026, amountMinor: 2n }]);
  });

  it('adds the shares of all the people of a year up to the commitment of the year', () => {
    const costs = [
      { year: 2026, amountMinor: 123_457n },
      { year: 2027, amountMinor: 8n },
    ];
    const people = 6;
    const all = Array.from({ length: people }, (_, index) => sharesOf(costs, people, index)).flat();

    for (const cost of costs) {
      expect(sum(all.filter((share) => share.year === cost.year).map((share) => share.amountMinor))).toBe(
        cost.amountMinor,
      );
    }
  });
});

describe('the amount of a request for the people that stay (US-06-14 AC-13, US-05-17 AC-9)', () => {
  it('is the same share of the amount for fewer people', () => {
    expect(scaleAmount(225n, 5, 4)).toBe(180n);
  });

  it('is the same amount for the same people', () => {
    expect(scaleAmount(225n, 5, 5)).toBe(225n);
  });

  it('rounds a part of a minor unit up: a price that does not divide is paid in full (TẠM CHỌN)', () => {
    expect(scaleAmount(74n, 5, 4)).toBe(60n);
    expect(scaleAmount(75n, 4, 3)).toBe(57n);
  });

  it('is nothing for no people or for more people than it was made for', () => {
    expect(scaleAmount(225n, 5, 0)).toBeNull();
    expect(scaleAmount(225n, 5, 6)).toBeNull();
  });
});

describe('what goes back when one person leaves a request (US-05-17 AC-10)', () => {
  it('is what they held and had not given back', () => {
    const shares = [
      { budgetYear: 2026, amountMinor: 3n, held: true, releasedAt: null },
      { budgetYear: 2027, amountMinor: 1n, held: true, releasedAt: null },
      { budgetYear: 2028, amountMinor: 9n, held: true, releasedAt: new Date('2026-10-24T00:00:00Z') },
    ];

    expect(shareToRelease(shares)).toEqual([
      { year: 2026, amountMinor: 3n },
      { year: 2027, amountMinor: 1n },
    ]);
    expect(shareToRelease([])).toEqual([]);
  });

  it('QĐ-111k: never includes the part of the year after that is only kept for 01/01: no commitment holds it yet', () => {
    const shares = [
      { budgetYear: 2026, amountMinor: 1_200_000n, held: true, releasedAt: null },
      { budgetYear: 2027, amountMinor: 4_200_000n, held: false, releasedAt: null },
    ];

    expect(shareToRelease(shares)).toEqual([{ year: 2026, amountMinor: 1_200_000n }]);
  });
});

describe('what each person of a group costs this year and the year after, each for their own end (QĐ-111j, QĐ-111k, R-38)', () => {
  const monthly = (amountMinor: bigint) => ({
    unitPrice: { amountMinor, currency: 'VND' },
    billingCycle: 'MONTHLY' as const,
    checkDate: '2026-11-10',
  });

  it('prices a person cut at the end of a contract for their own months and the others for theirs: 600.000 a month, K1 of 9 months from 10/11/2026', () => {
    // A term of 9 months from 10/11 ends 09/08/2027; the intern's contract ends 31/01/2027.
    const amounts = lineAmountsOf({ ...monthly(600_000n), ends: ['2027-08-09', '2027-01-31', '2027-08-09'] });

    expect(amounts).toEqual([
      { current: 1_200_000n, next: 4_200_000n },
      { current: 1_200_000n, next: 600_000n },
      { current: 1_200_000n, next: 4_200_000n },
    ]);
  });

  it('prices a right with no end for twelve months of the year after, and a person cut inside the year for nothing of it', () => {
    expect(lineAmountsOf({ ...monthly(375_000n), ends: [null, '2026-12-05'] })).toEqual([
      { current: 750_000n, next: 4_500_000n },
      { current: 375_000n, next: 0n },
    ]);
  });

  it('divides what people who end the same day cost among them, the remainder to the first, so the parts add up to what they cost together', () => {
    // 1 000 a year, three people for one month: 1 000 / 12 over three people is 250 together, not 84 each.
    const amounts = lineAmountsOf({
      unitPrice: { amountMinor: 1_000n, currency: 'VND' },
      billingCycle: 'ANNUAL',
      checkDate: '2026-12-01',
      ends: ['2026-12-31', '2026-12-31', '2026-12-31'],
    });

    expect(amounts?.map((line) => line.current)).toEqual([84n, 83n, 83n]);
  });

  it('is nothing when the price cannot be counted by the month', () => {
    expect(lineAmountsOf({ ...monthly(1_000n), billingCycle: 'OTHER', ends: [null] })).toBeNull();
  });

  it('uses calendar months for K2 and stored monthlyPriceMinor instead of ceilDiv on ANNUAL unitPrice', () => {
    // 2027-11-15 -> 2028-02-10: K2 counts 2 calendar months in 2027 (11-12) and 2 calendar months in 2028 (1-2).
    expect(
      lineAmountsOf({
        provisioningType: 'K2',
        unitPrice: { amountMinor: 500_000n, currency: 'VND' },
        monthlyPriceMinor: 500_000n,
        billingCycle: 'MONTHLY',
        checkDate: '2027-11-15',
        ends: ['2028-02-10'],
      }),
    ).toEqual([{ current: 1_000_000n, next: 1_000_000n }]);

    // ANNUAL 1,000,001 with stored monthlyPriceMinor = 83,333 (not ceilDiv 83,334).
    expect(
      lineAmountsOf({
        provisioningType: 'K2',
        unitPrice: { amountMinor: 1_000_001n, currency: 'VND' },
        monthlyPriceMinor: 83_333n,
        billingCycle: 'ANNUAL',
        checkDate: '2027-11-15',
        ends: ['2028-02-10'],
      }),
    ).toEqual([{ current: 166_666n, next: 166_666n }]);
  });
});

describe('what a request for a group costs once only the people approved are left (US-05-17 AC-9, US-06-01 AC-15)', () => {
  const pricing = { amount: { amountMinor: 900n, currency: 'VND' } };

  it('scales the amount to the people who remain, in the currency of the price', () => {
    expect(scaledPricing(pricing, 3, 2)).toEqual({ amount: { amountMinor: 600n, currency: 'VND' } });
  });

  it('changes nothing when everybody is approved or when there is no amount', () => {
    expect(scaledPricing(pricing, 3, 3)).toBeNull();
    expect(scaledPricing({ amount: null }, 3, 2)).toBeNull();
  });
});
