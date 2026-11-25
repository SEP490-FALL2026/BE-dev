import { runningUncommittedWithFlagsByCostCenter } from './running-uncommitted.policy';

const CC_TK = 'cc-tk';
const CC_KT = 'cc-kt';

describe('runningUncommittedWithFlagsByCostCenter K-A2 (unrequested K1 rights)', () => {
  it('adds referencePrice × remaining months in year for 20/07/2027 (6m => 3.000.000) and 01/12/2027 (1m => 500.000)', () => {
    const k1Seat = {
      assignmentId: 'k1-base-1',
      planId: 'plan-k1',
      costCenterId: CC_TK,
      heldFrom: '2027-01-01',
      heldUntil: null,
      billingAnchorOn: '2027-01-01',
    };
    const jul20 = runningUncommittedWithFlagsByCostCenter({
      year: 2027,
      today: '2027-07-20',
      seats: [],
      periodBySubscription: new Map(),
      commitmentByRequest: new Map(),
      runMonthsBySubscription: new Map(),
      k1UnrequestedSeats: [k1Seat],
      k1ReferencePriceByPlan: new Map([['plan-k1', 500_000n]]),
    });
    expect(jul20.totals.get(CC_TK)).toBe(3_000_000n);
    expect(jul20.flagsByCostCenter.size).toBe(0);

    const dec01 = runningUncommittedWithFlagsByCostCenter({
      year: 2027,
      today: '2027-12-01',
      seats: [],
      periodBySubscription: new Map(),
      commitmentByRequest: new Map(),
      runMonthsBySubscription: new Map(),
      k1UnrequestedSeats: [k1Seat],
      k1ReferencePriceByPlan: new Map([['plan-k1', 500_000n]]),
    });
    expect(dec01.totals.get(CC_TK)).toBe(500_000n);
    expect(dec01.flagsByCostCenter.size).toBe(0);
  });

  it('emits 0 + NO_PRICE flag when K1 unrequested plan lacks reference price (K-A2, D-17)', () => {
    const res = runningUncommittedWithFlagsByCostCenter({
      year: 2027,
      today: '2027-07-20',
      seats: [],
      periodBySubscription: new Map(),
      commitmentByRequest: new Map(),
      runMonthsBySubscription: new Map(),
      k1UnrequestedSeats: [
        {
          assignmentId: 'k1-noprice',
          planId: 'plan-k1-missing',
          costCenterId: CC_KT,
          heldFrom: '2027-01-01',
          heldUntil: null,
          billingAnchorOn: null,
        },
      ],
      k1ReferencePriceByPlan: new Map([['plan-k1-missing', null]]),
    });

    expect(res.totals.get(CC_KT) ?? 0n).toBe(0n);
    expect(res.flagsByCostCenter.get(CC_KT)).toEqual([
      { code: 'NO_PRICE', planId: 'plan-k1-missing', assignmentId: 'k1-noprice' },
    ]);
  });

  it('respects heldUntil boundary (exclusive) when counting remaining months in year', () => {
    const res = runningUncommittedWithFlagsByCostCenter({
      year: 2027,
      today: '2027-07-20',
      seats: [],
      periodBySubscription: new Map(),
      commitmentByRequest: new Map(),
      runMonthsBySubscription: new Map(),
      k1UnrequestedSeats: [
        {
          assignmentId: 'k1-ending',
          planId: 'plan-k1',
          costCenterId: CC_TK,
          heldFrom: '2027-01-01',
          heldUntil: '2027-10-01',
          billingAnchorOn: '2027-01-01',
        },
      ],
      k1ReferencePriceByPlan: new Map([['plan-k1', 500_000n]]),
    });

    expect(res.totals.get(CC_TK)).toBe(1_500_000n);
  });
});
