import { sessionWindowOf } from './credential-session.policy';

const now = new Date('2026-11-05T10:00:00.000Z');

describe('sessionWindowOf', () => {
  it('waits, accepting nothing, until the holder has acknowledged', () => {
    expect(sessionWindowOf({ acknowledgedFrom: null, collectionStoppedAt: null }, now)).toEqual({
      state: 'AWAITING_ACKNOWLEDGEMENT',
      acceptFromAt: null,
      acceptUntilAt: null,
    });
  });

  it('accepts data from the acknowledgement on', () => {
    const acknowledgedFrom = new Date('2026-10-01T00:00:00.000Z');

    expect(sessionWindowOf({ acknowledgedFrom, collectionStoppedAt: null }, now)).toEqual({
      state: 'ACTIVE',
      acceptFromAt: acknowledgedFrom,
      acceptUntilAt: null,
    });
  });

  it('never accepts data older than six months, however long ago the holder acknowledged', () => {
    const window = sessionWindowOf(
      { acknowledgedFrom: new Date('2025-01-01T00:00:00.000Z'), collectionStoppedAt: null },
      now,
    );

    expect(window.acceptFromAt?.toISOString()).toBe('2026-05-05T10:00:00.000Z');
  });

  it('accepts nothing newer than the stop once the collection is stopped', () => {
    const stopped = new Date('2026-11-01T08:00:00.000Z');

    expect(sessionWindowOf({ acknowledgedFrom: null, collectionStoppedAt: stopped }, now)).toEqual({
      state: 'COLLECTION_STOPPED',
      acceptFromAt: null,
      acceptUntilAt: stopped,
    });
  });
});
