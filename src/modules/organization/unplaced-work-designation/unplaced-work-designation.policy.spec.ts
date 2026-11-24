import { UnplacedWorkDesignationForbiddenError } from './unplaced-work-designation.errors';
import {
  assertMayManageUnplacedWorkDesignations,
  judgeAppointUnplacedWork,
  resolveUnplacedWorkDesignee,
  unplacedWorkDesignationListScope,
} from './unplaced-work-designation.policy';

describe('unplaced-work-designation.policy', () => {
  describe('judgeAppointUnplacedWork', () => {
    it.each([
      {
        label: 'missing target employee takes precedence',
        input: {
          employeeExists: false,
          employeeHasAnyPlacement: true,
          designeeIsUsableItAdmin: false,
          hasAnyActiveDesignation: true,
        },
        expected: 'MISSING_EMPLOYEE',
      },
      {
        label: 'employee with any past, present, or future placement is refused',
        input: {
          employeeExists: true,
          employeeHasAnyPlacement: true,
          designeeIsUsableItAdmin: false,
          hasAnyActiveDesignation: true,
        },
        expected: 'EMPLOYEE_PLACED',
      },
      {
        label: 'designee who is not an active usable IT Admin is refused',
        input: {
          employeeExists: true,
          employeeHasAnyPlacement: false,
          designeeIsUsableItAdmin: false,
          hasAnyActiveDesignation: true,
        },
        expected: 'NOT_USABLE_IT_ADMIN',
      },
      {
        label: 'work that already has an active designation is refused',
        input: {
          employeeExists: true,
          employeeHasAnyPlacement: false,
          designeeIsUsableItAdmin: true,
          hasAnyActiveDesignation: true,
        },
        expected: 'ALREADY_ACTIVE',
      },
      {
        label: 'never-placed employee, usable IT Admin designee, and no active designation is allowed',
        input: {
          employeeExists: true,
          employeeHasAnyPlacement: false,
          designeeIsUsableItAdmin: true,
          hasAnyActiveDesignation: false,
        },
        expected: 'OK',
      },
    ])('$label -> $expected', ({ input, expected }) => {
      expect(judgeAppointUnplacedWork(input)).toBe(expected);
    });
  });

  describe('resolveUnplacedWorkDesignee', () => {
    const base = {
      designationEmployeeId: 'emp-binh',
      workEmployeeId: 'emp-binh',
      employeeHasAnyPlacement: false,
      designeeEmployeeId: 'emp-it-b',
      designeeActive: true,
      designeeUsable: true,
    };

    it('returns the designee when employee matches, has never been placed, and designee is active and usable', () => {
      expect(resolveUnplacedWorkDesignee(base)).toBe('emp-it-b');
    });

    it.each([
      { label: 'employee mismatch', patch: { workEmployeeId: 'emp-other' } },
      { label: 'employee has a placement', patch: { employeeHasAnyPlacement: true } },
      { label: 'designee is terminated', patch: { designeeActive: false } },
      { label: 'designee account is not usable', patch: { designeeUsable: false } },
    ])('returns null when $label', ({ patch }) => {
      expect(resolveUnplacedWorkDesignee({ ...base, ...patch })).toBeNull();
    });
  });

  describe('authorization policies', () => {
    it('allows only SUPER_ADMIN to appoint or end unplaced-work designations', () => {
      expect(() => assertMayManageUnplacedWorkDesignations(['SUPER_ADMIN'])).not.toThrow();
      expect(() => assertMayManageUnplacedWorkDesignations(['IT_ADMIN'])).toThrow(
        UnplacedWorkDesignationForbiddenError,
      );
      expect(() => assertMayManageUnplacedWorkDesignations([])).toThrow(UnplacedWorkDesignationForbiddenError);
    });

    it('grants SUPER_ADMIN ALL and IT_ADMIN DESIGNEE_ONLY for listing, and refuses other roles', () => {
      expect(unplacedWorkDesignationListScope(['SUPER_ADMIN'])).toBe('ALL');
      expect(unplacedWorkDesignationListScope(['IT_ADMIN'])).toBe('DESIGNEE_ONLY');
      expect(unplacedWorkDesignationListScope(['SUPER_ADMIN', 'IT_ADMIN'])).toBe('ALL');
      expect(() => unplacedWorkDesignationListScope(['MANAGER'])).toThrow(UnplacedWorkDesignationForbiddenError);
      expect(() => unplacedWorkDesignationListScope(['EMPLOYEE'])).toThrow(UnplacedWorkDesignationForbiddenError);
    });
  });
});
