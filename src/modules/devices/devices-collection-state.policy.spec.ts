import { collectionStateOf } from './devices-collection-state.policy';

const at = new Date('2026-11-05T00:00:00.000Z');

describe('collectionStateOf', () => {
  it('reads a retired machine as retired whatever its last registration says', () => {
    expect(
      collectionStateOf({ retiredAt: at, registration: { acknowledgedFrom: at, collectionStoppedAt: null } }),
    ).toBe('RETIRED');
  });

  it('reads a machine nobody holds as unregistered', () => {
    expect(collectionStateOf({ retiredAt: null, registration: null })).toBe('UNREGISTERED');
  });

  it('reads a stopped registration as stopped, an acknowledged one as active and a new one as waiting', () => {
    expect(
      collectionStateOf({ retiredAt: null, registration: { acknowledgedFrom: null, collectionStoppedAt: at } }),
    ).toBe('COLLECTION_STOPPED');
    expect(
      collectionStateOf({ retiredAt: null, registration: { acknowledgedFrom: at, collectionStoppedAt: null } }),
    ).toBe('ACTIVE');
    expect(
      collectionStateOf({ retiredAt: null, registration: { acknowledgedFrom: null, collectionStoppedAt: null } }),
    ).toBe('AWAITING_ACKNOWLEDGEMENT');
  });
});
