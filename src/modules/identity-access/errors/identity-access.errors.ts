import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';

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

// --- account management (slice 1b) --------------------------------------------------

export class AccountNotFoundError extends Error {
  constructor() {
    super('Account not found.');
    this.name = 'AccountNotFoundError';
  }
}

/** US-01-01 AC-13: nobody changes their own account. */
export class SelfChangeForbiddenError extends Error {
  constructor() {
    super('You cannot change your own account.');
    this.name = 'SelfChangeForbiddenError';
  }
}

export class RoleRequestRefusedError extends Error {
  constructor(readonly reason: 'ROLE_DERIVED' | 'SUPER_ADMIN_TRANSFER_ONLY') {
    super(`The role cannot be granted by hand: ${reason}.`);
    this.name = 'RoleRequestRefusedError';
  }
}

export class EmployeeTerminatedError extends Error {
  constructor() {
    super('The employee has left; no account can be created or invited.');
    this.name = 'EmployeeTerminatedError';
  }
}

export class AccountAlreadyExistsError extends Error {
  constructor() {
    super('The employee already has an account.');
    this.name = 'AccountAlreadyExistsError';
  }
}

export class LoginEmailTakenError extends Error {
  constructor() {
    super('The login email is already used by another account.');
    this.name = 'LoginEmailTakenError';
  }
}

export class LoginEmailRequiredError extends Error {
  constructor() {
    super('The employee has no work email and none was supplied.');
    this.name = 'LoginEmailRequiredError';
  }
}

export class LoginEmailInvalidError extends Error {
  constructor() {
    super('The login email is not a valid address.');
    this.name = 'LoginEmailInvalidError';
  }
}

export class AccountAlreadyActivatedError extends Error {
  constructor() {
    super('The account is already activated.');
    this.name = 'AccountAlreadyActivatedError';
  }
}

export class AccountLockedError extends Error {
  constructor() {
    super('The account is locked.');
    this.name = 'AccountLockedError';
  }
}

export class SuperAdminHolderNotLockableError extends Error {
  constructor() {
    super('The account holding SUPER_ADMIN cannot be locked.');
    this.name = 'SuperAdminHolderNotLockableError';
  }
}

export class RoleAlreadyGrantedError extends Error {
  constructor() {
    super('The account already holds this role.');
    this.name = 'RoleAlreadyGrantedError';
  }
}

export class RoleNotGrantedError extends Error {
  constructor() {
    super('The account does not hold this role.');
    this.name = 'RoleNotGrantedError';
  }
}

export class RoleCombinationForbiddenError extends Error {
  constructor() {
    super('This role cannot be combined with the roles the account holds.');
    this.name = 'RoleCombinationForbiddenError';
  }
}

export class FinanceAlreadyAssignedError extends Error {
  constructor() {
    super('Another account already holds the FINANCE role.');
    this.name = 'FinanceAlreadyAssignedError';
  }
}

/** One outcome for every reason a link cannot be used (unknown, used, replaced, expired, locked, left). */
export class InvitationInvalidError extends Error {
  constructor() {
    super('The invitation link is not valid.');
    this.name = 'InvitationInvalidError';
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

/** Maps a constraint that caught a race to the same business error the pre-checks give. */
export function translateAccountWriteError(error: unknown): unknown {
  if (isUniqueViolation(error, 'role_grants_one_finance')) return new FinanceAlreadyAssignedError();
  if (isUniqueViolation(error, 'role_grants_one_effective_per_role')) return new RoleAlreadyGrantedError();
  if (isUniqueViolation(error, 'app_users_employee_id_key')) return new AccountAlreadyExistsError();
  if (isUniqueViolation(error, 'app_users_organization_id_normalized_login_email_key', 'normalized_login_email')) {
    return new LoginEmailTakenError();
  }
  if (isCheckViolation(error)) return new RoleCombinationForbiddenError();

  return error;
}
