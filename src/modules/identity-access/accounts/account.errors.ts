import type { SuccessorProblem } from './successor-eligibility';

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

export type SuperAdminTransferProblem = SuccessorProblem | 'NOT_HOLDER' | 'SUCCESSOR_IS_HOLDER';

/** The transfer cannot happen; nothing was changed and nothing was recorded (US-01-09 AC-3, AC-5). */
export class SuperAdminTransferRefusedError extends Error {
  constructor(readonly problem: SuperAdminTransferProblem) {
    super(`The Super Admin role cannot be transferred: ${problem}.`);
    this.name = 'SuperAdminTransferRefusedError';
  }
}
