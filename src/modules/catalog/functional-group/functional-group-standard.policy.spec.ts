import { searchKey } from '../../../core/search-key';
import { STANDARD_FUNCTIONAL_GROUPS, isFixedGroup, systemKeyOfStandardName } from './functional-group-standard.policy';

describe('the standard functional groups', () => {
  it('are the seven of the Owner, in the order of the form', () => {
    expect(STANDARD_FUNCTIONAL_GROUPS.map((group) => group.name)).toEqual([
      'Trợ lý AI',
      'Thiết kế & sáng tạo',
      'Lập trình & kỹ thuật',
      'Văn phòng & cộng tác',
      'Chuyên ngành',
      'Khác',
      'Liên lạc (email, chat, họp)',
    ]);
  });

  it('have two fixed ones, Liên lạc and Khác, and no two names a person could not tell apart', () => {
    expect(STANDARD_FUNCTIONAL_GROUPS.filter((group) => group.systemKey !== null)).toEqual([
      { name: 'Khác', systemKey: 'OTHER' },
      { name: 'Liên lạc (email, chat, họp)', systemKey: 'COMMUNICATION' },
    ]);
    const keys = STANDARD_FUNCTIONAL_GROUPS.map((group) => searchKey(group.name));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is fixed when it carries a system key, never otherwise', () => {
    expect(isFixedGroup({ systemKey: 'OTHER' })).toBe(true);
    expect(isFixedGroup({ systemKey: 'COMMUNICATION' })).toBe(true);
    expect(isFixedGroup({ systemKey: null })).toBe(false);
  });

  it('knows the system key of a name by its search key, so an older group called Khác is adopted', () => {
    expect(systemKeyOfStandardName('  KHAC ')).toBe('OTHER');
    expect(systemKeyOfStandardName('Liên lạc (email, chat, họp)')).toBe('COMMUNICATION');
    expect(systemKeyOfStandardName('Design')).toBeNull();
  });
});
