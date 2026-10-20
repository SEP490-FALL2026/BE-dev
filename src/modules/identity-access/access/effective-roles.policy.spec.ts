import { resolveEffectiveRoles } from './effective-roles.policy';

describe('effective roles policy', () => {
  describe('resolveEffectiveRoles (US-01-02, US-01-03)', () => {
    it('adds MANAGER for the head of a department and SPENDING_APPROVER for the configured approver, never as a grant', () => {
      expect(resolveEffectiveRoles(['EMPLOYEE'], { headsDepartment: true, isSpendingApprover: true })).toEqual({
        direct: ['EMPLOYEE'],
        derived: ['MANAGER', 'SPENDING_APPROVER'],
        effective: ['EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER'],
      });
    });

    it('adds nothing when the facts are false or unknown', () => {
      expect(resolveEffectiveRoles(['IT_ADMIN'])).toEqual({
        direct: ['IT_ADMIN'],
        derived: [],
        effective: ['IT_ADMIN'],
      });
      expect(resolveEffectiveRoles([], { headsDepartment: false, isSpendingApprover: false }).derived).toEqual([]);
    });

    it('never derives a role for the Super Admin, whatever the data says (FR-8.7, US-01-03 AC-2)', () => {
      expect(resolveEffectiveRoles(['SUPER_ADMIN'], { headsDepartment: true, isSpendingApprover: true })).toEqual({
        direct: ['SUPER_ADMIN'],
        derived: [],
        effective: ['SUPER_ADMIN'],
      });
    });
  });
});
