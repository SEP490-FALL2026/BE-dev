/** An update names no field to change: the version alone is not an edit. */
export class DeviceUpdateEmptyError extends Error {
  constructor() {
    super('Name at least one field of the machine to change.');
    this.name = 'DeviceUpdateEmptyError';
  }
}

/** A machine taken out of use, or a record that was voided, is not corrected any more. */
export class DeviceNotEditableError extends Error {
  constructor(readonly reason: 'RETIRED' | 'VOIDED') {
    super('A machine that was taken out of use or voided is not corrected any more.');
    this.name = 'DeviceNotEditableError';
  }
}

/** The machine changed since the caller read it (`expectedUpdatedAt` no longer matches). */
export class DeviceStaleError extends Error {
  constructor(readonly currentUpdatedAt: Date) {
    super('The machine was changed by someone else since it was read: read it again before editing.');
    this.name = 'DeviceStaleError';
  }
}

/** Another machine of the organization has this serial number (the search key is unique). */
export class DeviceSerialNumberTakenError extends Error {
  constructor() {
    super('The serial number is already used by another machine.');
    this.name = 'DeviceSerialNumberTakenError';
  }
}
