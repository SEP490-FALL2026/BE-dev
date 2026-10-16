import {
  canReceiveResetMail,
  checkRoleRequest,
  employeeHasNotLeft,
  forbidsCombination,
  isActionLinkRedeemable,
  isSelfChange,
  resolveEffectiveRoles,
  stopsLocking,
  validateRoleSet,
} from './account-policy';

describe('account policy', () => {
  describe('isActionLinkRedeemable (T-10)', () => {
    const now = new Date('2026-10-16T10:00:00.000Z');
    const fresh = {
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date('2026-10-16T11:00:00.000Z'),
      appUser: { status: 'ACTIVE' as const, activationState: 'INVITED' as const },
    };
    const reset = { ...fresh, appUser: { status: 'ACTIVE' as const, activationState: 'ACTIVATED' as const } };

    it('accepts an invitation for an invited, active account and a reset for an activated, active one', () => {
      expect(isActionLinkRedeemable({ ...fresh, purpose: 'INVITE' }, now)).toBe(true);
      expect(isActionLinkRedeemable({ ...reset, purpose: 'RESET_PASSWORD' }, now)).toBe(true);
    });

    it('does not let one purpose pass for the other (a reset needs an activated account, an invitation an invited one)', () => {
      expect(isActionLinkRedeemable({ ...reset, purpose: 'INVITE' }, now)).toBe(false);
      expect(isActionLinkRedeemable({ ...fresh, purpose: 'RESET_PASSWORD' }, now)).toBe(false);
    });

    it.each(['INVITE', 'RESET_PASSWORD'] as const)('refuses a used, revoked or expired %s link', (purpose) => {
      const base = purpose === 'INVITE' ? fresh : reset;

      expect(isActionLinkRedeemable({ ...base, purpose, consumedAt: now }, now)).toBe(false);
      expect(isActionLinkRedeemable({ ...base, purpose, revokedAt: now }, now)).toBe(false);
      expect(isActionLinkRedeemable({ ...base, purpose, expiresAt: now }, now)).toBe(false);
    });

    it.each(['INVITE', 'RESET_PASSWORD'] as const)('refuses a %s link for a locked account (AC-6)', (purpose) => {
      const base = purpose === 'INVITE' ? fresh : reset;

      expect(isActionLinkRedeemable({ ...base, purpose, appUser: { ...base.appUser, status: 'LOCKED' } }, now)).toBe(
        false,
      );
    });
  });

  describe('canReceiveResetMail (AC-3, AC-6)', () => {
    const activeAndActivated = { status: 'ACTIVE' as const, activationState: 'ACTIVATED' as const };

    it('is true only for an active, activated account whose employee has not left', () => {
      expect(canReceiveResetMail(activeAndActivated, { status: 'ACTIVE' })).toBe(true);
    });

    it('is false for a locked account, an invited one, a departed employee or a missing employee', () => {
      expect(canReceiveResetMail({ ...activeAndActivated, status: 'LOCKED' }, { status: 'ACTIVE' })).toBe(false);
      expect(canReceiveResetMail({ ...activeAndActivated, activationState: 'INVITED' }, { status: 'ACTIVE' })).toBe(
        false,
      );
      expect(canReceiveResetMail(activeAndActivated, { status: 'TERMINATED' })).toBe(false);
      expect(canReceiveResetMail(activeAndActivated, null)).toBe(false);
    });
  });

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

  describe('employeeHasNotLeft', () => {
    it('is false when there is no employee record', () => {
      expect(employeeHasNotLeft(null)).toBe(false);
      expect(employeeHasNotLeft(undefined)).toBe(false);
    });

    it('is true for an employee who is still active and false for one who left', () => {
      expect(employeeHasNotLeft({ status: 'ACTIVE' })).toBe(true);
      expect(employeeHasNotLeft({ status: 'TERMINATED' })).toBe(false);
    });
  });

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
