/** The workspace does not exist. */
export class WorkspaceNotFoundError extends Error {
  constructor() {
    super('The workspace does not exist.');
    this.name = 'WorkspaceNotFoundError';
  }
}

/** The company already holds a workspace of this name at this vendor (the name is compared ignoring case and accents). */
export class WorkspaceNameTakenError extends Error {
  constructor() {
    super('A workspace with this name already exists at this vendor.');
    this.name = 'WorkspaceNameTakenError';
  }
}

/** Only the IT Admin who answers for a workspace edits it (`QĐ-118f`): another IT Admin does not stand in for them. */
export class WorkspaceNotResponsibleError extends Error {
  constructor() {
    super('Only the IT Admin who answers for the workspace can change it.');
    this.name = 'WorkspaceNotResponsibleError';
  }
}

/** The workspace changed since the caller read it (`expectedUpdatedAt` no longer matches). */
export class WorkspaceStaleError extends Error {
  constructor(readonly currentUpdatedAt: Date) {
    super('The workspace was changed by someone else since it was read: read it again before editing.');
    this.name = 'WorkspaceStaleError';
  }
}

/** A person named as an administrator (or as the holder of the emergency account) is not an IT Admin who works now. */
export class WorkspaceAdminNotItAdminError extends Error {
  constructor(readonly employeeId: string) {
    super('Every person named for a workspace must be an IT Admin with an account that can sign in.');
    this.name = 'WorkspaceAdminNotItAdminError';
  }
}

/** The primary owner is not listed among the administrators as an owner. */
export class WorkspacePrimaryOwnerNotAdminError extends Error {
  constructor() {
    super('The primary owner must be listed among the administrators with the role OWNER.');
    this.name = 'WorkspacePrimaryOwnerNotAdminError';
  }
}

/** Fewer different people administer the workspace than the vendor account needs (`QĐ-110k`): one may leave and it stays reachable. */
export class WorkspaceAdminsTooFewError extends Error {
  constructor(
    readonly given: number,
    readonly minimum: number,
  ) {
    super('At least two different IT Admins must administer a workspace.');
    this.name = 'WorkspaceAdminsTooFewError';
  }
}

/** More owners or more administrators are named than the limit the vendor sets for the workspace. */
export class WorkspaceLimitExceededError extends Error {
  constructor(readonly role: 'OWNER' | 'ADMIN') {
    super(`More ${role === 'OWNER' ? 'owners' : 'administrators'} are named than the limit of the workspace allows.`);
    this.name = 'WorkspaceLimitExceededError';
  }
}

/** The person named to answer for the workspace is not an IT Admin who works now. */
export class WorkspaceResponsibleNotItAdminError extends Error {
  constructor() {
    super('The IT Admin who answers for a workspace must work now and hold the IT Admin role.');
    this.name = 'WorkspaceResponsibleNotItAdminError';
  }
}

/** A free-text field of the workspace is longer than allowed, or the emergency account names no identity. */
export class WorkspaceTextInvalidError extends Error {
  constructor() {
    super('A text of the workspace is empty where it must say something, or too long.');
    this.name = 'WorkspaceTextInvalidError';
  }
}
