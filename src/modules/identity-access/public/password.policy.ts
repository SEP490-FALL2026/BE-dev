import { checkPasswordPolicy as check } from '../credentials/password.policy';

/** Public pure wrapper; credential creation and CLI preflight use the same canonical policy. */
export function checkPasswordPolicy(password: string, loginEmail: string): ReturnType<typeof check> {
  return check(password, loginEmail);
}
