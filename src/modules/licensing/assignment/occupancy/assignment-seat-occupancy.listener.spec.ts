import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../../audit/public/audit.api';
import { SeatOccupancyHook } from '../../../catalog/public/catalog.extension-points';
import type { LicenseLotApi } from '../../../catalog/public/license-lot.api';
import type { GrantRequestGateHook } from '../../public/licensing.extension-points';
import type { DeviceActivationRepo } from '../../device-activation/device-activation.repo';
import type { SharedPoolCapacityRepo } from '../../shared-pool/shared-pool-capacity.repo';
import type { AssignmentRepo } from '../assignment.repo';
import { AssignmentSeatOccupancy } from './assignment-seat-occupancy.listener';

describe('AssignmentSeatOccupancy (S-6)', () => {
  const tx = {} as DbTx;
  const day = '2026-11-24';

  function setup(lotIds: string[] = []) {
    const repo = {
      countHolding: jest.fn().mockResolvedValue(2),
      countHoldersOfPlans: jest.fn().mockResolvedValue(0),
      subscriptionIdsHolding: jest.fn().mockResolvedValue(new Set(['sub-seat'])),
      holdingOfPlans: jest.fn().mockResolvedValue({ items: [], byPlan: [] }),
    } as unknown as AssignmentRepo;

    const capacity = {
      occupancyOf: jest.fn().mockResolvedValue(new Map([['sub-seat', { occupied: 2, inRevocation: 1 }]])),
      occupancyOfMany: jest.fn().mockResolvedValue(new Map([['sub-seat', { occupied: 2, inRevocation: 1 }]])),
      occupancyWithPlansOfMany: jest.fn().mockResolvedValue({
        bySubscription: new Map([['sub-seat', { occupied: 2, inRevocation: 1 }]]),
        bySubscriptionPlan: new Map([['sub-seat:plan-1', 2]]),
      }),
    } as unknown as SharedPoolCapacityRepo;

    const deviceActivations = {
      keyCountsOfLots: jest.fn().mockResolvedValue(new Map([['lot-1', { inStore: 2, assigned: 1, withdrawn: 0 }]])),
      hasLotKeyHistory: jest.fn().mockResolvedValue(false),
      lotKeyIds: jest.fn().mockResolvedValue([]),
      occupiedBySubscription: jest.fn().mockResolvedValue(3),
      occupiedBySubscriptions: jest.fn().mockResolvedValue(
        new Map([
          ['sub-seat', 1],
          ['sub-key-only', 4],
        ]),
      ),
    } as unknown as DeviceActivationRepo;

    const lots = {
      idsOfLots: jest
        .fn()
        .mockImplementation((ids: string[]) => Promise.resolve(new Set(ids.filter((id) => lotIds.includes(id))))),
    } as unknown as LicenseLotApi;
    const hook = { bind: jest.fn() } as unknown as SeatOccupancyHook;
    const audit = {
      pageOfResources: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    } as unknown as AuditApi;
    const gate = {
      isBound: jest.fn().mockReturnValue(true),
      get: jest.fn().mockReturnValue({ hasLotCharges: jest.fn().mockResolvedValue(false) }),
    } as unknown as GrantRequestGateHook;
    const listener = new AssignmentSeatOccupancy(repo, capacity, deviceActivations, lots, hook, audit, gate);

    return { listener, repo, capacity, deviceActivations, lots, audit, gate };
  }

  it('adds device_activation_occupied into occupiedBySubscription', async () => {
    const { listener } = setup();

    await expect(listener.occupiedBySubscription('sub-1', day, tx)).resolves.toBe(5);
  });

  it('includes subscriptions with open or lost device activations in subscriptionsWithOpenSeats', async () => {
    const { listener } = setup();

    const result = await listener.subscriptionsWithOpenSeats(['sub-seat', 'sub-key-only', 'sub-empty'], day, tx);
    expect([...result].sort()).toEqual(['sub-key-only', 'sub-seat']);
  });

  it('combines seat occupancy and device_activation_occupied in seatsOfSubscriptions', async () => {
    const { listener } = setup();

    const map = await listener.seatsOfSubscriptions(['sub-seat', 'sub-key-only', 'sub-empty'], day, tx);
    expect(map.get('sub-seat')).toEqual({ occupied: 3, inRevocation: 1 });
    expect(map.get('sub-key-only')).toEqual({ occupied: 4, inRevocation: 0 });
    expect(map.get('sub-empty')).toBeUndefined();
  });

  it('reads the keys of lots through the repo of the vault, by the purchase of each key', async () => {
    const { listener } = setup();

    await expect(listener.keyCountsOfLots(['lot-1'])).resolves.toEqual(
      new Map([['lot-1', { inStore: 2, assigned: 1, withdrawn: 0 }]]),
    );
  });

  describe('a lot of a K4 plan is counted once, by the lot (DL-2)', () => {
    it('takes the figure of the lot alone for occupiedBySubscription: the rights are already in it', async () => {
      const { listener, repo } = setup(['lot-1']);

      await expect(listener.occupiedBySubscription('lot-1', day, tx)).resolves.toBe(3);
      expect((repo as unknown as { countHolding: jest.Mock }).countHolding).not.toHaveBeenCalled();
    });

    it('takes the figure of the lot alone in seatsOfSubscriptions, and keeps what is being taken back', async () => {
      const { listener, lots } = setup(['sub-seat']);

      const map = await listener.seatsOfSubscriptions(['sub-seat', 'sub-key-only', 'unused-sub'], day, tx);
      expect(map.get('sub-seat')).toEqual({ occupied: 1, inRevocation: 1 });
      expect(map.get('sub-key-only')).toEqual({ occupied: 4, inRevocation: 0 });
      expect((lots as unknown as { idsOfLots: jest.Mock }).idsOfLots).toHaveBeenCalledWith(
        ['sub-seat', 'sub-key-only'],
        tx,
      );
    });

    it('H-10: skips lots.idsOfLots completely when neither activationOccupied nor seatMap has any entry', async () => {
      const { listener, capacity, deviceActivations, lots } = setup(['sub-seat']);
      (capacity.occupancyOf as jest.Mock).mockResolvedValueOnce(new Map());
      (deviceActivations.occupiedBySubscriptions as jest.Mock).mockResolvedValueOnce(new Map());

      const map = await listener.seatsOfSubscriptions(['empty-sub-1', 'empty-sub-2'], day, tx);
      expect(map.size).toBe(0);
      expect((lots as unknown as { idsOfLots: jest.Mock }).idsOfLots).not.toHaveBeenCalled();
    });
  });

  describe('lot usage history (T-5)', () => {
    it('returns true when deviceActivations reports key assignment or device activation history', async () => {
      const { listener, deviceActivations } = setup();
      (deviceActivations.hasLotKeyHistory as jest.Mock).mockResolvedValueOnce(true);

      await expect(listener.hasLotBeenUsed('lot-1', tx)).resolves.toBe(true);
    });

    it('returns true when a key of the lot has LICENSE_KEY.ASSIGNED audit history after revocation', async () => {
      const { listener, deviceActivations, audit } = setup();
      (deviceActivations.lotKeyIds as jest.Mock).mockResolvedValueOnce(['key-1']);
      (audit.pageOfResources as jest.Mock).mockResolvedValueOnce({ rows: [], total: 1 });

      await expect(listener.hasLotBeenUsed('lot-1', tx)).resolves.toBe(true);
    });

    it('returns true when budgets records at least one license_lot_charges row', async () => {
      const { listener, gate } = setup();
      (gate.get().hasLotCharges as jest.Mock).mockResolvedValueOnce(true);

      await expect(listener.hasLotBeenUsed('lot-1', tx)).resolves.toBe(true);
    });

    it('returns false when the lot has never been assigned, activated, or charged', async () => {
      const { listener } = setup();

      await expect(listener.hasLotBeenUsed('lot-1', tx)).resolves.toBe(false);
    });

    it('G-4: fails loudly when GrantRequestGateHook is unbound instead of returning false', async () => {
      const { listener, gate } = setup();
      (gate.isBound as jest.Mock).mockReturnValue(false);
      (gate.get as jest.Mock).mockImplementation(() => {
        throw new Error('Extension hook licensing.grant-request-gate is not bound');
      });

      await expect(listener.hasLotBeenUsed('lot-1', tx)).rejects.toThrow('not bound');
    });

    it('G-8: reads subscription and per-plan occupancy in a single query via occupancyWithPlansOfMany', async () => {
      const { listener } = setup();

      const combined = await listener.seatsAndPlansOfSubscriptions(['sub-seat', 'sub-key-only'], day, tx);
      expect(combined.bySubscription.get('sub-seat')).toEqual({ occupied: 3, inRevocation: 1 });
      expect(combined.bySubscription.get('sub-key-only')).toEqual({ occupied: 4, inRevocation: 0 });
      expect(combined.bySubscriptionPlan.get('sub-seat:plan-1')).toBe(2);
    });

    it('uses 0 from device_activation_occupied when a K4 lot has no open keys even if seatMap reported a closed assignment', async () => {
      const { listener, capacity, deviceActivations } = setup(['lot-empty']);
      (capacity.occupancyOfMany as jest.Mock).mockResolvedValueOnce(
        new Map([['lot-empty', { occupied: 1, inRevocation: 0 }]]),
      );
      (deviceActivations.occupiedBySubscriptions as jest.Mock).mockResolvedValueOnce(new Map());

      const merged = await listener.seatsOfSubscriptions(['lot-empty'], day);
      expect(merged.get('lot-empty')).toEqual({ occupied: 0, inRevocation: 0 });
    });
  });
});
