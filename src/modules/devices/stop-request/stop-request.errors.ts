/** The request to stop collection does not exist. */
export class DeviceStopRequestNotFoundError extends Error {
  constructor() {
    super('The request to stop collection does not exist.');
    this.name = 'DeviceStopRequestNotFoundError';
  }
}

/** The request is not waiting any more: completed already, or closed by the system as invalid. */
export class DeviceStopRequestNotOpenError extends Error {
  constructor(readonly state: 'COMPLETED' | 'INVALID') {
    super('The request to stop collection is not open.');
    this.name = 'DeviceStopRequestNotOpenError';
  }
}

/** Another request of the registration became open between the check and the write: the unique index of open requests refused this one. */
export class DeviceStopRequestOpenRaceError extends Error {
  constructor() {
    super('Another request to stop collection of this registration was received at the same moment.');
    this.name = 'DeviceStopRequestOpenRaceError';
  }
}

/** The caller is not an acting IT Admin of the holder department. */
export class DeviceStopRequestNotInChargeError extends Error {
  constructor() {
    super('Only the acting IT Admin of the department may complete this request to stop collection.');
    this.name = 'DeviceStopRequestNotInChargeError';
  }
}
