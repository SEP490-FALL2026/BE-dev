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

/** The password given as the current one is not the account's password (AC-5, AC-7). */
export class CurrentPasswordInvalidError extends Error {
  constructor() {
    super('The current password is not correct.');
    this.name = 'CurrentPasswordInvalidError';
  }
}

/** The account stopped being usable between the guard and the change (locked, or its employee left). */
export class AccountNoLongerUsableError extends Error {
  constructor() {
    super('The account can no longer be used.');
    this.name = 'AccountNoLongerUsableError';
  }
}

/** One outcome for every reason a reset link cannot be used (unknown, used, replaced, expired, locked, left). */
export class PasswordResetInvalidError extends Error {
  constructor() {
    super('The password reset link is not valid.');
    this.name = 'PasswordResetInvalidError';
  }
}
