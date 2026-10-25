import { selfActionMode } from './personnel-self-action.policy';

describe('an IT Admin recording an event about themselves (US-03-01 AC-22, SoD-5)', () => {
  it.each([
    [{ isSelf: false, otherUsableItAdmins: 0 }, 'ALLOW'],
    [{ isSelf: false, otherUsableItAdmins: 3 }, 'ALLOW'],
    [{ isSelf: true, otherUsableItAdmins: 1 }, 'NEEDS_ANOTHER_IT_ADMIN'],
    [{ isSelf: true, otherUsableItAdmins: 4 }, 'NEEDS_ANOTHER_IT_ADMIN'],
    [{ isSelf: true, otherUsableItAdmins: 0 }, 'ALLOW_SELF_EXECUTED'],
  ] as const)('%j is %s', (facts, mode) => {
    expect(selfActionMode(facts)).toBe(mode);
  });
});
