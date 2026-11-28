export class DeviceActivationNotFoundError extends Error {
  constructor() {
    super('The device activation does not exist.');
    this.name = 'DeviceActivationNotFoundError';
  }
}

export class DeviceActivationPlanNotFoundError extends Error {
  constructor() {
    super('The plan does not exist or is retired.');
    this.name = 'DeviceActivationPlanNotFoundError';
  }
}

export class DeviceActivationPlanNotDeviceBoundError extends Error {
  constructor() {
    super('Only device-bound K4 plans may be activated on a machine.');
    this.name = 'DeviceActivationPlanNotDeviceBoundError';
  }
}

export class DeviceActivationKeyNotAllowedError extends Error {
  constructor() {
    super('A bundled device plan cannot take a license key.');
    this.name = 'DeviceActivationKeyNotAllowedError';
  }
}

export class DeviceActivationKeyRequiredError extends Error {
  constructor() {
    super('A license key is required for a keyed device plan.');
    this.name = 'DeviceActivationKeyRequiredError';
  }
}

export class DeviceActivationKeyNotFoundError extends Error {
  constructor() {
    super('The license key does not exist.');
    this.name = 'DeviceActivationKeyNotFoundError';
  }
}

export class DeviceActivationKeyNotOfPlanError extends Error {
  constructor() {
    super('The license key belongs to a different plan.');
    this.name = 'DeviceActivationKeyNotOfPlanError';
  }
}

export class DeviceActivationPurchaseNotActiveError extends Error {
  constructor() {
    super('The perpetual purchase for this key is not active.');
    this.name = 'DeviceActivationPurchaseNotActiveError';
  }
}

export class DeviceActivationKeyWithdrawnError extends Error {
  constructor() {
    super('The license key has been withdrawn from the store.');
    this.name = 'DeviceActivationKeyWithdrawnError';
  }
}

export class DeviceActivationLotFullError extends Error {
  constructor() {
    super('All licenses purchased in this lot are currently occupied.');
    this.name = 'DeviceActivationLotFullError';
  }
}

export class DeviceActivationAlreadyOnDeviceError extends Error {
  constructor() {
    super('The machine already has an open activation for this plan.');
    this.name = 'DeviceActivationAlreadyOnDeviceError';
  }
}

export class DeviceActivationAlreadyClosedError extends Error {
  constructor() {
    super('The device activation is already closed.');
    this.name = 'DeviceActivationAlreadyClosedError';
  }
}

export class DeviceActivationReleaseNotApplicableError extends Error {
  constructor() {
    super('License release decisions apply only to keyed device activations.');
    this.name = 'DeviceActivationReleaseNotApplicableError';
  }
}

export class DeviceActivationNotMovableError extends Error {
  constructor() {
    super('Bundled device activations cannot be moved to another machine.');
    this.name = 'DeviceActivationNotMovableError';
  }
}

export class DeviceActivationNotOnDeviceError extends Error {
  constructor() {
    super('The device activation does not belong to this machine.');
    this.name = 'DeviceActivationNotOnDeviceError';
  }
}
