import { notYetBlocked, othersWorking, workingAdminCount } from './vendor-admin-roles.policy';

describe('vendor-admin-roles.policy (QĐ-110k: what is left of a plan at the vendor without one admin)', () => {
  const members = [{ employeeId: 'a' }, { employeeId: 'b' }, { employeeId: 'c' }];

  it('counts the other admins who still work as IT Admins, each person once, the one who leaves apart', () => {
    expect(othersWorking(members, new Set(['a', 'b', 'c']), 'a')).toBe(2);
    expect(othersWorking(members, new Set(['b']), 'a')).toBe(1);
    expect(othersWorking([...members, { employeeId: 'b' }], new Set(['a', 'b', 'c']), 'a')).toBe(2);
  });

  it('does not count a person who no longer works as an IT Admin', () => {
    expect(othersWorking(members, new Set(['a', 'c']), 'a')).toBe(1);
  });

  it('is zero when nobody else works, or the person is the only one recorded', () => {
    expect(othersWorking(members, new Set(['a']), 'a')).toBe(0);
    expect(othersWorking([{ employeeId: 'a' }], new Set(['a']), 'a')).toBe(0);
    expect(othersWorking([], new Set(['a']), 'a')).toBe(0);
  });
});

describe('vendor-admin-roles.policy: who a departure has not blocked yet', () => {
  const today = '2026-11-13';

  it('keeps a person no departure blocks, and one whose block begins after today', () => {
    const blocked = new Map([['b', '2026-11-14']]);

    expect([...notYetBlocked(new Set(['a', 'b']), blocked, today)].sort()).toEqual(['a', 'b']);
  });

  it('drops a person whose block begins today or began before', () => {
    const blocked = new Map([
      ['a', today],
      ['b', '2026-11-01'],
    ]);

    expect([...notYetBlocked(new Set(['a', 'b', 'c']), blocked, today)]).toEqual(['c']);
  });
});

describe('vendor-admin-roles.policy: how many admins of a plan work (the count behind the flag of the overviews)', () => {
  const members = [{ employeeId: 'a' }, { employeeId: 'b' }, { employeeId: 'a' }];

  it('counts each person once and only the ones who work', () => {
    expect(workingAdminCount(members, new Set(['a', 'b']))).toBe(2);
    expect(workingAdminCount(members, new Set(['a']))).toBe(1);
    expect(workingAdminCount(members, new Set())).toBe(0);
  });

  it('is zero for a plan with no profile', () => {
    expect(workingAdminCount([], new Set(['a']))).toBe(0);
  });
});
