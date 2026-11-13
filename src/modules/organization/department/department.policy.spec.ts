import { DepartmentForbiddenError, DepartmentItAdminLimitReachedError } from './department.errors';
import {
  IT_ADMIN_DEPARTMENT_LIMIT,
  ItAdminScopeFacts,
  assertItAdminHasRoom,
  assertMayChangeOrganization,
  departmentListScope,
  departmentReadVerdict,
  itAdminScope,
  memberReadVerdict,
  successorProblem,
  technicalReadVerdict,
} from './department.policy';

describe('department.policy (who may do what with departments, F13, QĐ-87a, QĐ-87b(4))', () => {
  describe('assertMayChangeOrganization', () => {
    it('lets the Super Admin change a department, its head, its successor and its IT Admin in charge', () => {
      expect(() => assertMayChangeOrganization(['SUPER_ADMIN'])).not.toThrow();
      expect(() => assertMayChangeOrganization(['SUPER_ADMIN', 'IT_ADMIN'])).not.toThrow();
    });

    it.each([[['IT_ADMIN']], [['FINANCE']], [['MANAGER']], [['EMPLOYEE']], [[]]])(
      'refuses %j, the IT Admin included: losing the write right is what QĐ-87a decided',
      (roles) => {
        expect(() => assertMayChangeOrganization(roles)).toThrow(DepartmentForbiddenError);
      },
    );
  });

  describe('departmentListScope', () => {
    it('gives the Super Admin every department and an IT Admin those in their scope', () => {
      expect(departmentListScope(['SUPER_ADMIN'])).toBe('ALL');
      expect(departmentListScope(['IT_ADMIN'])).toBe('IT_ADMIN_SCOPE');
      // Both: the wider answer wins, the Super Admin loses nothing by also holding the technical role.
      expect(departmentListScope(['IT_ADMIN', 'SUPER_ADMIN'])).toBe('ALL');
    });

    it.each([[['FINANCE']], [['MANAGER']], [[]]])('gives %j no list of departments', (roles) => {
      expect(() => departmentListScope(roles)).toThrow(DepartmentForbiddenError);
    });
  });

  describe('departmentReadVerdict', () => {
    const verdict = (roles: string[], headsThisDepartment: boolean, inItAdminScope: boolean) =>
      departmentReadVerdict({ roles, headsThisDepartment, inItAdminScope });

    it('lets the Super Admin read every department', () => {
      expect(verdict(['SUPER_ADMIN'], false, false)).toBe('ALLOWED');
    });

    it('lets an IT Admin read a department in their scope and answers NOT_FOUND for any other, so it does not tell it is there (F12)', () => {
      expect(verdict(['IT_ADMIN'], false, true)).toBe('ALLOWED');
      expect(verdict(['IT_ADMIN'], false, false)).toBe('NOT_FOUND');
    });

    it('lets a head read the department they head and refuses another with OUT_OF_SCOPE (SoD-2)', () => {
      expect(verdict(['MANAGER'], true, false)).toBe('ALLOWED');
      expect(verdict(['MANAGER'], false, false)).toBe('OUT_OF_SCOPE');
    });

    it('refuses every other role', () => {
      expect(verdict(['FINANCE'], false, false)).toBe('FORBIDDEN');
      expect(verdict([], true, true)).toBe('FORBIDDEN');
    });
  });

  describe('memberReadVerdict (the people of a department in full)', () => {
    it('lets the Super Admin and the head of that department read them, and nobody else, the IT Admin included', () => {
      expect(memberReadVerdict({ roles: ['SUPER_ADMIN'], headsThisDepartment: false })).toBe('ALLOWED');
      expect(memberReadVerdict({ roles: ['MANAGER'], headsThisDepartment: true })).toBe('ALLOWED');
      expect(memberReadVerdict({ roles: ['MANAGER'], headsThisDepartment: false })).toBe('OUT_OF_SCOPE');
      expect(memberReadVerdict({ roles: ['IT_ADMIN'], headsThisDepartment: false })).toBe('FORBIDDEN');
    });
  });

  describe('technicalReadVerdict (the technical view of the people, F12)', () => {
    it('is for the IT Admin, for a department in their scope; any other department is as if it were not there', () => {
      expect(technicalReadVerdict({ roles: ['IT_ADMIN'], inItAdminScope: true })).toBe('ALLOWED');
      expect(technicalReadVerdict({ roles: ['IT_ADMIN'], inItAdminScope: false })).toBe('NOT_FOUND');
    });

    it('is not for the other roles, whatever their scope', () => {
      expect(technicalReadVerdict({ roles: ['SUPER_ADMIN'], inItAdminScope: true })).toBe('FORBIDDEN');
      expect(technicalReadVerdict({ roles: ['MANAGER'], inItAdminScope: true })).toBe('FORBIDDEN');
    });
  });

  describe('itAdminScope', () => {
    const department = (over: Partial<ItAdminScopeFacts> & { id: string }): ItAdminScopeFacts => ({
      active: true,
      itAdminEmployeeId: null,
      itAdminUsable: false,
      ...over,
    });

    it('takes the departments that name the caller, and the active ones nobody usable is in charge of', () => {
      const scope = itAdminScope('me', [
        department({ id: 'mine', itAdminEmployeeId: 'me', itAdminUsable: true }),
        department({ id: 'other-usable', itAdminEmployeeId: 'someone', itAdminUsable: true }),
        department({ id: 'other-unusable', itAdminEmployeeId: 'someone', itAdminUsable: false }),
        department({ id: 'nobody' }),
        department({ id: 'retired-nobody', active: false }),
      ]);

      expect([...scope].sort()).toEqual(['mine', 'nobody', 'other-unusable']);
    });

    it('keeps a retired department the caller was in charge of, and drops one only others answer for', () => {
      const scope = itAdminScope('me', [
        department({ id: 'was-mine', active: false, itAdminEmployeeId: 'me', itAdminUsable: true }),
        department({ id: 'theirs', itAdminEmployeeId: 'someone', itAdminUsable: true }),
      ]);

      expect([...scope]).toEqual(['was-mine']);
    });
  });

  describe('successorProblem (the person named to take over, D-5 of QĐ-87)', () => {
    const facts = {
      today: '2026-10-28',
      effectiveFrom: '2026-11-01',
      currentHeadEmployeeId: 'head',
      candidateEmployeeId: 'next',
    };

    it('finds nothing wrong with a day after today, a department with a head and somebody else', () => {
      expect(successorProblem(facts)).toBeNull();
    });

    it.each(['2026-10-28', '2026-10-01'])(
      'refuses %s: the successor takes over from a day after today',
      (effectiveFrom) => {
        expect(successorProblem({ ...facts, effectiveFrom })).toBe('SUCCESSOR_DATE_NOT_FUTURE');
      },
    );

    it('refuses a department nobody heads today: the person is named its head instead', () => {
      expect(successorProblem({ ...facts, currentHeadEmployeeId: null })).toBe('SUCCESSOR_NEEDS_A_HEAD');
    });

    it('refuses the head themselves', () => {
      expect(successorProblem({ ...facts, candidateEmployeeId: 'head' })).toBe('SUCCESSOR_IS_THE_HEAD');
    });

    it('judges the day before the head, so a past day on a headless department is a date problem', () => {
      expect(successorProblem({ ...facts, effectiveFrom: '2026-10-01', currentHeadEmployeeId: null })).toBe(
        'SUCCESSOR_DATE_NOT_FUTURE',
      );
    });
  });

  describe('assertItAdminHasRoom (QĐ-110l: one IT Admin answers for at most four departments)', () => {
    it('keeps the limit at four', () => {
      expect(IT_ADMIN_DEPARTMENT_LIMIT).toBe(4);
    });

    it.each([[0], [1], [3]])('lets an IT Admin in charge of %i departments take one more', (inCharge) => {
      expect(() => assertItAdminHasRoom(inCharge)).not.toThrow();
    });

    it.each([[4], [5], [9]])('refuses the department after an IT Admin already answers for %i', (inCharge) => {
      expect(() => assertItAdminHasRoom(inCharge)).toThrow(DepartmentItAdminLimitReachedError);
    });
  });
});
