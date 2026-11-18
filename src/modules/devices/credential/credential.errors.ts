/** The code is not a code that can be used now: unknown, mistyped, expired, used up, or for a registration that is no longer open. One answer for all. */
export class DeviceEnrollmentCodeInvalidError extends Error {
  constructor() {
    super('The enrollment code cannot be used.');
    this.name = 'DeviceEnrollmentCodeInvalidError';
  }
}

export class DeviceCredentialNotFoundError extends Error {
  constructor() {
    super('The credential does not exist.');
    this.name = 'DeviceCredentialNotFoundError';
  }
}

export class DeviceCredentialAlreadyRevokedError extends Error {
  constructor() {
    super('The credential is revoked already.');
    this.name = 'DeviceCredentialAlreadyRevokedError';
  }
}

/** The registration a code is asked for does not exist. */
export class CredentialRegistrationNotFoundError extends Error {
  constructor() {
    super('The registration does not exist.');
    this.name = 'CredentialRegistrationNotFoundError';
  }
}

export class CredentialRegistrationEndedError extends Error {
  constructor() {
    super('The registration has ended.');
    this.name = 'CredentialRegistrationEndedError';
  }
}

/** The signed `BM-06` of the registration is not kept: no code is made before the holder has signed. */
export class CredentialSignatureRecordMissingError extends Error {
  constructor() {
    super('The signed notice of this registration is not kept yet.');
    this.name = 'CredentialSignatureRecordMissingError';
  }
}

/** The secret of the request does not match, found again under the lock that makes the rotation. */
export class DeviceCredentialInvalidError extends Error {
  constructor() {
    super('The device credential is not valid.');
    this.name = 'DeviceCredentialInvalidError';
  }
}

export class DeviceCredentialExpiredError extends Error {
  constructor() {
    super('The device credential has expired.');
    this.name = 'DeviceCredentialExpiredError';
  }
}
