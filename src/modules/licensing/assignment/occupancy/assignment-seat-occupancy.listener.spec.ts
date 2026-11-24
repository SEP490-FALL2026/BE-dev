import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SeatOccupancyHook } from '../../../catalog/public/catalog.extension-points';
import type { DeviceActivationRepo } from '../../device-activation/device-activation.repo';
import type { SharedPoolCapacityRepo } from '../../shared-pool/shared-pool-capacity.repo';
import type { AssignmentRepo } from '../assignment.repo';
import { AssignmentSeatOccupancy } from './assignment-seat-occupancy.listener';

describe('AssignmentSeatOccupancy (S-6)', () => {
  const tx = {} as DbTx;
  const day = '2026-11-24';

  function setup() {
    const repo = {
      countHolding: jest.fn().mockResolvedValue(2),
      countHoldersOfPlans: jest.fn().mockResolvedValue(0),
      subscriptionIdsHolding: jest.fn().mockResolvedValue(new Set(['sub-seat'])),
      holdingOfPlans: jest.fn().mockResolvedValue({ items: [], byPlan: [] }),
    } as unknown as AssignmentRepo;

    const capacity = {
      occupancyOf: jest.fn().mockResolvedValue(new Map([['sub-seat', { occupied: 2, inRevocation: 1 }]])),
      occupancyOfMany: jest.fn().mockResolvedValue(new Map([['sub-seat', { occupied: 2, inRevocation: 1 }]])),
    } as unknown as SharedPoolCapacityRepo;

    const deviceActivations = {
      occupiedBySubscription: jest.fn().mockResolvedValue(3),
      occupiedBySubscriptions: jest.fn().mockResolvedValue(
        new Map([
          ['sub-seat', 1],
          ['sub-key-only', 4],
        ]),
      ),
    } as unknown as DeviceActivationRepo;

    const hook = { bind: jest.fn() } as unknown as SeatOccupancyHook;
    const listener = new AssignmentSeatOccupancy(repo, capacity, deviceActivations, hook);

    return { listener, repo, capacity, deviceActivations };
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
});
