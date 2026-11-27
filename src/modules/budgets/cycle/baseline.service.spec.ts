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
  monthlyPriceMinor: 100n,
  billingCycle: 'MONTHLY',
  startDate: '2026-01-01',
  endDate: null,
  renewalDate: null,
  hasSuccessor: false,
  ...patch,
});

const format = (minor: bigint) => ({ amount: String(minor), currency: 'VND' });
const reading = (
  subscriptions: readonly BaselineSubscription[],
  seats: Map<string, number>,
  ending: ReadonlySet<string> = new Set(),
  kpi3ByPlan: ReadonlyMap<string, number> = new Map(),
) => ({
  year: 2027,
  today: '2026-11-09',
  seats,
  // One plan per subscription, priced as the subscription is: what a period with a single plan costs.
  seatPlans: new Map(
    subscriptions.map((one) => [one.subscriptionId, new Map([[one.planId, seats.get(one.subscriptionId) ?? 0]])]),
  ),
  priceOf: (subscriptionId: string) =>
    subscriptions.find((one) => one.subscriptionId === subscriptionId)?.monthlyPriceMinor ?? null,
  seatsOf: (subscriptionId: string) =>
    subscriptions.find((one) => one.subscriptionId === subscriptionId)?.purchasedQuantity ?? null,
  planNameOf: (planId: string) => `Plan ${planId}`,
  ending,
  kpi3ByPlan,
  spent: 0n,
  format,
});

describe('one department of the baseline', () => {
  it('lists the first 50 subscriptions, and counts the rest in the totals and in `softwareTotal` (F-069, F-101)', () => {
    const subscriptions = Array.from({ length: SOFTWARE_LISTED_MAX + 1 }, (_, index) => subscription(index));
    const seats = new Map(subscriptions.map((one) => [one.subscriptionId, 2]));

    const department = departmentOf(
      { id: 'dep', code: 'D', name: 'Dep' },
      'cc',
      subscriptions,
      reading(subscriptions, seats),
    );

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
      reading([stopped], seats, new Set([stopped.subscriptionId])),
    ).software;

    expect(only).toMatchObject({ monthsRunning: 3, suggestRenewal: false });
  });

  it('BR-MF4-01 QĐ-103k: costs only the seats its people hold, never the idle seats of the pool', () => {
    const pool = subscription(1, { purchasedQuantity: 10 });

    const department = departmentOf(
      { id: 'mkt', code: 'MKT', name: 'Marketing' },
      'cc',
      [pool],
      reading([pool], new Map([[pool.subscriptionId, 8]])),
    );

    // 8 seats held by Marketing × 100 a month × 12; the 2 idle seats are the pool's line.
    expect(department.estimatedAnnualCost).toEqual(format(9_600n));
    expect(department.software[0]).toMatchObject({ seatsPurchased: 10, seatsAssigned: 8 });
    expect(department.software[0]).not.toHaveProperty('seatsIdle');
  });

  it('W3-08 B-1: charges the seats of a period with two plans the line of each plan, not the price of the first plan', () => {
    const period = subscription(1, { planId: 'standard', monthlyPriceMinor: 500_000n });
    const prices = new Map([
      ['standard', 500_000n],
      ['premium', 800_000n],
    ]);

    const department = departmentOf({ id: 'dep', code: 'D', name: 'Dep' }, 'cc', [period], {
      ...reading([period], new Map([[period.subscriptionId, 2]])),
      seatPlans: new Map([
        [
          period.subscriptionId,
          new Map([
            ['standard', 1],
            ['premium', 1],
          ]),
        ],
      ]),
      priceOf: (_subscriptionId: string, planId: string) => prices.get(planId) ?? null,
    });

    expect(department.estimatedAnnualCost).toEqual(format(15_600_000n));
    // One row for each plan of the period, each at the line of its own plan (the decision of the Owner on 27/11).
    expect(department.softwareTotal).toBe(2);
    expect(
      department.software.map((row) => [row.planId, row.seatsAssigned, row.monthlyUnitPrice, row.estimatedAnnualCost]),
    ).toEqual([
      ['standard', 1, format(500_000n), format(6_000_000n)],
      ['premium', 1, format(800_000n), format(9_600_000n)],
    ]);
  });

  it('AF-08 KPI-3: tells the KPI-3 of the plan when usage was assessed, null otherwise', () => {
    const used = subscription(1, { planId: 'slack' });
    const unknown = subscription(2, { planId: 'figma' });

    const department = departmentOf(
      { id: 'dep', code: 'D', name: 'Dep' },
      'cc',
      [used, unknown],
      reading(
        [used, unknown],
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
  /** One plan on each period, priced and counted as the period is. */
  const line = (subscriptions: BaselineSubscription[], held: Map<string, number>) =>
    sharedPoolLineOf(subscriptions, {
      year: 2027,
      today: '2026-11-09',
      heldByPlan: new Map(
        subscriptions.map((one) => [one.subscriptionId, new Map([[one.planId, held.get(one.subscriptionId) ?? 0]])]),
      ),
      seatsOf: (subscriptionId) =>
        subscriptions.find((one) => one.subscriptionId === subscriptionId)?.purchasedQuantity ?? null,
      planIdsOf: (subscriptionId) =>
        subscriptions.filter((one) => one.subscriptionId === subscriptionId).map((one) => one.planId),
      priceOf: (subscriptionId) =>
        subscriptions.find((one) => one.subscriptionId === subscriptionId)?.monthlyPriceMinor ?? null,
      planNameOf: (planId) => `Plan ${planId}`,
      ending: new Set(),
      format,
    });

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

  it('W3-08: charges the idle seats of each plan of a period at the line of that plan, one row for each plan', () => {
    const period = subscription(1, { planId: 'standard', monthlyPriceMinor: 500_000n, purchasedQuantity: 15 });
    const seats = new Map([
      ['standard', 10],
      ['premium', 5],
    ]);
    const prices = new Map([
      ['standard', 500_000n],
      ['premium', 800_000n],
    ]);

    const pool = sharedPoolLineOf([period], {
      year: 2027,
      today: '2026-11-09',
      heldByPlan: new Map([
        [
          period.subscriptionId,
          new Map([
            ['standard', 3],
            ['premium', 2],
          ]),
        ],
      ]),
      seatsOf: (_subscriptionId, planId) => seats.get(planId) ?? null,
      planIdsOf: () => ['standard', 'premium'],
      priceOf: (_subscriptionId, planId) => prices.get(planId) ?? null,
      planNameOf: (planId) => planId,
      ending: new Set(),
      format,
    });

    // 7 idle Standard at 500.000 + 3 idle Premium at 800.000 = 5.900.000 a month, twelve months.
    expect(pool.estimatedAnnualCost).toEqual(format(70_800_000n));
    expect(pool.seatsIdle).toBe(10);
    expect(pool.software.map((row) => [row.planId, row.seatsIdle, row.monthlyUnitPrice])).toEqual([
      ['standard', 7, format(500_000n)],
      ['premium', 3, format(800_000n)],
    ]);
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
    const other = subscription(1, { billingCycle: 'OTHER', monthlyPriceMinor: null });

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
        { subscriptionId: 'figma', planId: 'team', employeeId: 'anna', seats: 1 },
        { subscriptionId: 'figma', planId: 'team', employeeId: 'binh', seats: 1 },
        { subscriptionId: 'figma', planId: 'team', employeeId: 'chi', seats: 1 },
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

  it('keeps the seats of a department apart by the plan of the seat', () => {
    const allocation = allocateSeats(
      [
        { subscriptionId: 'figma', planId: 'standard', employeeId: 'anna', seats: 1 },
        { subscriptionId: 'figma', planId: 'premium', employeeId: 'anna', seats: 2 },
        { subscriptionId: 'figma', planId: 'premium', employeeId: 'binh', seats: 1 },
      ],
      new Map([
        ['anna', 'mkt'],
        ['binh', 'mkt'],
      ]),
    );

    expect(allocation.byDepartmentPlan.get('mkt')?.get('figma')).toEqual(
      new Map([
        ['standard', 1],
        ['premium', 3],
      ]),
    );
    expect(allocation.byDepartment.get('mkt')?.get('figma')).toBe(4);
  });

  it('counts the seat of a holder placed in no department as held, in no department', () => {
    const allocation = allocateSeats(
      [{ subscriptionId: 'figma', planId: 'team', employeeId: 'nobody', seats: 1 }],
      new Map(),
    );

    expect(allocation.held.get('figma')).toBe(1);
    expect(allocation.byDepartment.size).toBe(0);
  });
});
