/** The person who is to hold the machine does not exist. */
export class DeviceHolderNotFoundError extends Error {
  constructor() {
    super('The holder does not exist.');
    this.name = 'DeviceHolderNotFoundError';
  }
}

/** The holder has left, or is handing over their work: a machine is not registered to them. */
export class DeviceHolderNotWorkingError extends Error {
  constructor() {
    super('A machine is registered to a person who works here.');
    this.name = 'DeviceHolderNotWorkingError';
  }
}

export class DeviceAssetCodeTakenError extends Error {
  constructor() {
    super('The asset code is already used by another machine.');
    this.name = 'DeviceAssetCodeTakenError';
  }
}

/** Two registrations of one machine would cover the same days. */
export class DeviceRegistrationOverlapError extends Error {
  constructor() {
    super('The machine already has a registration over those days.');
    this.name = 'DeviceRegistrationOverlapError';
  }
}

export class DeviceHandoverDateInvalidError extends Error {
  constructor() {
    super('The handover day must be between the hire date of the holder and today.');
    this.name = 'DeviceHandoverDateInvalidError';
  }
}

export class DeviceAlreadyRetiredError extends Error {
  constructor() {
    super('The machine is retired.');
    this.name = 'DeviceAlreadyRetiredError';
  }
}

export class DeviceHolderUnchangedError extends Error {
  constructor() {
    super('That person already holds the machine.');
    this.name = 'DeviceHolderUnchangedError';
  }
}

/** The registration does not exist, or is not the caller's to see. */
export class DeviceRegistrationNotFoundError extends Error {
  constructor() {
    super('The registration does not exist.');
    this.name = 'DeviceRegistrationNotFoundError';
  }
}

export class DeviceRegistrationEndedError extends Error {
  constructor() {
    super('The registration has ended.');
    this.name = 'DeviceRegistrationEndedError';
  }
}

export class DeviceSignatureNoticeVersionNotFoundError extends Error {
  constructor() {
    super('The version of the notice does not exist.');
    this.name = 'DeviceSignatureNoticeVersionNotFoundError';
  }
}
