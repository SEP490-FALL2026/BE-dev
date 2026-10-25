import type { PaymentPeriod } from '../access-request/pricing.policy';
import { allocateEvenly, scaleSchedule, shareToRelease, sharesOf } from './line-allocation.policy';

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

describe('the payments of a request for the people that stay (US-06-14 AC-13, US-05-17 AC-9)', () => {
  const period = (dueOn: string, amountMinor: bigint, budgetYear = 2026): PaymentPeriod => ({
    dueOn,
    amountMinor,
    budgetYear,
    binding: true,
  });
  const schedule = [period('2026-11-01', 75n), period('2026-12-01', 75n), period('2027-01-01', 75n, 2027)];

  it('lays the payments out for fewer people, in whole minor units, keeping the days, years and whether they bind', () => {
    expect(scaleSchedule(schedule, 5, 4)).toEqual([
      period('2026-11-01', 60n),
      period('2026-12-01', 60n),
      period('2027-01-01', 60n, 2027),
    ]);
  });

  it('is the same schedule for the same people', () => {
    expect(scaleSchedule(schedule, 5, 5)).toEqual(schedule);
  });

  it('is nothing when the payments do not divide: they were not made for that many people', () => {
    expect(scaleSchedule([period('2026-11-01', 74n)], 5, 4)).toBeNull();
  });

  it('is nothing for no people or for more people than it was made for', () => {
    expect(scaleSchedule(schedule, 5, 0)).toBeNull();
    expect(scaleSchedule(schedule, 5, 6)).toBeNull();
  });
});

describe('what goes back when one person leaves a request (US-05-17 AC-10)', () => {
  it('is what they held and had not given back', () => {
    const shares = [
      { budgetYear: 2026, amountMinor: 3n, releasedAt: null },
      { budgetYear: 2027, amountMinor: 1n, releasedAt: null },
      { budgetYear: 2028, amountMinor: 9n, releasedAt: new Date('2026-10-24T00:00:00Z') },
    ];

    expect(shareToRelease(shares)).toEqual([
      { year: 2026, amountMinor: 3n },
      { year: 2027, amountMinor: 1n },
    ]);
    expect(shareToRelease([])).toEqual([]);
  });
});
