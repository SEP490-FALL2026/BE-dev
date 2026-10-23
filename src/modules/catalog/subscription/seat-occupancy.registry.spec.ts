import type { SeatOccupancyReader } from '../catalog.types';
import { SeatOccupancyNotRegisteredError, SeatOccupancyRegistry } from './seat-occupancy.registry';

const reader = (label: string): SeatOccupancyReader => ({
  occupiedBySubscription: () => Promise.resolve(label.length),
  openHolderCount: () => Promise.resolve(0),
  openAssignmentsOfPlans: () => Promise.resolve({ items: [], total: 0, byPlan: [] }),
});

describe('where licensing hands the catalog its reader of occupied seats (ADR-0013 item 4)', () => {
  it('fails loudly while no reader is registered, instead of letting a rule that needs the seats pass', () => {
    expect(() => new SeatOccupancyRegistry().current()).toThrow(SeatOccupancyNotRegisteredError);
  });

  it('answers with the reader that was registered, and the last registration replaces the one before', async () => {
    const registry = new SeatOccupancyRegistry();
    registry.register(reader('abc'));
    expect(await registry.current().occupiedBySubscription('s', '2026-10-20')).toBe(3);

    registry.register(reader('abcdef'));

    expect(await registry.current().occupiedBySubscription('s', '2026-10-20')).toBe(6);
  });
});
