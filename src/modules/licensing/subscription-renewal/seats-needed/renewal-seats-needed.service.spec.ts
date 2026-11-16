import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { RenewalHoldHook, type RenewalHold } from '../../public/licensing.extension-points';
import type { PendingRenewal } from '../../public/licensing-renewal.types';
import type { SubscriptionRenewalSeatRepo } from '../subscription-renewal-seat.repo';
import type { SeatsNeededFacts } from '../subscription-renewal.types';
import { RenewalSeatsNeededService } from './renewal-seats-needed.service';

const waiting: PendingRenewal = { requestId: 'req', state: 'PENDING', approved: false };

function build(facts: Partial<SeatsNeededFacts>, pendingIds: string[] = [], openRequests = 0) {
  const seatsNeededFacts = jest.fn().mockResolvedValue({
    heldPastRenewal: 0,
    endingAssignmentIds: [],
    activeSeatsToday: 0,
    approvedAwaitingGrant: 0,
    ...facts,
  });
  const pendingRenewalsOf = jest.fn((ids: readonly string[]) =>
    Promise.resolve(new Map(ids.filter((id) => pendingIds.includes(id)).map((id) => [id, waiting]))),
  );
  const openRequestsOfPlan = jest.fn().mockResolvedValue(openRequests);
  const hook = new RenewalHoldHook();
  hook.bind({ pendingRenewalsOf, openRequestsOfPlan } as unknown as RenewalHold);
  const service = new RenewalSeatsNeededService({ seatsNeededFacts } as unknown as SubscriptionRenewalSeatRepo, hook);

  return { service, seatsNeededFacts, pendingRenewalsOf, openRequestsOfPlan };
}

const period = (extra: Partial<Parameters<RenewalSeatsNeededService['countFor']>[0]> = {}) => ({
  subscriptionId: 'sub-1',
  planId: 'plan-1',
  vendorMinimumSeats: null,
  isPrimaryForPlan: true,
  renewalOn: '2027-01-01',
  today: '2026-12-01',
  ...extra,
});

describe('RenewalSeatsNeededService', () => {
  it('counts the seats held past the renewal, the continuations waiting and the grants approved and waiting', async () => {
    const { service } = build(
      { heldPastRenewal: 4, endingAssignmentIds: ['a-1', 'a-2', 'a-3'], activeSeatsToday: 7, approvedAwaitingGrant: 2 },
      ['a-1', 'a-3'],
      1,
    );

    expect(await service.countFor(period({ vendorMinimumSeats: 5 }))).toEqual({
      heldPastRenewal: 4,
      pendingContinuations: 2,
      approvedAwaitingGrant: 2,
      seatsNeeded: 8,
      vendorMinimumSeats: 5,
      target: 8,
      activeSeatsToday: 7,
      openRequests: 1,
    });
  });

  it('raises the target to the vendor minimum, and has none when nothing is needed', async () => {
    expect((await build({ heldPastRenewal: 2 }).service.countFor(period({ vendorMinimumSeats: 5 }))).target).toBe(5);
    expect((await build({}).service.countFor(period({ vendorMinimumSeats: 5 }))).target).toBe(0);
  });

  it('asks the repo for the facts of the subscription on the renewal day, counting the grants waiting only for the primary subscription of the plan', async () => {
    const tx = {} as DbTx;
    const { service, seatsNeededFacts } = build({});

    await service.countFor(period({ isPrimaryForPlan: false }), tx);

    expect(seatsNeededFacts).toHaveBeenCalledWith(
      'sub-1',
      'plan-1',
      { today: '2026-12-01', renewalOn: '2027-01-01' },
      false,
      tx,
    );
  });

  it('asks the requests for the seats that end by the renewal only, and not at all when none does', async () => {
    const some = build({ endingAssignmentIds: ['a-1'] });
    await some.service.countFor(period());
    expect(some.pendingRenewalsOf).toHaveBeenCalledWith(['a-1'], undefined);

    const none = build({});
    await none.service.countFor(period());
    expect(none.pendingRenewalsOf).not.toHaveBeenCalled();
  });

  it('counts the open requests of the plan of the subscription, whatever the seats', async () => {
    const { service, openRequestsOfPlan } = build({}, [], 3);

    expect((await service.countFor(period())).openRequests).toBe(3);
    expect(openRequestsOfPlan).toHaveBeenCalledWith('plan-1', undefined);
  });
});
