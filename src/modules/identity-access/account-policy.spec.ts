import { checkRoleRequest, forbidsCombination, isSelfChange, stopsLocking, validateRoleSet } from './account-policy';

describe('account policy', () => {
  describe('checkRoleRequest', () => {
    it.each(['IT_ADMIN', 'FINANCE', 'EMPLOYEE'] as const)('accepts a hand-granted %s', (role) => {
      expect(checkRoleRequest(role)).toBeNull();
    });

    it.each(['MANAGER', 'SPENDING_APPROVER'] as const)(
      'refuses %s, which is derived and never granted (AC-4)',
      (role) => {
        expect(checkRoleRequest(role)).toBe('ROLE_DERIVED');
      },
    );

    it('refuses SUPER_ADMIN, which only moves by transfer (AC-14)', () => {
      expect(checkRoleRequest('SUPER_ADMIN')).toBe('SUPER_ADMIN_TRANSFER_ONLY');
    });
  });

  describe('forbidsCombination (FR-8.7)', () => {
    it('forbids SUPER_ADMIN together with IT_ADMIN or FINANCE, in either order', () => {
      expect(forbidsCombination(['SUPER_ADMIN'], 'IT_ADMIN')).toBe(true);
      expect(forbidsCombination(['SUPER_ADMIN'], 'FINANCE')).toBe(true);
      expect(forbidsCombination(['IT_ADMIN'], 'SUPER_ADMIN')).toBe(true);
      expect(forbidsCombination(['FINANCE', 'EMPLOYEE'], 'SUPER_ADMIN')).toBe(true);
    });

    it('allows everything else, including EMPLOYEE beside any role and IT_ADMIN beside FINANCE', () => {
      expect(forbidsCombination(['SUPER_ADMIN'], 'EMPLOYEE')).toBe(false);
      expect(forbidsCombination(['IT_ADMIN'], 'FINANCE')).toBe(false);
      expect(forbidsCombination([], 'IT_ADMIN')).toBe(false);
    });
  });

  describe('validateRoleSet', () => {
    it('reports the first violation for a set requested at creation', () => {
      expect(validateRoleSet([])).toBeNull();
      expect(validateRoleSet(['IT_ADMIN', 'EMPLOYEE'])).toBeNull();
      expect(validateRoleSet(['IT_ADMIN', 'MANAGER'])).toBe('ROLE_DERIVED');
      expect(validateRoleSet(['SUPER_ADMIN', 'IT_ADMIN'])).toBe('SUPER_ADMIN_TRANSFER_ONLY');
    });

    it('treats a repeated role as one', () => {
      expect(validateRoleSet(['EMPLOYEE', 'EMPLOYEE'])).toBeNull();
    });
  });

  describe('isSelfChange (AC-13)', () => {
    it('is true only for the caller own account', () => {
      expect(isSelfChange('a', 'a')).toBe(true);
      expect(isSelfChange('a', 'b')).toBe(false);
    });
  });

  describe('stopsLocking (AC-15, FR-8.10(b))', () => {
    it('stops locking the account that holds SUPER_ADMIN, independently of who asks', () => {
      expect(stopsLocking(['SUPER_ADMIN'])).toBe(true);
      expect(stopsLocking(['IT_ADMIN', 'EMPLOYEE'])).toBe(false);
      expect(stopsLocking([])).toBe(false);
    });
  });
});
