export interface MemberReadFacts {
  /** The caller heads the department today. */
  headsThisDepartment: boolean;
  /** The department exists (read only when the caller does not head it). */
  departmentExists: boolean;
  /** The person is placed in the department today (read only when the caller heads it). */
  placedHere: boolean;
}

export type MemberReadVerdict = 'ALLOWED' | 'OUT_OF_SCOPE' | 'NOT_FOUND';

/**
 * Whether a department head may read one person of their department today (`QĐ-41c`(2)). Someone who does not head the department is
 * told it is out of their scope when it exists and that it is not found when it does not; for the head, a person who is not placed
 * in the department today, who moved away or never was, is not found, the same as a person who does not exist.
 */
export function memberReadVerdict(facts: MemberReadFacts): MemberReadVerdict {
  if (!facts.headsThisDepartment) return facts.departmentExists ? 'OUT_OF_SCOPE' : 'NOT_FOUND';

  return facts.placedHere ? 'ALLOWED' : 'NOT_FOUND';
}
