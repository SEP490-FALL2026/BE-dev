import { canReceiveResetMail } from './password-reset.policy';

describe('password reset policy', () => {
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
});
