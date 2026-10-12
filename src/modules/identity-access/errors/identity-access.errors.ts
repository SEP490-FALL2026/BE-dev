/** Same outcome for every reason a login fails (US-01-01 AC-10): the caller learns nothing. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('The email or password is not valid.');
    this.name = 'InvalidCredentialsError';
  }
}

export class LoginTemporarilyBlockedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many failed sign-in attempts. Try again later.');
    this.name = 'LoginTemporarilyBlockedError';
  }
}

/** The presented refresh token does not identify a usable session. */
export class SessionInvalidError extends Error {
  constructor() {
    super('The session is not valid.');
    this.name = 'SessionInvalidError';
  }
}

export class PasswordPolicyError extends Error {
  constructor(readonly violation: string) {
    super(`The password does not meet the policy: ${violation}`);
    this.name = 'PasswordPolicyError';
  }
}
