import {
  periodKeyOf,
  runningUncommittedByCostCenter,
  type RunningUncommittedPeriod,
  type RunningUncommittedSeat,
} from './running-uncommitted.policy';

const CC_TK = 'cc-tk';

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

describe('runningUncommittedByCostCenter prices a seat by the plan of the seat on its period', () => {
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
});
