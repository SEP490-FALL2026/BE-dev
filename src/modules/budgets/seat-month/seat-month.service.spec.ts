import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import type { SeatMonthSubscriptionService } from './seat-month-subscription.service';
import type { SeatMonthRepo } from './seat-month.repo';
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

  function build(options: { failing?: string[]; signed?: boolean } = {}) {
    const done = new Set<string>();
    const failing = new Set(options.failing ?? []);
    const charged: string[] = [];
    const charge = jest.fn((_tx: unknown, subscriptionId: string, month: string) => {
      if (failing.has(subscriptionId)) return Promise.reject(new Error(`deadlock on ${subscriptionId}`));
      done.add(`${subscriptionId}|${month}`);
      charged.push(`${subscriptionId}|${month}`);

      return Promise.resolve(1);
    });
    const service = new SeatMonthService(
      { run: (work: (tx: unknown) => Promise<unknown>) => work({}) } as unknown as TransactionRunner,
      {
        subscriptionIdsOfMonth: () => Promise.resolve([]),
        completedSubscriptionIds: (month: string) =>
          Promise.resolve(new Set(subscriptions.filter((id) => done.has(`${id}|${month}`)))),
      } as unknown as SeatMonthRepo,
      { getSeatsOfMonth: () => Promise.resolve(subscriptions.map(seatOn)) } as unknown as LicensingSeatMonthApi,
      { isSigned: () => Promise.resolve(options.signed === true) },
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

    await expect(service.chargeMonth('2026-01-01')).rejects.toThrow('deadlock on B');
    expect(charge.mock.calls.map((call) => call[1])).toEqual(['A', 'B', 'C']);

    failing.clear();
    await service.chargeMonth('2026-01-01');
    await service.chargeMonth('2026-01-01');
    expect(charge).toHaveBeenCalledTimes(3 + 3 + 3);
  });

  it('leaves a signed month as it is', async () => {
    const { service, charge } = build({ signed: true });

    expect(await service.chargeMonth('2026-01-01')).toEqual({ skipped: true, subscriptions: 0, rows: 0, failed: 0 });
    expect(charge).not.toHaveBeenCalled();
  });
});
