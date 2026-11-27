import { inForce, type PoolPeriod } from './seat-month-pool.policy';

const annual: PoolPeriod = {
  subscriptionId: 'pool',
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  purchasedQuantity: 10,
  monthlyPriceMinor: 300_000n,
};

describe('seat-month-pool.policy: inForce', () => {
  it('is in force in the months from the one of its first day to the one of its last day, and in every month when it has no dates', () => {
    expect(inForce(annual, '2026-06-01')).toBe(false);
    expect(inForce(annual, '2026-07-01')).toBe(true);
    expect(inForce(annual, '2027-06-01')).toBe(true);
    expect(inForce(annual, '2027-07-01')).toBe(false);
    expect(inForce({ ...annual, startDate: null, endDate: null }, '2020-01-01')).toBe(true);
  });
});
