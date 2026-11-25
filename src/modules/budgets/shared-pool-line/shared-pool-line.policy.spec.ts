import {
  daysPaidOf,
  heldSeatDaysOf,
  isEligiblePoolPeriod,
  isPoolOverReserve,
  poolPeriodMonthCost,
  unallocatedMinorOf,
  type HeldSeatInterval,
  type PoolPeriodSpec,
} from './shared-pool-line.policy';
import { roundHalfAway, seatHeldRange } from '../../../core/seat-month-cost';

const basePeriod = (extra: Partial<PoolPeriodSpec> = {}): PoolPeriodSpec => ({
  subscriptionId: 'sub-1',
  purchasedQuantity: 10,
  monthlyPriceMinor: 500_000n,
  startDate: '2026-07-01',
  endExclusive: '2027-07-01',
  ...extra,
});

const seats = (entries: Array<[number, string, string | null]>): HeldSeatInterval[] =>
  entries.flatMap(([count, heldFrom, heldUntil]) => Array.from({ length: count }, () => ({ heldFrom, heldUntil })));

describe('shared-pool-line.policy: W3-04 idle cost & pool reserve boundaries', () => {
  it.each<{
    name: string;
    month: string;
    period: PoolPeriodSpec;
    held: HeldSeatInterval[];
    expectedPaid: bigint | null;
    expectedIdle: bigint | null;
    expectedFlags: string[];
  }>([
    {
      name: 'case 1: 11/2026 (30d), 500k, q=10, 4+3 full + 1 from 16/11 -> 1.250.000',
      month: '2026-11-01',
      period: basePeriod(),
      held: seats([
        [7, '2026-11-01', null],
        [1, '2026-11-16', null],
      ]),
      expectedPaid: 5_000_000n,
      expectedIdle: 1_250_000n,
      expectedFlags: [],
    },
    {
      name: 'case 2: 01/2027 (31d), 500k, q=12, 10 full + 2 revoked 15/01 -> 548.387 (half-away-from-zero, not ceil)',
      month: '2027-01-01',
      period: basePeriod({ purchasedQuantity: 12 }),
      held: seats([
        [10, '2026-07-01', null],
        [2, '2026-07-01', '2027-01-15'],
      ]),
      expectedPaid: 6_000_000n,
      expectedIdle: 548_387n,
      expectedFlags: [],
    },
    {
      name: 'case 3: 02/2027 (28d), 500k, q=12, 10 full -> 1.000.000',
      month: '2027-02-01',
      period: basePeriod({ purchasedQuantity: 12 }),
      held: seats([[10, '2026-07-01', null]]),
      expectedPaid: 6_000_000n,
      expectedIdle: 1_000_000n,
      expectedFlags: [],
    },
    {
      name: 'case 4: 02/2027 (28d), q=10, 11 full -> clamped 0 (never negative)',
      month: '2027-02-01',
      period: basePeriod({ purchasedQuantity: 10 }),
      held: seats([[11, '2027-02-01', null]]),
      expectedPaid: 5_000_000n,
      expectedIdle: 0n,
      expectedFlags: [],
    },
    {
      name: 'case 5a: period ending 30/06/2027 (endExclusive 01/07/2027) counts 0 days in July 2027',
      month: '2027-07-01',
      period: basePeriod({ purchasedQuantity: 12, startDate: '2026-07-01', endExclusive: '2027-07-01' }),
      held: [],
      expectedPaid: 0n,
      expectedIdle: 0n,
      expectedFlags: [],
    },
    {
      name: 'case 5b: successor period starting 01/07/2027 (q=11) counts 0 days in June 2027 and full 31 days in July',
      month: '2027-06-01',
      period: basePeriod({ purchasedQuantity: 11, startDate: '2027-07-01', endExclusive: '2028-07-01' }),
      held: [],
      expectedPaid: 0n,
      expectedIdle: 0n,
      expectedFlags: [],
    },
    {
      name: 'case 6: NO_PRICE when monthlyPriceMinor is null -> idleCost null + NO_PRICE flag',
      month: '2026-11-01',
      period: basePeriod({ monthlyPriceMinor: null }),
      held: seats([[7, '2026-11-01', null]]),
      expectedPaid: null,
      expectedIdle: null,
      expectedFlags: ['NO_PRICE'],
    },
    {
      name: 'case 7: NO_QUANTITY when purchasedQuantity is null -> idleCost null + NO_QUANTITY flag',
      month: '2026-11-01',
      period: basePeriod({ purchasedQuantity: null }),
      held: seats([[7, '2026-11-01', null]]),
      expectedPaid: null,
      expectedIdle: null,
      expectedFlags: ['NO_QUANTITY'],
    },
  ])('$name', ({ month, period, held, expectedPaid, expectedIdle, expectedFlags }) => {
    const res = poolPeriodMonthCost(period, held, month);

    expect(res.paidMinor).toBe(expectedPaid);
    expect(res.idleCostMinor).toBe(expectedIdle);
    expect(res.flags).toEqual(expectedFlags);
  });

  it('case 5b cont: successor period starting 01/07/2027 charges 31 days in July 2027', () => {
    const next = basePeriod({ purchasedQuantity: 11, startDate: '2027-07-01', endExclusive: '2028-07-01' });
    expect(daysPaidOf(next.startDate, next.endExclusive, '2027-07-01')).toBe(31);
    const res = poolPeriodMonthCost(next, seats([[10, '2027-07-01', null]]), '2027-07-01');
    expect(res.paidMinor).toBe(5_500_000n);
    expect(res.idleCostMinor).toBe(500_000n);
  });

  it('case 8: filters out DRAFT, non-K2, non-TERM, or periods with neither seats nor prior runs', () => {
    expect(isEligiblePoolPeriod({ status: 'DRAFT', kind: 'TERM', provisioningType: 'K2', hasSeatOrRun: true })).toBe(
      false,
    );
    expect(
      isEligiblePoolPeriod({ status: 'ACTIVE', kind: 'PERPETUAL', provisioningType: 'K2', hasSeatOrRun: true }),
    ).toBe(false);
    expect(isEligiblePoolPeriod({ status: 'ACTIVE', kind: 'TERM', provisioningType: 'K1', hasSeatOrRun: true })).toBe(
      false,
    );
    expect(isEligiblePoolPeriod({ status: 'ACTIVE', kind: 'TERM', provisioningType: 'K2', hasSeatOrRun: false })).toBe(
      false,
    );
    expect(isEligiblePoolPeriod({ status: 'ACTIVE', kind: 'TERM', provisioningType: 'K2', hasSeatOrRun: true })).toBe(
      true,
    );
  });

  it.each([
    {
      name: 'case 9: 8.1M + 900k = 9.0M vs 12M reserve -> false',
      idle: 8_100_000n,
      variance: 900_000n,
      reserve: 12_000_000n,
      expected: false,
    },
    {
      name: 'case 10: 8.1M + 3.9M = 12.0M exact boundary vs 12M reserve -> false (kills >=)',
      idle: 8_100_000n,
      variance: 3_900_000n,
      reserve: 12_000_000n,
      expected: false,
    },
    {
      name: 'case 11: 8.1M + 4.0M = 12.1M vs 12M reserve -> true',
      idle: 8_100_000n,
      variance: 4_000_000n,
      reserve: 12_000_000n,
      expected: true,
    },
    { name: 'null reserve -> null', idle: 8_100_000n, variance: 4_000_000n, reserve: null, expected: null },
  ])('$name', ({ idle, variance, reserve, expected }) => {
    expect(isPoolOverReserve(idle + variance, reserve)).toBe(expected);
  });

  it('satisfies warehouse identity: dept seat-months + no-dept held cost + idleCost == paidCost (11/2026 case)', () => {
    const month = '2026-11-01';
    const price = 500_000n;
    const fullSeatRange = seatHeldRange({ validFrom: '2026-11-01', grantedOn: null, validUntil: null });
    const halfSeatRange = seatHeldRange({ validFrom: '2026-11-16', grantedOn: null, validUntil: null });
    expect(fullSeatRange).not.toBeNull();
    expect(halfSeatRange).not.toBeNull();
    const allSeats = [
      ...seats([
        [4, fullSeatRange!.from, fullSeatRange!.until],
        [3, fullSeatRange!.from, fullSeatRange!.until],
      ]),
      { heldFrom: halfSeatRange!.from, heldUntil: halfSeatRange!.until },
    ];
    const deptTotal = 7n * roundHalfAway(30n * price, 30n);
    const noDeptCost = roundHalfAway(15n * price, 30n);
    const cost = poolPeriodMonthCost(basePeriod({ monthlyPriceMinor: price }), allSeats, month);

    expect(heldSeatDaysOf(allSeats, month)).toBe(225n);
    expect(deptTotal + noDeptCost + (cost.idleCostMinor as bigint)).toBe(cost.paidMinor);
    expect(
      unallocatedMinorOf({
        idleCostMinor: cost.idleCostMinor,
        invoicedMinor: 0n,
        allocatedMinor: deptTotal,
      }),
    ).toBe(cost.idleCostMinor);
  });

  it('FIX-B1 F4 (B-I1): contributes 0n for null idleCostMinor instead of invoiced - allocated fallback', () => {
    expect(
      unallocatedMinorOf({
        idleCostMinor: null,
        invoicedMinor: 10_000_000n,
        allocatedMinor: 0n,
        invoiceVarianceMinor: 10_000_000n,
      }),
    ).toBe(10_000_000n);

    expect(
      unallocatedMinorOf({
        idleCostMinor: null,
        invoicedMinor: 1_000_000n,
        allocatedMinor: 300_000n,
        invoiceVarianceMinor: 200_000n,
        invoiceVarianceInReviewMinor: 50_000n,
      }),
    ).toBe(250_000n);
  });
});
