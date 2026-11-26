import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import { RenewalHoldHook, type RenewalHold } from '../../public/licensing.extension-points';
import type { PendingRenewal } from '../../public/licensing-renewal.types';
import type { SharedPoolService } from '../../shared-pool/shared-pool.service';
import type { SubscriptionRenewalSeatRepo } from '../subscription-renewal-seat.repo';
import type { SeatsNeededFacts } from '../subscription-renewal.types';
import { RenewalSeatsNeededService } from './renewal-seats-needed.service';

const waiting: PendingRenewal = { requestId: 'req', state: 'PENDING', approved: false };

function build(facts: Partial<SeatsNeededFacts>, pendingIds: string[] = [], openRequests = 0, awaitingGrant = 0) {
  const seatsNeededFacts = jest.fn().mockResolvedValue({
    heldPastRenewal: 0,
    endingAssignmentIds: [],
    activeSeatsToday: 0,
    ...facts,
  });
  const pendingRenewalsOf = jest.fn((ids: readonly string[]) =>
    Promise.resolve(new Map(ids.filter((id) => pendingIds.includes(id)).map((id) => [id, waiting]))),
  );
  const openRequestsOfPlan = jest.fn().mockResolvedValue(openRequests);
  const approvedAwaitingGrantOfPlan = jest.fn().mockResolvedValue(awaitingGrant);
  const hook = new RenewalHoldHook();
  hook.bind({ pendingRenewalsOf, openRequestsOfPlan, approvedAwaitingGrantOfPlan } as unknown as RenewalHold);
  const service = new RenewalSeatsNeededService(
    { seatsNeededFacts } as unknown as SubscriptionRenewalSeatRepo,
    hook,
    { linesOfSubscription: jest.fn().mockResolvedValue([]) } as unknown as SeatLedgerApi,
    { chosenLinesOfPlans: jest.fn().mockResolvedValue(new Map()) } as unknown as SharedPoolService,
  );

  return { service, seatsNeededFacts, pendingRenewalsOf, openRequestsOfPlan, approvedAwaitingGrantOfPlan };
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
      { heldPastRenewal: 4, endingAssignmentIds: ['a-1', 'a-2', 'a-3'], activeSeatsToday: 7 },
      ['a-1', 'a-3'],
      1,
      2,
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

  it('asks the repo for the facts of the subscription on the renewal day', async () => {
    const tx = {} as DbTx;
    const { service, seatsNeededFacts } = build({});

    await service.countFor(period(), tx);

    expect(seatsNeededFacts).toHaveBeenCalledWith('sub-1', { today: '2026-12-01', renewalOn: '2027-01-01' }, tx);
  });

  it('asks the requests for the people waiting for their grant only for the primary subscription of the plan, so a second subscription does not count them again', async () => {
    const tx = {} as DbTx;
    const primary = build({}, [], 0, 3);
    expect((await primary.service.countFor(period(), tx)).approvedAwaitingGrant).toBe(3);
    expect(primary.approvedAwaitingGrantOfPlan).toHaveBeenCalledWith('plan-1', tx);

    const other = build({}, [], 0, 3);
    expect((await other.service.countFor(period({ isPrimaryForPlan: false }))).approvedAwaitingGrant).toBe(0);
    expect(other.approvedAwaitingGrantOfPlan).not.toHaveBeenCalled();
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

  it('B2-R7: aggregates per-line facts, chooseLine awaiting grants, and minimumSeatsTotal shortfall across lines', async () => {
    const seatsNeededFactsByPlan = jest.fn().mockResolvedValue(
      new Map([
        ['plan-std', { heldPastRenewal: 4, endingAssignmentIds: ['a-1'], activeSeatsToday: 5 }],
        ['plan-prm', { heldPastRenewal: 0, endingAssignmentIds: [], activeSeatsToday: 2 }],
      ]),
    );
    const hold = new RenewalHoldHook();
    hold.bind({
      pendingRenewalsOf: jest.fn().mockResolvedValue(new Map()),
      openRequestsOfPlan: jest.fn().mockResolvedValue(1),
      approvedAwaitingGrantOfPlan: jest.fn().mockResolvedValue(1),
    } as unknown as RenewalHold);
    const seatLedger = {
      linesOfSubscription: jest.fn().mockResolvedValue([
        { id: 'line-std', planId: 'plan-std', minimumSeats: null },
        { id: 'line-prm', planId: 'plan-prm', minimumSeats: null },
      ]),
    } as unknown as SeatLedgerApi;
    const sharedPool = {
      chosenLinesOfPlans: jest
        .fn()
        .mockResolvedValue(new Map([['plan-std', { subscriptionId: 'sub-1', subscriptionLineId: 'line-std' }]])),
    } as unknown as SharedPoolService;

    const service = new RenewalSeatsNeededService(
      { seatsNeededFactsByPlan } as unknown as SubscriptionRenewalSeatRepo,
      hold,
      seatLedger,
      sharedPool,
    );

    const counts = await service.countFor(period({ minimumSeatsTotal: 7, isPrimaryForPlan: false }));
    expect(counts).toEqual({
      heldPastRenewal: 4,
      pendingContinuations: 0,
      approvedAwaitingGrant: 1,
      seatsNeeded: 5,
      vendorMinimumSeats: null,
      target: 7,
      activeSeatsToday: 7,
      openRequests: 2,
    });
  });
});
