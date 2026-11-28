/** The installation phase is closed; machines can no longer be entered with initial records. */
export class DeviceInitializationClosedError extends Error {
  constructor() {
    super('The installation phase is closed; machines can no longer be entered with initial records.');
    this.name = 'DeviceInitializationClosedError';
  }
}

/** A legacy asset code must be 3 to 20 uppercase letters, digits, or hyphens and cannot match generated codes. */
export class DeviceAssetCodeInvalidError extends Error {
  constructor() {
    super('The asset code must be 3 to 20 uppercase letters, digits, or hyphens and not in generated form.');
    this.name = 'DeviceAssetCodeInvalidError';
  }
}
