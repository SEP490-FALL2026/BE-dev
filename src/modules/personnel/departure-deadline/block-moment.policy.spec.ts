import {
  accountLockOverdueOwed,
  blockMomentReached,
  firstDayRefused,
  superAdminToMarkLeft,
} from './block-moment.policy';

describe('the first day a departure refuses the person (QĐ-100q, QĐ-110b)', () => {
  const block = { blockedFrom: '2026-10-31' };

  it('is the day of the block for a handover under way, and the earlier of the block and the day they left for a person who left', () => {
    expect(firstDayRefused({ state: 'HANDING_OVER', leftOn: null }, block)).toBe('2026-10-31');
    expect(firstDayRefused({ state: 'LEFT', leftOn: '2026-10-20' }, block)).toBe('2026-10-20');
    expect(firstDayRefused({ state: 'LEFT', leftOn: '2026-11-05' }, block)).toBe('2026-10-31');
    expect(firstDayRefused({ state: 'LEFT', leftOn: '2026-11-05' }, null)).toBe('2026-11-05');
  });

  it('is nothing for a cancelled case or a handover with no block of its own', () => {
    expect(firstDayRefused({ state: 'CANCELLED', leftOn: null }, block)).toBeNull();
    expect(firstDayRefused({ state: 'HANDING_OVER', leftOn: null }, null)).toBeNull();
  });
});

describe('the block moment of a departure (QĐ-110b, QĐ-110d): when the system announces it', () => {
  const open = { state: 'HANDING_OVER', closed: false, announced: false, refusedFrom: '2026-10-01' } as const;

  it.each([
    ['on the first day the person is refused', open, '2026-10-01', true],
    ['on any later day, until it is announced', open, '2026-10-09', true],
    ['not the day before the block', open, '2026-09-30', false],
    ['not twice', { ...open, announced: true }, '2026-10-01', false],
    [
      'not for a cancelled case: cancelled before the moment, nothing is announced',
      { ...open, state: 'CANCELLED' },
      '2026-10-02',
      false,
    ],
    ['not for a closed case', { ...open, closed: true }, '2026-10-02', false],
    ['not when no day refuses the person', { ...open, refusedFrom: null }, '2026-10-02', false],
    ['for a person already marked as left whom nobody announced', { ...open, state: 'LEFT' }, '2026-10-02', true],
  ] as const)('is reached %s', (_name, facts, today, reached) => {
    expect(blockMomentReached(facts, today)).toBe(reached);
  });

  it('asks the Super Admin to mark the person as left only while the handover is under way', () => {
    expect(superAdminToMarkLeft('HANDING_OVER')).toBe(true);
    expect(superAdminToMarkLeft('LEFT')).toBe(false);
  });
});

describe('the lock of the company account of a departure blocked now (QĐ-94m, R-1)', () => {
  const lacking = {
    state: 'HANDING_OVER',
    closed: false,
    accessBlockMode: 'BLOCK_NOW',
    accountLocked: false,
    recordedOn: '2026-11-12',
  } as const;

  it.each([
    ['not on the day it was recorded: the day is not over', lacking, '2026-11-12', false],
    ['from the next day, when the lock is still not written', lacking, '2026-11-13', true],
    ['not when the lock is written', { ...lacking, accountLocked: true }, '2026-11-13', false],
    [
      'not for a departure with a last working day',
      { ...lacking, accessBlockMode: 'WITH_LAST_DAY' },
      '2026-11-13',
      false,
    ],
    ['not for a cancelled case', { ...lacking, state: 'CANCELLED' }, '2026-11-13', false],
    ['not for a closed case', { ...lacking, closed: true }, '2026-11-13', false],
    ['for a person marked as left whose account was never locked', { ...lacking, state: 'LEFT' }, '2026-11-14', true],
  ] as const)('is overdue %s', (_name, facts, today, overdue) => {
    expect(accountLockOverdueOwed(facts, today)).toBe(overdue);
  });
});
