import { toChange } from '../offboarding.mapper';
import type { OffboardingChangeRecord } from '../offboarding.types';

const change = (extra: Partial<OffboardingChangeRecord> = {}): OffboardingChangeRecord => ({
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'ACCESS_BLOCKED',
  oldLastWorkingDay: null,
  newLastWorkingDay: null,
  reason: null,
  detail: null,
  changedByAppUserId: null,
  changedByTicketId: null,
  changedAt: new Date('2026-11-13T01:00:00Z'),
  ...extra,
});

describe('who did a line of the log of a departure (the wire tells an account, the controlled procedure and the system apart)', () => {
  it.each([
    [
      'an account',
      { changedByAppUserId: 'account-1' },
      { changedByAppUserId: 'account-1', byProcedure: false, bySystem: false },
    ],
    [
      'the controlled procedure',
      { changedByTicketId: 'ticket-1' },
      { changedByAppUserId: null, byProcedure: true, bySystem: false },
    ],
    [
      'the system, which has no account and no ticket (the block, the lock of the mailbox, the closing)',
      {},
      { changedByAppUserId: null, byProcedure: false, bySystem: true },
    ],
  ])('names %s', (_name, who, expected) => {
    const wire = toChange(change(who));

    expect(wire).toMatchObject({
      changedByAppUserId: expected.changedByAppUserId,
      changedByProcedure: expected.byProcedure,
      changedBySystem: expected.bySystem,
    });
  });

  it('counts the rights asked for only on the line that opened the revocations', () => {
    expect(toChange(change({ kind: 'REVOCATIONS_OPENED', detail: { count: 3 } })).count).toBe(3);
    expect(toChange(change({ kind: 'CLOSED_BY_SYSTEM', detail: { count: 3 } })).count).toBeNull();
  });
});
