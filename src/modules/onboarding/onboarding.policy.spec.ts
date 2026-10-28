import { OnboardingForbiddenError, assertMayReadChecklist } from './onboarding.policy';

describe('onboarding.policy (who reads the onboarding checklist, US-02-04, F13)', () => {
  it('lets the Super Admin, who does step 1, and the IT Admin, who does steps 2 to 5, read it', () => {
    expect(() => assertMayReadChecklist(['SUPER_ADMIN'])).not.toThrow();
    expect(() => assertMayReadChecklist(['IT_ADMIN'])).not.toThrow();
  });

  it.each([[['FINANCE']], [['MANAGER']], [['EMPLOYEE']], [[]]])('refuses %j', (roles) => {
    expect(() => assertMayReadChecklist(roles)).toThrow(OnboardingForbiddenError);
  });
});
