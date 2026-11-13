import { PlanAdminConsoleNotApplicableError } from './plan.errors';
import { assertAdminConsoleApplicable, needsVendorAdmins } from './plan-vendor-admins.policy';

describe('plan-vendor-admins.policy (QĐ-110k, QĐ-110u, R-53: which plans need admins at the vendor)', () => {
  describe('assertAdminConsoleApplicable: the flag "has an admin console" is a K4 plan’s alone', () => {
    it.each([['K4']] as const)('lets a %s plan say it, either way', (type) => {
      expect(() => assertAdminConsoleApplicable(type, true)).not.toThrow();
      expect(() => assertAdminConsoleApplicable(type, false)).not.toThrow();
    });

    it.each([['K1'], ['K2'], ['K3'], ['K5']] as const)(
      'refuses a %s plan that gives the flag, true or false',
      (type) => {
        expect(() => assertAdminConsoleApplicable(type, true)).toThrow(PlanAdminConsoleNotApplicableError);
        expect(() => assertAdminConsoleApplicable(type, false)).toThrow(PlanAdminConsoleNotApplicableError);
      },
    );

    it('accepts a plan of any kind that does not give the flag', () => {
      for (const type of ['K1', 'K2', 'K3', 'K4', 'K5'] as const)
        expect(() => assertAdminConsoleApplicable(type, undefined)).not.toThrow();
    });
  });

  describe('needsVendorAdmins: a K2 plan always, a K4 plan only with an admin console, no other', () => {
    it.each([
      ['K2', false, true],
      ['K2', true, true],
      ['K4', true, true],
      ['K4', false, false],
      ['K1', false, false],
      ['K5', false, false],
      ['K3', false, false],
    ] as const)('a %s plan with the flag %s needs them: %s', (type, hasAdminConsole, needs) => {
      expect(needsVendorAdmins(type, hasAdminConsole)).toBe(needs);
    });
  });
});
