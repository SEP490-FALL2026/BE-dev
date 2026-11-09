import { authorizingRoles } from './effective-roles.policy';

describe('effective roles policy', () => {
  describe('authorizingRoles (US-01-02 AC-3, AC-10; QĐ-93a)', () => {
    it('keeps MANAGER only for a head today', () => {
      expect(authorizingRoles(['EMPLOYEE', 'MANAGER'], true)).toEqual(['EMPLOYEE', 'MANAGER']);
      expect(authorizingRoles(['EMPLOYEE', 'MANAGER'], false)).toEqual(['EMPLOYEE']);
      expect(authorizingRoles(['MANAGER'], false)).toEqual([]);
    });

    it('never derives a role: heading a department gives no MANAGER, and the data gives no SPENDING_APPROVER', () => {
      expect(authorizingRoles(['EMPLOYEE'], true)).toEqual(['EMPLOYEE']);
      expect(authorizingRoles([], true)).toEqual([]);
      expect(authorizingRoles(['IT_ADMIN'], false)).toEqual(['IT_ADMIN']);
    });

    it('keeps every other granted role whether or not the person heads a department', () => {
      expect(authorizingRoles(['SPENDING_APPROVER'], false)).toEqual(['SPENDING_APPROVER']);
      expect(authorizingRoles(['SUPER_ADMIN'], true)).toEqual(['SUPER_ADMIN']);
      expect(authorizingRoles(['FINANCE', 'EMPLOYEE'], false)).toEqual(['EMPLOYEE', 'FINANCE']);
    });

    it('returns the roles sorted and without duplicates', () => {
      expect(authorizingRoles(['MANAGER', 'EMPLOYEE', 'MANAGER'], true)).toEqual(['EMPLOYEE', 'MANAGER']);
    });
  });
});
