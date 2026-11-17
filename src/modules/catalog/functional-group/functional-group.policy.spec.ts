import { FunctionalGroupFixedError } from './functional-group.errors';
import { assertGroupChangeAllowed } from './functional-group.policy';

const fixed = (systemKey: 'COMMUNICATION' | 'OTHER') => ({ name: 'Khác', status: 'ACTIVE' as const, systemKey });
const custom = { name: 'Design', status: 'ACTIVE' as const, systemKey: null };

describe('assertGroupChangeAllowed (QĐ-111bf: Liên lạc and Khác are fixed)', () => {
  it.each(['COMMUNICATION', 'OTHER'] as const)('refuses to rename or to switch off the fixed group %s', (key) => {
    expect(() => assertGroupChangeAllowed(fixed(key), { name: 'Something else' })).toThrow(FunctionalGroupFixedError);
    expect(() => assertGroupChangeAllowed(fixed(key), { status: 'INACTIVE' })).toThrow(FunctionalGroupFixedError);
  });

  it('lets a request that changes nothing of a fixed group through: the same name, the status it already has', () => {
    expect(() => assertGroupChangeAllowed(fixed('OTHER'), { name: 'Khác', status: 'ACTIVE' })).not.toThrow();
  });

  it('lets a group with no system key be renamed and switched off', () => {
    expect(() => assertGroupChangeAllowed(custom, { name: 'Interface design' })).not.toThrow();
    expect(() => assertGroupChangeAllowed(custom, { status: 'INACTIVE' })).not.toThrow();
  });
});
