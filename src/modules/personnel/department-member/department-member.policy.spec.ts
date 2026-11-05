import { memberReadVerdict } from './department-member.policy';

describe('memberReadVerdict (QĐ-41c(2): a head reads the people of their own department only)', () => {
  it.each([
    ['allows the head to read a person placed in the department today', true, true, true, 'ALLOWED'],
    [
      'does not find a person who is not placed in the department today (moved away, or never was)',
      true,
      true,
      false,
      'NOT_FOUND',
    ],
    ['refuses the one who heads another department', false, true, true, 'OUT_OF_SCOPE'],
    ['refuses the one who heads none, whoever the person is', false, true, false, 'OUT_OF_SCOPE'],
    ['does not find a department that does not exist, for the one who heads none', false, false, false, 'NOT_FOUND'],
  ] as const)('%s', (_name, headsThisDepartment, departmentExists, placedHere, expected) => {
    expect(memberReadVerdict({ headsThisDepartment, departmentExists, placedHere })).toBe(expected);
  });
});
