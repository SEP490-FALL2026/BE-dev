import type { BaselineSubscription } from '../../catalog/public/catalog.types';
import { SOFTWARE_LISTED_MAX } from './baseline.policy';
import { departmentOf } from './baseline.service';

const subscription = (index: number): BaselineSubscription => ({
  subscriptionId: `sub-${String(index).padStart(3, '0')}`,
  departmentId: 'dep',
  planId: 'plan',
  planName: 'Team',
  applicationName: `App ${index}`,
  purchasedQuantity: 10,
  unitPriceReportingMinor: 100n,
  billingCycle: 'MONTHLY',
  startDate: '2026-01-01',
  endDate: null,
  renewalDate: null,
});

describe('one department of the baseline', () => {
  const format = (minor: bigint) => ({ amount: String(minor), currency: 'VND' });
  const reading = (seats: Map<string, number>, ending: ReadonlySet<string> = new Set()) => ({
    year: 2027,
    today: '2026-11-09',
    seats,
    ending,
    spent: 0n,
    format,
  });

  it('lists the first 50 subscriptions, and counts the rest in the totals and in `softwareTotal` (F-069, F-101)', () => {
    const subscriptions = Array.from({ length: SOFTWARE_LISTED_MAX + 1 }, (_, index) => subscription(index));
    const seats = new Map(subscriptions.map((one) => [one.subscriptionId, 2]));

    const department = departmentOf({ id: 'dep', code: 'D', name: 'Dep' }, 'cc', subscriptions, reading(seats));

    expect(department.software).toHaveLength(SOFTWARE_LISTED_MAX);
    expect(department.softwareTotal).toBe(SOFTWARE_LISTED_MAX + 1);
    // Two seats at 100 a month for twelve months, for every one of the 51: the one that is not listed is in the total.
    expect(department.estimatedAnnualCost).toEqual(format(BigInt(51 * 2 * 100 * 12)));
    expect(department.seatsAssigned).toBe(102);
    expect(department.seatsPurchased).toBe(510);
  });

  it('charges a subscription that was ordered to end only for the months it still runs, and does not propose it (Q-162)', () => {
    const stopped = { ...subscription(1), endDate: '2027-03-31' };
    const seats = new Map([[stopped.subscriptionId, 1]]);

    const [only] = departmentOf(
      { id: 'dep', code: 'D', name: 'Dep' },
      'cc',
      [stopped],
      reading(seats, new Set([stopped.subscriptionId])),
    ).software;

    expect(only).toMatchObject({ monthsRunning: 3, suggestRenewal: false });
  });
});
