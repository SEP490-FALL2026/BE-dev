/**
 * The machine is not in the register (kept even after it is retired). The one definition of this answer: a slice that reads a
 * device by id throws this class and maps it to the same `DEVICE.NOT_FOUND`, it never makes a second one.
 */
export class DeviceNotFoundError extends Error {
  constructor() {
    super('The device does not exist.');
    this.name = 'DeviceNotFoundError';
  }
}

/**
 * The credential was revoked, or the registration it is bound to ended, between the guard that let the request in and the
 * transaction that acts on it. The intake maps it to the same 401 `DEVICE.CREDENTIAL_REVOKED` the guard gives, so the tool
 * deletes its credential in both cases.
 */
export class DeviceCredentialRevokedError extends Error {
  constructor() {
    super('The device credential was revoked.');
    this.name = 'DeviceCredentialRevokedError';
  }
}
