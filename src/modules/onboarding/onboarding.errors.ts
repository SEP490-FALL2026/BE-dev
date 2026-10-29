/** Only the Super Admin and the IT Admin read the onboarding checklist (`US-02-04`, `F13`). */
export class OnboardingForbiddenError extends Error {
  constructor() {
    super('Only the Super Admin and the IT Admin read the onboarding checklist.');
    this.name = 'OnboardingForbiddenError';
  }
}
