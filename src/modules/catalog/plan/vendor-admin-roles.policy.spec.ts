import { othersWorking } from './vendor-admin-roles.policy';

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
