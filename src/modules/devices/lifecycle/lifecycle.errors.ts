export class DeviceVoidedError extends Error {
  constructor() {
    super('The machine record has been voided.');
    this.name = 'DeviceVoidedError';
  }
}

export class DeviceAwaitingReturnError extends Error {
  constructor() {
    super('The machine has an open return task from an offboarding case.');
    this.name = 'DeviceAwaitingReturnError';
  }
}

export class DeviceNotUsableError extends Error {
  constructor() {
    super('Only a usable machine can be assigned or receive new activations.');
    this.name = 'DeviceNotUsableError';
  }
}

export class DeviceNotHeldError extends Error {
  constructor() {
    super('The machine is already in stock without an open holding or return task.');
    this.name = 'DeviceNotHeldError';
  }
}

export class DeviceSoftwareRemovalRequiredError extends Error {
  constructor() {
    super('Software removal confirmation is required when taking a machine back from a holder.');
    this.name = 'DeviceSoftwareRemovalRequiredError';
  }
}

export class DeviceSoftwareRemovalNoteRequiredError extends Error {
  constructor() {
    super('A note explaining why software is not removable is required.');
    this.name = 'DeviceSoftwareRemovalNoteRequiredError';
  }
}

export class DeviceReturnTaskNotInChargeError extends Error {
  constructor() {
    super('Only an acting IT Admin of the return task department may complete or return this machine.');
    this.name = 'DeviceReturnTaskNotInChargeError';
  }
}

export class DeviceConditionUnchangedError extends Error {
  constructor() {
    super('The machine already has that condition.');
    this.name = 'DeviceConditionUnchangedError';
  }
}

export class DeviceSameDeviceError extends Error {
  constructor() {
    super('The target machine must differ from the source machine.');
    this.name = 'DeviceSameDeviceError';
  }
}
