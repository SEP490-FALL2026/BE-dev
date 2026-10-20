import { employeeHasNotLeft, isActionLinkRedeemable } from './account-policy';

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
});
