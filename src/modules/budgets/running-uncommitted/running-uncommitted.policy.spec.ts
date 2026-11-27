import type { BusinessDate } from '../../../core/business-date';
import {
  periodKeyOf,
  runningUncommittedByCostCenter,
  type RunningUncommittedCommitment,
  type RunningUncommittedPeriod,
  type RunningUncommittedSeat,
} from './running-uncommitted.policy';

const CC_TK = 'cc-tk';
const CC_KT = 'cc-kt';

const seat = (over: Partial<RunningUncommittedSeat> = {}): RunningUncommittedSeat => ({
  assignmentId: 'asg-1',
  subscriptionId: 'sub-1',
  planId: 'plan-1',
  requestId: null,
  source: 'BASELINE',
  costCenterId: CC_TK,
  heldFrom: '2026-01-01',
  heldUntil: null,
  ...over,
});

const period = (over: Partial<RunningUncommittedPeriod> = {}): RunningUncommittedPeriod => ({
  monthlyPriceMinor: 375_000n,
  startDate: '2027-01-01',
  ...over,
});

const months = (through: number): Set<number> => {
  const set = new Set<number>();
  for (let m = 1; m <= through; m += 1) set.add(m);
  return set;
};

describe('runningUncommittedByCostCenter (SPEC-B1 W3-08)', () => {
  it.each<{
    name: string;
    year: number;
    today: BusinessDate;
    seats: RunningUncommittedSeat[];
    periods: [string, RunningUncommittedPeriod][];
    commitments: [string, RunningUncommittedCommitment][];
    runs: [string, Set<number>][];
    expected: Record<string, bigint>;
  }>([
    {
      name: '1. 08/07/2027: 2 baseline Figma seats at 375.000, runs through month 6 -> 2 x 375.000 x 6 = 4.500.000',
      year: 2027,
      today: '2027-07-08',
      seats: [seat({ assignmentId: 'a1' }), seat({ assignmentId: 'a2' })],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period()]],
      commitments: [],
      runs: [['sub-1', months(6)]],
      expected: { [CC_TK]: 4_500_000n },
    },
    {
      name: '2. 01/08/2027 (B1-R12 boundary): July run not executed yet -> still 6 months = 4.500.000',
      year: 2027,
      today: '2027-08-01',
      seats: [seat({ assignmentId: 'a1' }), seat({ assignmentId: 'a2' })],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period()]],
      commitments: [],
      runs: [['sub-1', months(6)]],
      expected: { [CC_TK]: 4_500_000n },
    },
    {
      name: '3. 02/08/2027: July run completed on 01/08 -> 2 x 375.000 x 5 = 3.750.000',
      year: 2027,
      today: '2027-08-02',
      seats: [seat({ assignmentId: 'a1' }), seat({ assignmentId: 'a2' })],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period()]],
      commitments: [],
      runs: [['sub-1', months(7)]],
      expected: { [CC_TK]: 3_750_000n },
    },
    {
      name: '4. 08/07/2027: one seat open, one seat with last held day 15/10/2027 (heldUntil 16/10/2027) -> 375.000 x 6 + 375.000 x 4 = 3.750.000',
      year: 2027,
      today: '2027-07-08',
      seats: [seat({ assignmentId: 'a1' }), seat({ assignmentId: 'a2', heldUntil: '2027-10-16' })],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period()]],
      commitments: [],
      runs: [['sub-1', months(6)]],
      expected: { [CC_TK]: 3_750_000n },
    },
    {
      name: '5. 08/07/2027 (boundary): one seat with last held day 01/11/2027 (heldUntil 02/11/2027) counts full month 11 -> 375.000 x 6 + 375.000 x 5 = 4.125.000',
      year: 2027,
      today: '2027-07-08',
      seats: [seat({ assignmentId: 'a1' }), seat({ assignmentId: 'a2', heldUntil: '2027-11-02' })],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period()]],
      commitments: [],
      runs: [['sub-1', months(6)]],
      expected: { [CC_TK]: 4_125_000n },
    },
    {
      name: '6. 01/01/2028 (year 2028): 2 seats, no 2028 months charged yet -> 2 x 375.000 x 12 = 9.000.000',
      year: 2028,
      today: '2028-01-01',
      seats: [seat({ assignmentId: 'a1' }), seat({ assignmentId: 'a2' })],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period()]],
      commitments: [],
      runs: [],
      expected: { [CC_TK]: 9_000_000n },
    },
    {
      name: '7. 10/09/2027 (F7): new subscription from 01/09/2027 with 2 HANDOVER seats -> 2 x 375.000 x 4 (9..12) = 3.000.000',
      year: 2027,
      today: '2027-09-10',
      seats: [
        seat({ assignmentId: 'a1', source: 'HANDOVER', heldFrom: '2027-09-01' }),
        seat({ assignmentId: 'a2', source: 'HANDOVER', heldFrom: '2027-09-01' }),
      ],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period({ startDate: '2027-09-01' })]],
      commitments: [],
      runs: [],
      expected: { [CC_TK]: 3_000_000n },
    },
    {
      name: '8. 08/07/2027 (F7): renewal period starting 01/07/2027 with 2 seats -> 2 x 375.000 x 6 = 4.500.000',
      year: 2027,
      today: '2027-07-08',
      seats: [
        seat({ assignmentId: 'a1', source: 'RENEWAL_CARRY', heldFrom: '2027-07-01' }),
        seat({ assignmentId: 'a2', source: 'RENEWAL_CARRY', heldFrom: '2027-07-01' }),
      ],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period({ startDate: '2027-07-01' })]],
      commitments: [],
      runs: [],
      expected: { [CC_TK]: 4_500_000n },
    },
    {
      name: '9. 08/07/2027 (F7): no seats in months 2-3, seated again from 01/04, months 4-6 charged -> 6 months (7..12) = 4.500.000',
      year: 2027,
      today: '2027-07-08',
      seats: [
        seat({ assignmentId: 'a1', heldFrom: '2027-04-01' }),
        seat({ assignmentId: 'a2', heldFrom: '2027-04-01' }),
      ],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period({ startDate: '2027-01-01' })]],
      commitments: [],
      runs: [['sub-1', new Set([1, 4, 5, 6])]],
      expected: { [CC_TK]: 4_500_000n },
    },
    {
      name: '10a. 26/03/2027 (F15b): seat transferred to CC-TK 26/03 charges full month 3 (500.000) when March run not yet completed',
      year: 2027,
      today: '2027-03-26',
      seats: [
        seat({
          assignmentId: 'a1',
          source: 'REQUEST',
          requestId: 'req-1',
          heldFrom: '2027-01-01',
          heldUntil: '2027-04-01',
        }),
      ],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period({ monthlyPriceMinor: 500_000n, startDate: '2027-01-01' })]],
      commitments: [['req-1', { state: 'RELEASED', costCenterId: CC_KT }]],
      runs: [['sub-1', months(2)]],
      expected: { [CC_TK]: 500_000n },
    },
    {
      name: '10b. 26/03/2027 (F15b): seat with HELD commitment in own CC-TK excludes 500.000 -> 550.000 price increase from runningUncommitted',
      year: 2027,
      today: '2027-03-26',
      seats: [seat({ assignmentId: 'a1', source: 'REQUEST', requestId: 'req-1', heldFrom: '2027-01-01' })],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period({ monthlyPriceMinor: 550_000n, startDate: '2027-01-01' })]],
      commitments: [['req-1', { state: 'HELD', costCenterId: CC_TK }]],
      runs: [['sub-1', months(2)]],
      expected: {},
    },
    {
      name: '11. 08/07/2027: seat backed by Request with 2027 HELD commitment in CC-TK -> not counted (0)',
      year: 2027,
      today: '2027-07-08',
      seats: [seat({ assignmentId: 'a1', source: 'REQUEST', requestId: 'req-1' })],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period()]],
      commitments: [['req-1', { state: 'HELD', costCenterId: CC_TK }]],
      runs: [['sub-1', months(6)]],
      expected: {},
    },
    {
      name: '12. 08/07/2027: seat in transfer grace moved to CC-TK (commitment HELD in CC-KT) -> counted in CC-TK',
      year: 2027,
      today: '2027-07-08',
      seats: [seat({ assignmentId: 'a1', source: 'REQUEST', requestId: 'req-1', costCenterId: CC_TK })],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period()]],
      commitments: [['req-1', { state: 'HELD', costCenterId: CC_KT }]],
      runs: [['sub-1', months(6)]],
      expected: { [CC_TK]: 2_250_000n },
    },
    {
      name: '13. 08/07/2027: budget check base math integration fixture (2 uncommitted seats = 4.500.000 for CC-TK alongside MACHINE_ACCOUNT_CONVERSION)',
      year: 2027,
      today: '2027-07-08',
      seats: [
        seat({ assignmentId: 'a1', source: 'BASELINE' }),
        seat({ assignmentId: 'a2', source: 'MACHINE_ACCOUNT_CONVERSION' }),
      ],
      periods: [[periodKeyOf('sub-1', 'plan-1'), period()]],
      commitments: [],
      runs: [['sub-1', months(6)]],
      expected: { [CC_TK]: 4_500_000n },
    },
  ])('$name', ({ year, today, seats, periods, commitments, runs, expected }) => {
    const result = runningUncommittedByCostCenter({
      year,
      today,
      seats,
      periodBySubscriptionPlan: new Map(periods),
      commitmentByRequest: new Map(commitments),
      runMonthsBySubscription: new Map(runs),
    });

    expect(Object.fromEntries(result)).toEqual(expected);
  });

  describe('boundary and mutant-killer cases', () => {
    it('treats validUntil equal to 01/11/2027 as ending before November (last held day 31/10 -> 4 months 7..10)', () => {
      const result = runningUncommittedByCostCenter({
        year: 2027,
        today: '2027-07-08',
        seats: [seat({ heldUntil: '2027-11-01' })],
        periodBySubscriptionPlan: new Map([[periodKeyOf('sub-1', 'plan-1'), period()]]),
        commitmentByRequest: new Map(),
        runMonthsBySubscription: new Map([['sub-1', months(6)]]),
      });

      expect(result.get(CC_TK)).toBe(375_000n * 4n);
    });

    it('excludes seats not in force on today (heldFrom > today or heldUntil <= today) and seats without costCenterId', () => {
      const result = runningUncommittedByCostCenter({
        year: 2027,
        today: '2027-07-08',
        seats: [
          seat({ assignmentId: 'future', heldFrom: '2027-07-09' }),
          seat({ assignmentId: 'ended', heldUntil: '2027-07-08' }),
          seat({ assignmentId: 'no-cc', costCenterId: null }),
        ],
        periodBySubscriptionPlan: new Map([[periodKeyOf('sub-1', 'plan-1'), period()]]),
        commitmentByRequest: new Map(),
        runMonthsBySubscription: new Map([['sub-1', months(6)]]),
      });

      expect(result.size).toBe(0);
    });

    it('returns empty map when requested year is in the past or more than one year ahead', () => {
      for (const year of [2026, 2029]) {
        const result = runningUncommittedByCostCenter({
          year,
          today: '2027-07-08',
          seats: [seat()],
          periodBySubscriptionPlan: new Map([[periodKeyOf('sub-1', 'plan-1'), period()]]),
          commitmentByRequest: new Map(),
          runMonthsBySubscription: new Map(),
        });

        expect(result.size).toBe(0);
      }
    });

    it('FIX-B1 F7 (D-10): computes next-year (Y+1) runningUncommitted for active seats (open=12m, end 31/03 next year=3m)', () => {
      const result = runningUncommittedByCostCenter({
        year: 2028,
        today: '2027-07-08',
        seats: [
          seat({ assignmentId: 'open', costCenterId: CC_TK, heldFrom: '2027-01-01', heldUntil: null }),
          seat({ assignmentId: 'ends-mar', costCenterId: CC_KT, heldFrom: '2027-01-01', heldUntil: '2028-04-01' }),
          seat({
            assignmentId: 'ends-this-year',
            costCenterId: CC_KT,
            heldFrom: '2027-01-01',
            heldUntil: '2027-12-31',
          }),
        ],
        periodBySubscriptionPlan: new Map([
          [periodKeyOf('sub-1', 'plan-1'), period({ monthlyPriceMinor: 500_000n, startDate: '2027-01-01' })],
        ]),
        commitmentByRequest: new Map(),
        runMonthsBySubscription: new Map(),
      });

      expect(result.get(CC_TK)).toBe(6_000_000n);
      expect(result.get(CC_KT)).toBe(1_500_000n);
    });

    it('clamps heldUntil past year-end (e.g. 2028-03-01) to month 12 of the requested year', () => {
      const result = runningUncommittedByCostCenter({
        year: 2027,
        today: '2027-07-08',
        seats: [seat({ heldUntil: '2028-03-01' })],
        periodBySubscriptionPlan: new Map([[periodKeyOf('sub-1', 'plan-1'), period()]]),
        commitmentByRequest: new Map(),
        runMonthsBySubscription: new Map([['sub-1', months(6)]]),
      });

      expect(result.get(CC_TK)).toBe(375_000n * 6n);
    });

    it('ignores subscriptions without monthlyPriceMinor or with non-positive monthlyPriceMinor', () => {
      const result = runningUncommittedByCostCenter({
        year: 2027,
        today: '2027-07-08',
        seats: [seat({ subscriptionId: 'no-price' })],
        periodBySubscriptionPlan: new Map([[periodKeyOf('no-price', 'plan-1'), period({ monthlyPriceMinor: null })]]),
        commitmentByRequest: new Map(),
        runMonthsBySubscription: new Map(),
      });

      expect(result.size).toBe(0);
    });

    it('prices each seat of a period with two plans at the price of its own plan (2 x 375.000 x 6 and 800.000 x 6)', () => {
      const result = runningUncommittedByCostCenter({
        year: 2027,
        today: '2027-07-08',
        seats: [
          seat({ assignmentId: 'a1', planId: 'standard' }),
          seat({ assignmentId: 'a2', planId: 'standard' }),
          seat({ assignmentId: 'a3', planId: 'premium' }),
        ],
        periodBySubscriptionPlan: new Map([
          [periodKeyOf('sub-1', 'standard'), period({ monthlyPriceMinor: 375_000n })],
          [periodKeyOf('sub-1', 'premium'), period({ monthlyPriceMinor: 800_000n })],
        ]),
        commitmentByRequest: new Map(),
        runMonthsBySubscription: new Map([['sub-1', months(6)]]),
      });

      expect(result.get(CC_TK)).toBe(4_500_000n + 4_800_000n);
    });

    it('counts no cost for a seat whose plan has no price on its period', () => {
      const result = runningUncommittedByCostCenter({
        year: 2027,
        today: '2027-07-08',
        seats: [seat({ planId: 'premium' })],
        periodBySubscriptionPlan: new Map([[periodKeyOf('sub-1', 'standard'), period()]]),
        commitmentByRequest: new Map(),
        runMonthsBySubscription: new Map(),
      });

      expect(result.size).toBe(0);
    });

    it('FIX-W3 B-2: skips seats belonging to exceptRequestIds while keeping other uncommitted seats', () => {
      const result = runningUncommittedByCostCenter({
        year: 2028,
        today: '2027-11-15',
        seats: [
          seat({ assignmentId: 'a-kept', source: 'REQUEST', requestId: 'req-kept' }),
          seat({ assignmentId: 'a-other', source: 'REQUEST', requestId: 'req-other' }),
        ],
        periodBySubscriptionPlan: new Map([
          [periodKeyOf('sub-1', 'plan-1'), period({ monthlyPriceMinor: 400_000n, startDate: '2027-01-01' })],
        ]),
        commitmentByRequest: new Map(),
        runMonthsBySubscription: new Map(),
        exceptRequestIds: new Set(['req-kept']),
      });

      expect(result.get(CC_TK)).toBe(4_800_000n);
    });

    it('W3-08 & B1-R12: counts open seats from max(heldFrom, periodStartDate, yearStart) without clamping by placement date (transferred Cost Center)', () => {
      const result = runningUncommittedByCostCenter({
        year: 2027,
        today: '2027-11-26',
        seats: [
          seat({
            assignmentId: 'a-k2-moved',
            heldFrom: '2027-07-01',
            heldUntil: null,
          }),
        ],
        k1UnrequestedSeats: [
          {
            assignmentId: 'a-k1-moved',
            planId: 'plan-k1',
            costCenterId: CC_TK,
            heldFrom: '2027-07-01',
            heldUntil: null,
            billingAnchorOn: null,
          },
        ],
        k1ReferencePriceByPlan: new Map([['plan-k1', 200_000n]]),
        periodBySubscriptionPlan: new Map([
          [periodKeyOf('sub-1', 'plan-1'), period({ monthlyPriceMinor: 375_000n, startDate: '2027-07-01' })],
        ]),
        commitmentByRequest: new Map(),
        runMonthsBySubscription: new Map(),
      });

      // K2 counts un-run Jul..Dec (6 months); unrequested K1 counts from today's month Nov..Dec (2 months).
      expect(result.get(CC_TK)).toBe(375_000n * 6n + 200_000n * 2n);
    });
  });
});
