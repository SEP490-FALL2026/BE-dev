import { actingItAdmins, itAdminLoadOf, judgeAppoint } from './department-it-substitute.policy';

describe('department-it-substitute.policy', () => {
  describe('actingItAdmins', () => {
    it.each([
      {
        label: 'usable in-charge only',
        input: { inCharge: 'ha', inChargeUsable: true, substitute: null, substituteUsable: false },
        expected: { inCharge: 'ha', substitute: null, defaultAssignee: 'ha', actors: ['ha'] },
      },
      {
        label: 'unusable in-charge with no substitute leaves department waiting',
        input: { inCharge: 'ha', inChargeUsable: false, substitute: null, substituteUsable: false },
        expected: { inCharge: null, substitute: null, defaultAssignee: null, actors: [] },
      },
      {
        label: 'usable in-charge and usable substitute both act, substitute is default assignee',
        input: { inCharge: 'ha', inChargeUsable: true, substitute: 'minh', substituteUsable: true },
        expected: { inCharge: 'ha', substitute: 'minh', defaultAssignee: 'minh', actors: ['ha', 'minh'] },
      },
      {
        label: 'unusable in-charge with unusable substitute leaves department waiting',
        input: { inCharge: 'ha', inChargeUsable: false, substitute: 'minh', substituteUsable: false },
        expected: { inCharge: null, substitute: null, defaultAssignee: null, actors: [] },
      },
      {
        label: 'leaver is excluded from acting IT Admins',
        input: { inCharge: 'ha', inChargeUsable: true, substitute: 'minh', substituteUsable: true, leaverId: 'ha' },
        expected: { inCharge: null, substitute: 'minh', defaultAssignee: 'minh', actors: ['minh'] },
      },
      {
        label: 'leaver with no substitute leaves department waiting',
        input: { inCharge: 'ha', inChargeUsable: true, substitute: null, substituteUsable: false, leaverId: 'ha' },
        expected: { inCharge: null, substitute: null, defaultAssignee: null, actors: [] },
      },
      {
        label: 'duplicate id between in-charge and substitute is deduplicated',
        input: { inCharge: 'ha', inChargeUsable: true, substitute: 'ha', substituteUsable: true },
        expected: { inCharge: 'ha', substitute: 'ha', defaultAssignee: 'ha', actors: ['ha'] },
      },
    ])('$label', ({ input, expected }) => {
      expect(actingItAdmins(input)).toEqual(expected);
    });
  });

  describe('judgeAppoint', () => {
    it.each([
      {
        departmentExists: false,
        departmentActive: true,
        hasActiveSubstitute: false,
        currentInChargeEmployeeId: null,
        candidateEmployeeId: 'minh',
        candidateIsUsableItAdmin: true,
        expected: 'MISSING_DEPARTMENT',
      },
      {
        departmentExists: true,
        departmentActive: false,
        hasActiveSubstitute: false,
        currentInChargeEmployeeId: null,
        candidateEmployeeId: 'minh',
        candidateIsUsableItAdmin: true,
        expected: 'INACTIVE_DEPARTMENT',
      },
      {
        departmentExists: true,
        departmentActive: true,
        hasActiveSubstitute: true,
        currentInChargeEmployeeId: 'ha',
        candidateEmployeeId: 'minh',
        candidateIsUsableItAdmin: true,
        expected: 'ALREADY_ACTIVE',
      },
      {
        departmentExists: true,
        departmentActive: true,
        hasActiveSubstitute: false,
        currentInChargeEmployeeId: 'ha',
        candidateEmployeeId: 'minh',
        candidateIsUsableItAdmin: false,
        expected: 'NOT_USABLE_IT_ADMIN',
      },
      {
        departmentExists: true,
        departmentActive: true,
        hasActiveSubstitute: false,
        currentInChargeEmployeeId: 'ha',
        candidateEmployeeId: 'ha',
        candidateIsUsableItAdmin: true,
        expected: 'IS_IN_CHARGE',
      },
      {
        departmentExists: true,
        departmentActive: true,
        hasActiveSubstitute: false,
        currentInChargeEmployeeId: null,
        candidateEmployeeId: 'minh',
        candidateIsUsableItAdmin: true,
        expected: 'OK',
      },
      {
        departmentExists: true,
        departmentActive: true,
        hasActiveSubstitute: false,
        currentInChargeEmployeeId: 'ha',
        candidateEmployeeId: 'minh',
        candidateIsUsableItAdmin: true,
        expected: 'OK',
      },
    ])('-> $expected', (input) => {
      expect(judgeAppoint(input)).toBe(input.expected);
    });
  });

  describe('itAdminLoadOf', () => {
    it.each([
      { employeeId: 'minh', inChargeCount: 4, substituteCount: 0, expectedOverLimit: false },
      { employeeId: 'minh', inChargeCount: 4, substituteCount: 1, expectedOverLimit: true },
      { employeeId: 'lan', inChargeCount: 2, substituteCount: 2, expectedOverLimit: false },
      { employeeId: 'lan', inChargeCount: 3, substituteCount: 2, expectedOverLimit: true },
    ])(
      '$inChargeCount + $substituteCount -> overLimit=$expectedOverLimit',
      ({ employeeId, inChargeCount, substituteCount, expectedOverLimit }) => {
        expect(itAdminLoadOf({ employeeId, inChargeCount, substituteCount })).toEqual({
          employeeId,
          inChargeCount,
          substituteCount,
          overLimit: expectedOverLimit,
        });
      },
    );
  });
});
