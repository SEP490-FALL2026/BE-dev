import { addDays, monthBoundsOf, type BusinessDate } from '../../../../core/business-date';
import { accumulateKpi4Months, lineMonthKpi4, missedIdleOfDay, missedSeatsOf } from './kpi-missed-adjustment.policy';

const dailyMap = (
  from: BusinessDate,
  untilExclusive: BusinessDate,
  qtyOnDay: (day: BusinessDate) => number,
): Map<BusinessDate, number> => {
  const map = new Map<BusinessDate, number>();
  for (let d = from; d < untilExclusive; d = addDays(d, 1)) {
    map.set(d, qtyOnDay(d));
  }

  return map;
};

const seats = (entries: Array<[number, BusinessDate, BusinessDate | null]>) =>
  entries.flatMap(([count, heldFrom, heldUntil]) => Array.from({ length: count }, () => ({ heldFrom, heldUntil })));

describe('kpi-missed-adjustment.policy: W3-22 KPI-4 & missed adjustment seats', () => {
  it.each([
    {
      name: 'FIXED with seatsAtStart > priorTarget: 12 - 11 = 1 missed seat',
      seatCounting: 'FIXED' as const,
      seatsAtPeriodStart: 12,
      priorLockedTarget: 11,
      expected: 1,
    },
    {
      name: 'FIXED with seatsAtStart === priorTarget: 0 missed seats (boundary)',
      seatCounting: 'FIXED' as const,
      seatsAtPeriodStart: 11,
      priorLockedTarget: 11,
      expected: 0,
    },
    {
      name: 'FIXED with seatsAtStart < priorTarget: clamped to 0',
      seatCounting: 'FIXED' as const,
      seatsAtPeriodStart: 9,
      priorLockedTarget: 11,
      expected: 0,
    },
    {
      name: 'FIXED without priorLockedTarget (first period or legacy): 0',
      seatCounting: 'FIXED' as const,
      seatsAtPeriodStart: 12,
      priorLockedTarget: null,
      expected: 0,
    },
    {
      name: 'MEMBERS subscription never records missed adjustment seats even when seats > target',
      seatCounting: 'MEMBERS' as const,
      seatsAtPeriodStart: 12,
      priorLockedTarget: 10,
      expected: 0,
    },
  ])('$name', ({ seatCounting, seatsAtPeriodStart, priorLockedTarget, expected }) => {
    expect(missedSeatsOf({ seatCounting, seatsAtPeriodStart, priorLockedTarget })).toBe(expected);
  });

  it('caps missedIdleOfDay at min(idleSeats, missedSeats) and never goes below 0', () => {
    expect(missedIdleOfDay(3, 1)).toBe(1);
    expect(missedIdleOfDay(1, 2)).toBe(1);
    expect(missedIdleOfDay(0, 2)).toBe(0);
    expect(missedIdleOfDay(-1, 2)).toBe(0);
  });

  it.each<{
    name: string;
    seatCounting: 'FIXED' | 'MEMBERS';
    seatsAtStart: number;
    priorTarget: number;
    monthlyPrice: bigint;
    startDate: BusinessDate;
    endExclusive: BusinessDate;
    months: BusinessDate[];
    held: Array<{ heldFrom: BusinessDate; heldUntil: BusinessDate | null }>;
    expectedPerMonth: Array<{ month: BusinessDate; seatMonths: number; amountMinor: bigint }>;
    expectedTotalSeatMonths: number;
    expectedTotalAmountMinor: bigint;
  }>([
    {
      name: 'W3-22 Ca B 2A: missed 1, idle seat re-granted 16/09/2027 -> Jul 1 + Aug 1 + Sep 0.5 = 2.5 seat-months = 1.250.000',
      seatCounting: 'FIXED',
      seatsAtStart: 12,
      priorTarget: 11,
      monthlyPrice: 500_000n,
      startDate: '2027-07-01',
      endExclusive: '2028-07-01',
      months: ['2027-07-01', '2027-08-01', '2027-09-01'],
      held: [...seats([[11, '2027-07-01', null]]), ...seats([[1, '2027-09-16', null]])],
      expectedPerMonth: [
        { month: '2027-07-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2027-08-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2027-09-01', seatMonths: 0.5, amountMinor: 250_000n },
      ],
      expectedTotalSeatMonths: 2.5,
      expectedTotalAmountMinor: 1_250_000n,
    },
    {
      name: 'W3-22 R-LATE: 12 seats, locked target 11, missed seat idle 01/07..31/08/2027 -> Jul 1 + Aug 1 = 2 seat-months = 1.000.000',
      seatCounting: 'FIXED',
      seatsAtStart: 12,
      priorTarget: 11,
      monthlyPrice: 500_000n,
      startDate: '2027-07-01',
      endExclusive: '2028-07-01',
      months: ['2027-07-01', '2027-08-01', '2027-09-01'],
      held: [...seats([[11, '2027-07-01', null]]), ...seats([[1, '2027-09-01', null]])],
      expectedPerMonth: [
        { month: '2027-07-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2027-08-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2027-09-01', seatMonths: 0, amountMinor: 0n },
      ],
      expectedTotalSeatMonths: 2,
      expectedTotalAmountMinor: 1_000_000n,
    },
    {
      name: 'W3-22 W1c: missed 2, one re-granted 01/10/2027 across 07/2027..06/2028 -> 2*3 + 1*9 = 15 seat-months = 7.500.000',
      seatCounting: 'FIXED',
      seatsAtStart: 12,
      priorTarget: 10,
      monthlyPrice: 500_000n,
      startDate: '2027-07-01',
      endExclusive: '2028-07-01',
      months: [
        '2027-07-01',
        '2027-08-01',
        '2027-09-01',
        '2027-10-01',
        '2027-11-01',
        '2027-12-01',
        '2028-01-01',
        '2028-02-01',
        '2028-03-01',
        '2028-04-01',
        '2028-05-01',
        '2028-06-01',
      ],
      held: [...seats([[10, '2027-07-01', null]]), ...seats([[1, '2027-10-01', null]])],
      expectedPerMonth: [
        { month: '2027-07-01', seatMonths: 2, amountMinor: 1_000_000n },
        { month: '2027-08-01', seatMonths: 2, amountMinor: 1_000_000n },
        { month: '2027-09-01', seatMonths: 2, amountMinor: 1_000_000n },
        { month: '2027-10-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2027-11-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2027-12-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2028-01-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2028-02-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2028-03-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2028-04-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2028-05-01', seatMonths: 1, amountMinor: 500_000n },
        { month: '2028-06-01', seatMonths: 1, amountMinor: 500_000n },
      ],
      expectedTotalSeatMonths: 15,
      expectedTotalAmountMinor: 7_500_000n,
    },
    {
      name: 'W3-22 MEMBERS: idle auto-reducing seats never generate KPI-4',
      seatCounting: 'MEMBERS',
      seatsAtStart: 12,
      priorTarget: 10,
      monthlyPrice: 500_000n,
      startDate: '2027-07-01',
      endExclusive: '2027-08-01',
      months: ['2027-07-01'],
      held: seats([[10, '2027-07-01', null]]),
      expectedPerMonth: [{ month: '2027-07-01', seatMonths: 0, amountMinor: 0n }],
      expectedTotalSeatMonths: 0,
      expectedTotalAmountMinor: 0n,
    },
  ])(
    '$name',
    ({
      seatCounting,
      seatsAtStart,
      priorTarget,
      monthlyPrice,
      startDate,
      endExclusive,
      months,
      held,
      expectedPerMonth,
      expectedTotalSeatMonths,
      expectedTotalAmountMinor,
    }) => {
      const missedSeats = missedSeatsOf({
        seatCounting,
        seatsAtPeriodStart: seatsAtStart,
        priorLockedTarget: priorTarget,
      });
      const results = months.map((month) => {
        const { start, nextStart } = monthBoundsOf(month);
        const dailySeats = dailyMap(start, nextStart, () => seatsAtStart);
        const res = lineMonthKpi4({
          seatCounting,
          missedSeats,
          monthlyUnitPriceMinor: monthlyPrice,
          month,
          startDate,
          endExclusive,
          dailySeats,
          fallbackQuantity: seatsAtStart,
          heldSeats: held,
        });

        return { month, res };
      });

      expectedPerMonth.forEach((exp, index) => {
        expect(results[index].res.seatMonths).toBe(exp.seatMonths);
        expect(results[index].res.amountMinor).toBe(exp.amountMinor);
      });

      const totals = accumulateKpi4Months(results.map((r) => r.res));
      expect(totals.totalSeatMonths).toBe(expectedTotalSeatMonths);
      expect(totals.totalAmountMinor).toBe(expectedTotalAmountMinor);
    },
  );
});
