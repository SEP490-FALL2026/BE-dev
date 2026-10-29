import { OnboardingForbiddenError } from './onboarding.errors';

/*
 * Who reads the onboarding checklist (`US-02-04`), decided in the service so no route is the only thing between a caller and the
 * data (`F13`): the Super Admin, who does step 1 (the organization and its people), and the IT Admin, who does steps 2 to 5. Nobody
 * else sees it. Pure: no store, no clock.
 */

/** Throws OnboardingForbiddenError unless the caller is the Super Admin or the IT Admin. */
export function assertMayReadChecklist(roles: readonly string[]): void {
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('IT_ADMIN')) throw new OnboardingForbiddenError();
}
