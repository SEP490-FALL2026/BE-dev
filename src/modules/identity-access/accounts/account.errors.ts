import type { AppRole } from '../public/identity-access.types';

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
    super(
      reason === 'SUPER_ADMIN_TRANSFER_ONLY'
        ? 'The Super Admin role cannot be granted or revoked in the application; it changes only by the operations command outside it.'
        : `The role cannot be granted by hand: ${reason}.`,
    );
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
  /** The roles the account holds that stand in the way (empty when only the database could say: a write around the service). */
  constructor(readonly conflictingRoles: readonly AppRole[] = []) {
    super('This role cannot be combined with the roles the account holds.');
    this.name = 'RoleCombinationForbiddenError';
  }
}

/** The periods that keep MANAGER in place, as the refusal shows them (`QĐ-93a`, US-01-01 AC-21). */
export interface HeadPeriodDetail {
  departmentId: string;
  departmentCode: string;
  validFrom: string;
  validTo: string | null;
  timing: 'CURRENT' | 'UPCOMING';
}

export class ManagerStillHeadingError extends Error {
  constructor(readonly headPeriods: readonly HeadPeriodDetail[] = []) {
    super(
      'The account heads a department, will head one from a later day, or is named as a successor: end or take back that period before revoking MANAGER.',
    );
    this.name = 'ManagerStillHeadingError';
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
