import { checkRoleRequest, isSelfChange, stopsLocking } from './account-administration.policy';

describe('account administration policy', () => {
  describe('checkRoleRequest', () => {
    it.each(['IT_ADMIN', 'FINANCE', 'EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER'] as const)(
      'accepts a hand-granted %s (US-01-01 AC-4, US-01-03 AC-1): the rules of the role are in the grant, not here',
      (role) => {
        expect(checkRoleRequest(role)).toBeNull();
      },
    );

    it('refuses SUPER_ADMIN, which only moves by transfer (AC-14)', () => {
      expect(checkRoleRequest('SUPER_ADMIN')).toBe('SUPER_ADMIN_TRANSFER_ONLY');
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
