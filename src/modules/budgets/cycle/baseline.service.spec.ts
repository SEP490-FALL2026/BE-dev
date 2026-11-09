import type { BaselineSubscription } from '../../catalog/public/catalog.types';
import { allocateSeats, SOFTWARE_LISTED_MAX } from './baseline.policy';
import { departmentOf, sharedPoolLineOf } from './baseline.service';

const subscription = (index: number, patch: Partial<BaselineSubscription> = {}): BaselineSubscription => ({
  subscriptionId: `sub-${String(index).padStart(3, '0')}`,
  planId: 'plan',
  planName: 'Team',
  applicationName: `App ${index}`,
  provisioningType: 'K2',
  purchasedQuantity: 10,
  unitPriceReportingMinor: 100n,
  billingCycle: 'MONTHLY',
  startDate: '2026-01-01',
  endDate: null,
  renewalDate: null,
  hasSuccessor: false,
  ...patch,
});

const format = (minor: bigint) => ({ amount: String(minor), currency: 'VND' });
const reading = (
  seats: Map<string, number>,
  ending: ReadonlySet<string> = new Set(),
  kpi3ByPlan: ReadonlyMap<string, number> = new Map(),
) => ({
  year: 2027,
  today: '2026-11-09',
  seats,
  ending,
  kpi3ByPlan,
  spent: 0n,
  format,
});

describe('one department of the baseline', () => {
  it('lists the first 50 subscriptions, and counts the rest in the totals and in `softwareTotal` (F-069, F-101)', () => {
    const subscriptions = Array.from({ length: SOFTWARE_LISTED_MAX + 1 }, (_, index) => subscription(index));
    const seats = new Map(subscriptions.map((one) => [one.subscriptionId, 2]));

    const department = departmentOf({ id: 'dep', code: 'D', name: 'Dep' }, 'cc', subscriptions, reading(seats));

    expect(department.software).toHaveLength(SOFTWARE_LISTED_MAX);
    expect(department.softwareTotal).toBe(SOFTWARE_LISTED_MAX + 1);
    // Two seats at 100 a month for twelve months, for every one of the 51: the one that is not listed is in the total.
    expect(department.estimatedAnnualCost).toEqual(format(BigInt(51 * 2 * 100 * 12)));
    expect(department.seatsAssigned).toBe(102);
  });

  it('charges a subscription that was ordered to end only for the months it still runs, and does not propose it (Q-162)', () => {
    const stopped = subscription(1, { endDate: '2027-03-31' });
    const seats = new Map([[stopped.subscriptionId, 1]]);

    const [only] = departmentOf(
      { id: 'dep', code: 'D', name: 'Dep' },
      'cc',
      [stopped],
      reading(seats, new Set([stopped.subscriptionId])),
    ).software;

    expect(only).toMatchObject({ monthsRunning: 3, suggestRenewal: false });
  });

  it('BR-MF4-01 QĐ-103k: costs only the seats its people hold, never the idle seats of the pool', () => {
    const pool = subscription(1, { purchasedQuantity: 10 });

    const department = departmentOf(
      { id: 'mkt', code: 'MKT', name: 'Marketing' },
      'cc',
      [pool],
      reading(new Map([[pool.subscriptionId, 8]])),
    );

    // 8 seats held by Marketing × 100 a month × 12; the 2 idle seats are the pool's line.
    expect(department.estimatedAnnualCost).toEqual(format(9_600n));
    expect(department.software[0]).toMatchObject({ seatsPurchased: 10, seatsAssigned: 8 });
    expect(department.software[0]).not.toHaveProperty('seatsIdle');
  });

  it('AF-08 KPI-3: tells the KPI-3 of the plan when usage was assessed, null otherwise', () => {
    const used = subscription(1, { planId: 'slack' });
    const unknown = subscription(2, { planId: 'figma' });

    const department = departmentOf(
      { id: 'dep', code: 'D', name: 'Dep' },
      'cc',
      [used, unknown],
      reading(
        new Map([
          [used.subscriptionId, 1],
          [unknown.subscriptionId, 1],
        ]),
        new Set(),
        new Map([['slack', 40]]),
      ),
    );

    expect(department.software.map((entry) => entry.kpi3)).toEqual([40, null]);
  });
});

describe('BR-MF4-01 QĐ-103k: the line Unallocated - shared pool of the baseline', () => {
  const line = (subscriptions: BaselineSubscription[], held: Map<string, number>) =>
    sharedPoolLineOf(subscriptions, { year: 2027, today: '2026-11-09', held, ending: new Set(), format });

  it('holds the idle seats of the K2/K4 subscriptions at the same price reading as a department', () => {
    const figma = subscription(1, { purchasedQuantity: 10 });

    const pool = line([figma], new Map([[figma.subscriptionId, 8]]));

    expect(pool).toMatchObject({
      line: 'SHARED_POOL_UNALLOCATED',
      seatsIdle: 2,
      softwareTotal: 1,
      hasUnknownCost: false,
    });
    // 2 idle seats × 100 a month × 12.
    expect(pool.estimatedAnnualCost).toEqual(format(2_400n));
    expect(pool.software[0]).toMatchObject({ seatsPurchased: 10, seatsAssigned: 8, seatsIdle: 2 });
  });

  it('leaves out a subscription with no idle seat, one with no number of seats, and a K1 purchase', () => {
    const full = subscription(1, { purchasedQuantity: 2 });
    const flat = subscription(2, { purchasedQuantity: null });
    const personal = subscription(3, { provisioningType: 'K1', purchasedQuantity: 3 });

    const pool = line([full, flat, personal], new Map([[full.subscriptionId, 2]]));

    expect(pool).toMatchObject({ seatsIdle: 0, softwareTotal: 0, software: [] });
    expect(pool.estimatedAnnualCost).toEqual(format(0n));
  });

  it('says when the price of an idle seat is not known and leaves it out of the total (F-074)', () => {
    const other = subscription(1, { billingCycle: 'OTHER' });

    const pool = line([other], new Map());

    expect(pool.hasUnknownCost).toBe(true);
    expect(pool.estimatedAnnualCost).toEqual(format(0n));
    expect(pool.software[0].estimatedAnnualCost).toBeNull();
  });
});

describe('BR-MF4-01 QĐ-103k: a seat is charged to the department of its holder', () => {
  it('splits the seats of one subscription between the departments of the people who hold them', () => {
    const allocation = allocateSeats(
      [
        { subscriptionId: 'figma', employeeId: 'anna', seats: 1 },
        { subscriptionId: 'figma', employeeId: 'binh', seats: 1 },
        { subscriptionId: 'figma', employeeId: 'chi', seats: 1 },
      ],
      new Map([
        ['anna', 'mkt'],
        ['binh', 'mkt'],
        ['chi', 'it'],
      ]),
    );

    expect(allocation.byDepartment.get('mkt')?.get('figma')).toBe(2);
    expect(allocation.byDepartment.get('it')?.get('figma')).toBe(1);
    expect(allocation.held.get('figma')).toBe(3);
  });

  it('counts the seat of a holder placed in no department as held, in no department', () => {
    const allocation = allocateSeats([{ subscriptionId: 'figma', employeeId: 'nobody', seats: 1 }], new Map());

    expect(allocation.held.get('figma')).toBe(1);
    expect(allocation.byDepartment.size).toBe(0);
  });
});
