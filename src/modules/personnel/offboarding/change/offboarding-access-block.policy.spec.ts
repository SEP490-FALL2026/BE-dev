import {
  accessBlockedFrom,
  accountLockRefusal,
  isBlocked,
  leavesAtOnce,
  markLeftRefusal,
  ownBlock,
} from '../offboarding.policy';

const code = (refusal: { code: string } | null) => refusal?.code ?? null;

/** The block a departure puts on the access of a person (`QĐ-100q`) and the day the person leaves (`Q-04` B). */
describe('when a departure blocks the person and when they leave', () => {
  it('lets the departure come on the last working day or after it, never before (Q-04 B)', () => {
    const base = { state: 'HANDING_OVER' as const, lastWorkingDay: '2026-11-10' };

    expect(markLeftRefusal({ ...base, today: '2026-11-10' })).toBeNull();
    expect(markLeftRefusal({ ...base, today: '2026-11-25' })).toBeNull();
    const ahead = markLeftRefusal({ ...base, today: '2026-11-09' });
    expect(code(ahead)).toBe('LAST_WORKING_DAY_AHEAD');
    expect(ahead?.details).toEqual({ lastWorkingDay: '2026-11-10' });
    expect(code(markLeftRefusal({ ...base, state: 'LEFT', today: '2026-11-25' }))).toBe('CASE_LEFT');
  });

  it('leaves the person at once only for a departure blocked now whose last working day is not ahead (AC-18)', () => {
    const base = { today: '2026-11-10' };

    expect(leavesAtOnce({ ...base, accessBlockMode: 'BLOCK_NOW', lastWorkingDay: '2026-11-09' })).toBe(true);
    expect(leavesAtOnce({ ...base, accessBlockMode: 'BLOCK_NOW', lastWorkingDay: '2026-11-10' })).toBe(true);
    expect(leavesAtOnce({ ...base, accessBlockMode: 'BLOCK_NOW', lastWorkingDay: '2026-11-11' })).toBe(false);
    expect(leavesAtOnce({ ...base, accessBlockMode: 'WITH_LAST_DAY', lastWorkingDay: '2026-11-10' })).toBe(false);
  });

  it('writes the lock of the account once and only for a person who is blocked', () => {
    expect(accountLockRefusal({ blocked: true, locked: false })).toBeNull();
    expect(code(accountLockRefusal({ blocked: true, locked: true }))).toBe('ALREADY_RECORDED');
    expect(code(accountLockRefusal({ blocked: false, locked: false }))).toBe('CASE_NOT_BLOCKED');
  });

  it('blocks a person who has left, or whose block is in force, and nobody else', () => {
    const block = { blockedFrom: '2026-10-31' };
    expect(isBlocked({ state: 'HANDING_OVER' }, block, '2026-10-30')).toBe(false);
    expect(isBlocked({ state: 'HANDING_OVER' }, block, '2026-10-31')).toBe(true);
    expect(isBlocked({ state: 'HANDING_OVER' }, null, '2026-12-01')).toBe(false);
    expect(isBlocked({ state: 'LEFT' }, null, '2026-10-01')).toBe(true);
    expect(isBlocked({ state: 'CANCELLED' }, null, '2026-12-01')).toBe(false);
  });

  it('names the first day the departure refuses the person', () => {
    const block = { blockedFrom: '2026-10-31' };
    expect(accessBlockedFrom({ state: 'HANDING_OVER', leftOn: null }, block)).toBe('2026-10-31');
    expect(accessBlockedFrom({ state: 'LEFT', leftOn: '2026-10-20' }, block)).toBe('2026-10-20');
    expect(accessBlockedFrom({ state: 'LEFT', leftOn: '2026-11-05' }, block)).toBe('2026-10-31');
    expect(accessBlockedFrom({ state: 'LEFT', leftOn: '2026-11-05' }, null)).toBe('2026-11-05');
    // A cancelled case refuses nobody: the block it left in force belongs to the account and is lifted with an unlock.
    expect(accessBlockedFrom({ state: 'CANCELLED', leftOn: null }, block)).toBeNull();
    expect(accessBlockedFrom({ state: 'CANCELLED', leftOn: null }, null)).toBeNull();
  });

  it('shows a block only to the case that wrote it', () => {
    const block = { blockedFrom: '2026-10-31', sourceCaseId: 'case-1' };

    expect(ownBlock(block, 'case-1')).toBe(block);
    expect(ownBlock(block, 'case-2')).toBeNull();
    expect(ownBlock(null, 'case-1')).toBeNull();
  });
});
