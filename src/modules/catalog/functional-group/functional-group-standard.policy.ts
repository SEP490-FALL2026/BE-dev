import { searchKey } from '../../../core/search-key';

/** The two groups the system itself relies on: they are never renamed or switched off, and an application with no group goes to `OTHER`. */
export type FunctionalGroupSystemKey = 'COMMUNICATION' | 'OTHER';

export interface StandardFunctionalGroup {
  name: string;
  systemKey: FunctionalGroupSystemKey | null;
}

/**
 * The seven groups an organization starts with, in the order of the form (`QĐ-111d`, `QĐ-111bf`). The five others can be renamed or
 * switched off by the IT Admin; _Liên lạc_ marks the applications the usage rules never collect (`QĐ-111e`) and _Khác_ takes every
 * application declared with no group. The migration `…_ct1_functional_groups_system_key` writes the same seven in SQL, with the
 * search key of each name written out; its test compares them with this list.
 */
export const STANDARD_FUNCTIONAL_GROUPS: readonly StandardFunctionalGroup[] = [
  { name: 'Trợ lý AI', systemKey: null },
  { name: 'Thiết kế & sáng tạo', systemKey: null },
  { name: 'Lập trình & kỹ thuật', systemKey: null },
  { name: 'Văn phòng & cộng tác', systemKey: null },
  { name: 'Chuyên ngành', systemKey: null },
  { name: 'Khác', systemKey: 'OTHER' },
  { name: 'Liên lạc (email, chat, họp)', systemKey: 'COMMUNICATION' },
];

/** The group an application declared with none is put in. */
export const DEFAULT_GROUP_KEY: FunctionalGroupSystemKey = 'OTHER';

/** A group is fixed when the system relies on it: it cannot be renamed or switched off. */
export function isFixedGroup(group: { systemKey: FunctionalGroupSystemKey | null }): boolean {
  return group.systemKey !== null;
}

/** The system key a name stands for when compared by its search key (an older group called _Khác_ is the fixed one), or null. */
export function systemKeyOfStandardName(name: string): FunctionalGroupSystemKey | null {
  const key = searchKey(name);

  return STANDARD_FUNCTIONAL_GROUPS.find((group) => searchKey(group.name) === key)?.systemKey ?? null;
}
