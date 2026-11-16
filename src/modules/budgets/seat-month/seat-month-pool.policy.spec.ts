import { inForce, paidMinor, poolLineMinor, type PoolPeriod } from './seat-month-pool.policy';

/** A pool of 10 seats bought for the year from 01/07/2026 to 30/06/2027 at 3.600.000 a seat a year, so 300.000 a seat a month. */
const annual: PoolPeriod = {
  subscriptionId: 'pool',
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  purchasedQuantity: 10,
  monthlyPriceMinor: 300_000n,
};

describe('the line of the shared pool of a month (SM1-04; QĐ-104c(2), QĐ-103k)', () => {
  it('is the seats paid for at the price of a month, less the seat-months held: 10 seats, 8 held, 600.000, every month of the year of the purchase', () => {
    const held = 8n * 300_000n;

    expect(paidMinor(annual)).toBe(3_000_000n);
    expect(poolLineMinor({ paidMinor: paidMinor(annual), invoicedMinor: 36_000_000n, allocatedMinor: held })).toBe(
      600_000n,
    );
    // The invoice is the proof of what was paid, not the line: the month it is booked to does not carry the whole year.
    expect(poolLineMinor({ paidMinor: paidMinor(annual), invoicedMinor: 0n, allocatedMinor: held })).toBe(600_000n);
  });

  it('adds up over the six months of the year it runs in to 3.600.000, not to 21.600.000 and not below the reserve of 5.000.000 for the year', () => {
    const months = [7, 8, 9, 10, 11, 12].map((month) =>
      poolLineMinor({
        paidMinor: paidMinor(annual),
        // The whole year is invoiced in July: the month the invoice is booked to is not the line of that month alone.
        invoicedMinor: month === 7 ? 36_000_000n : 0n,
        allocatedMinor: 8n * 300_000n,
      }),
    );

    expect(months.reduce((sum, minor) => sum + minor, 0n)).toBe(3_600_000n);
    expect(months.reduce((sum, minor) => sum + minor, 0n) > 5_000_000n).toBe(false);
  });

  it('falls back to the invoices of the month less the seat-months when the seats paid or the price of a month is not known', () => {
    const unknown = { ...annual, purchasedQuantity: null };

    expect(paidMinor(unknown)).toBeNull();
    expect(poolLineMinor({ paidMinor: null, invoicedMinor: 4_000_000n, allocatedMinor: 3_200_000n })).toBe(800_000n);
    expect(paidMinor({ ...annual, monthlyPriceMinor: null })).toBeNull();
  });

  it('is in force in the months from the one of its first day to the one of its last day, and in every month when it has no dates', () => {
    expect(inForce(annual, '2026-06-01')).toBe(false);
    expect(inForce(annual, '2026-07-01')).toBe(true);
    expect(inForce(annual, '2027-06-01')).toBe(true);
    expect(inForce(annual, '2027-07-01')).toBe(false);
    expect(inForce({ ...annual, startDate: null, endDate: null }, '2020-01-01')).toBe(true);
  });
});
