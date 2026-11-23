import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import type { SeatMonthSubscriptionService } from './seat-month-subscription.service';
import type { SeatMonthRepo } from './seat-month.repo';
import { SeatMonthChargeError } from './seat-month.errors';
import { SeatMonthService } from './seat-month.service';

const seatOn = (subscriptionId: string): SeatOfMonth => ({
  assignmentId: `a-${subscriptionId}`,
  subscriptionId,
  planId: 'plan',
  employeeId: 'e',
  kind: 'PERSONAL',
  owningDepartmentId: null,
  heldFrom: '2026-01-01',
  heldUntil: null,
  requestId: null,
});

/**
 * The sweeper charges the months that have ended (`SM1-03`): a subscription that failed in the middle of a pass must not cost the ones after it their month
 * for good, and the next pass charges only the subscriptions that have no mark. The collaborators are stand-ins; the marks live in `done`.
 */
describe('SeatMonthService.chargeEndedMonths (SM1-03)', () => {
  const subscriptions = ['A', 'B', 'C'];

  function build(options: { failing?: string[] } = {}) {
    const done = new Set<string>();
    const failing = new Set(options.failing ?? []);
    const charged: string[] = [];
    const charge = jest.fn((...args: [tx: unknown, id: string, month: string, now?: Date, onlyMissing?: boolean]) => {
      const [, subscriptionId, month] = args;
      if (failing.has(subscriptionId)) return Promise.reject<number | null>(new Error(`deadlock on ${subscriptionId}`));
      done.add(`${subscriptionId}|${month}`);
      charged.push(`${subscriptionId}|${month}`);

      return Promise.resolve<number | null>(1);
    });
    const service = new SeatMonthService(
      { run: (work: (tx: unknown) => Promise<unknown>) => work({}) } as unknown as TransactionRunner,
      {
        subscriptionIdsOfMonth: () => Promise.resolve([]),
        completedSubscriptionIds: (month: string) =>
          Promise.resolve(new Set(subscriptions.filter((id) => done.has(`${id}|${month}`)))),
      } as unknown as SeatMonthRepo,
      { getSeatsOfMonth: () => Promise.resolve(subscriptions.map(seatOn)) } as unknown as LicensingSeatMonthApi,
      { charge } as unknown as SeatMonthSubscriptionService,
    );

    return { service, charge, charged, failing };
  }

  it('charges the subscriptions after the one that failed, and charges the one that failed in the next pass, each once', async () => {
    const { service, charged, failing } = build({ failing: ['B'] });

    const first = await service.chargeEndedMonths('2026-02-10');
    expect(first).toMatchObject({ failed: 1, subscriptions: 2 });
    expect(charged).toEqual(['A|2026-01-01', 'C|2026-01-01']);

    failing.clear();
    const second = await service.chargeEndedMonths('2026-02-10');

    expect(second).toMatchObject({ failed: 0, subscriptions: 1 });
    expect(charged).toEqual(['A|2026-01-01', 'C|2026-01-01', 'B|2026-01-01']);
    expect((await service.chargeEndedMonths('2026-02-10')).subscriptions).toBe(0);
  });

  it('charges a month on request for every subscription again, and says it failed when one did, after it tried the others', async () => {
    const { service, charge, failing } = build({ failing: ['B'] });

    const refused: unknown = await service.chargeMonth('2026-01-01').catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(SeatMonthChargeError);
    expect(refused).toMatchObject({ message: 'deadlock on B', subscriptionIds: ['B'] });
    expect(charge.mock.calls.map((call) => call[1])).toEqual(['A', 'B', 'C']);

    failing.clear();
    await service.chargeMonth('2026-01-01');
    await service.chargeMonth('2026-01-01');
    expect(charge).toHaveBeenCalledTimes(3 + 3 + 3);
  });

  it('asks for the missing ones only in a sweeper pass, and does not count a subscription another pass marked while this one waited for the lock', async () => {
    const { service, charge } = build();
    charge.mockImplementation((_tx: unknown, subscriptionId: string) =>
      Promise.resolve(subscriptionId === 'B' ? null : 1),
    );

    const pass = await service.chargeEndedMonths('2026-02-10');

    expect(pass).toMatchObject({ subscriptions: 2, rows: 2, failed: 0 });
    expect(charge.mock.calls.map((call) => call[4])).toEqual([true, true, true]);
    await service.chargeMonth('2026-01-01');
    expect(charge.mock.calls.slice(3).map((call) => call[4])).toEqual([false, false, false]);
  });

  it('charges a month again whatever was charged before: closing the numbers of a month is a picture, not a lock (QĐ-111ae)', async () => {
    const { service, charge } = build();

    await service.chargeMonth('2026-01-01');
    await service.chargeMonth('2026-01-01');

    expect(charge).toHaveBeenCalledTimes(6);
  });
});
